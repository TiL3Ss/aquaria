// src/app/dashboard/actions.ts

'use server'

import { revalidatePath } from 'next/cache'
import { redirect }        from 'next/navigation'
import { createClient }    from '@/utils/supabase/server'
import type { Shift, LogFull, CustomChecklistTask } from '@/types'
import { CHECKLIST_ITEMS } from '@/types'

/* ─────────────────────────────────────────────────────────
   LOGS
───────────────────────────────────────────────────────── */

export async function getLogsForMonth(
  moduleSlug: string,
  year: number,
  month: number
): Promise<Record<string, Record<Shift, boolean>>> {
  const supabase = await createClient()
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const { data: module } = await supabase
    .from('modules').select('id').eq('slug', moduleSlug.toLowerCase()).single()
  if (!module) return {}

  const { data: logs } = await supabase
    .from('logs').select('log_date, shift')
    .eq('module_id', module.id).gte('log_date', startDate).lte('log_date', endDate)

  const result: Record<string, Record<Shift, boolean>> = {}
  logs?.forEach((log) => {
    if (!result[log.log_date]) result[log.log_date] = { noche: false, dia: false, tarde: false }
    result[log.log_date][log.shift as Shift] = true
  })
  return result
}

export async function getLog(moduleSlug: string, date: string, shift: Shift): Promise<LogFull | null> {
  const supabase = await createClient()

  const { data: module } = await supabase
    .from('modules').select('id').eq('slug', moduleSlug.toLowerCase()).single()
  if (!module) return null

  const { data: log } = await supabase
    .from('logs')
    .select('*, profiles(full_name, rut), modules(name, slug)')
    .eq('module_id', module.id).eq('log_date', date).eq('shift', shift).single()
  if (!log) return null

  const [
    { data: parameters },
    { data: checklist  },
    { data: fisicoquimicos },
    { data: pozo },
  ] = await Promise.all([
    supabase.from('log_parameters')     .select('*').eq('log_id', log.id).single(),
    supabase.from('checklist_responses').select('*').eq('log_id', log.id),
    supabase.from('fisicoquimicos')     .select('*').eq('log_id', log.id),
    supabase.from('pozo_readings')      .select('*').eq('log_id', log.id),
  ])

  return {
    log,
    parameters:     parameters    ?? null,
    checklist:      checklist      ?? [],
    fisicoquimicos: fisicoquimicos ?? [],
    pozo:           pozo           ?? [],
  }
}

export async function createLog(data: Record<string, unknown>) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const moduleSlug   = data.module_slug   as string
  const date         = data.log_date      as string
  const shift        = data.shift         as Shift
  const operatorName = data.operator_name as string
  const notes        = data.notes         as string

  const { data: module } = await supabase
    .from('modules').select('id').eq('slug', moduleSlug.toLowerCase()).single()
  if (!module) return { error: 'Módulo no encontrado' }

  const { data: log, error: logError } = await supabase
    .from('logs')
    .insert({
      user_id:               user.id,
      module_id:             module.id,
      log_date:              date,
      shift,
      operator_name:         operatorName,
      notes:                 notes || null,
      additional_operators:  data.additional_operators as string | null,
    })
    .select().single()

  if (logError) {
    if (logError.code === '23505') return { error: 'Ya existe una bitácora para ese turno' }
    return { error: logError.message }
  }

  // Parámetros
  await supabase.from('log_parameters').insert({
    log_id:             log.id,
    pump_main_bar:      data.pump_main_bar      as number | null,
    pump_biofilter_bar: data.pump_biofilter_bar as number | null,
    flowmeter_lpm:      data.flowmeter_lpm      as number | null,
    flowmeter_room_lpm: data.flowmeter_room_lpm as number | null,
    buffer_tank_bar:    data.buffer_tank_bar    as number | null,
    water_intake:       data.water_intake       as number | null,
    ozone_pct:          data.ozone_pct          as number | null,
    intake_value:       data.intake_value       as number | null,
    osmosis_value:      data.osmosis_value      as string | null,
    ph_ff:              data.ph_ff              as number | null,
    salinity_ff:        data.salinity_ff        as number | null,
    orp_ff:             data.orp_ff             as number | null,
    bicarbonate_kg:     data.bicarbonate_kg     as number | null,
    chloride_kg:        data.chloride_kg        as number | null,
    well_level:         data.well_level         as string | null,
    chemical_b_kg:      data.chemical_b_kg      as number | null,
    chemical_cc:        data.chemical_cc        as number | null,
    metabisulfite:      data.metabisulfite      as number | null,
    feeding_type:       data.feeding_type       as string | null,
    feeding_amount:     data.feeding_amount     as number | null,
  })

  // Checklist
  const checklistKeys = data.checklist_keys as string[]
  if (checklistKeys?.length > 0) {
    await supabase.from('checklist_responses').insert(
      checklistKeys.map(key => ({
        log_id:   log.id,
        item_key: key,
        checked:  (data[`check_${key}`] as boolean) ?? false,
      }))
    )
  }

  // Fisicoquímicos — solo filas con al menos un valor real
  const fqEntries = data.fisicoquimicos as Record<string, unknown>[]
  if (fqEntries?.length > 0) {
    const nonEmptyFq = fqEntries.filter(e =>
      e.o2_saturation !== null || e.dissolved_o2 !== null || e.temperature !== null
    )
    if (nonEmptyFq.length > 0) {
      const { error: fqError } = await supabase.from('fisicoquimicos').insert(
        nonEmptyFq.map(e => ({ log_id: log.id, ...e }))
      )
      if (fqError) console.error('[createLog] Error insertando fisicoquímicos:', fqError.message, fqError.code)
    }
  }

  // Pozo — solo filas con al menos un valor real
  const pozoEntries = data.pozo as Record<string, unknown>[]
  if (pozoEntries?.length > 0) {
    const nonEmptyPozo = pozoEntries.filter(e =>
      e.temperature !== null || e.o2_saturation !== null || e.dissolved_o2 !== null
    )
    if (nonEmptyPozo.length > 0) {
      const { error: pozoError } = await supabase.from('pozo_readings').insert(
        nonEmptyPozo.map(e => ({ log_id: log.id, ...e }))
      )
      if (pozoError) console.error('[createLog] Error insertando pozo:', pozoError.message, pozoError.code)
    }
  }

  revalidatePath(`/dashboard?module=${moduleSlug}`)
  redirect(`/dashboard?module=${moduleSlug}`)
}

export async function updateLog(logId: string, data: Record<string, unknown>) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  await supabase.from('logs')
    .update({
      operator_name:        data.operator_name as string,
      notes:                (data.notes as string) || null,
      additional_operators: data.additional_operators as string | null,
    })
    .eq('id', logId).eq('user_id', user.id)

  await supabase.from('log_parameters')
    .update({
      pump_main_bar:      data.pump_main_bar      as number | null,
      pump_biofilter_bar: data.pump_biofilter_bar as number | null,
      flowmeter_lpm:      data.flowmeter_lpm      as number | null,
      flowmeter_room_lpm: data.flowmeter_room_lpm as number | null,
      buffer_tank_bar:    data.buffer_tank_bar    as number | null,
      water_intake:       data.water_intake       as number | null,
      ozone_pct:          data.ozone_pct          as number | null,
      intake_value:       data.intake_value       as number | null,
      osmosis_value:      data.osmosis_value      as string | null,
      ph_ff:              data.ph_ff              as number | null,
      salinity_ff:        data.salinity_ff        as number | null,
      orp_ff:             data.orp_ff             as number | null,
      bicarbonate_kg:     data.bicarbonate_kg     as number | null,
      chloride_kg:        data.chloride_kg        as number | null,
      well_level:         data.well_level         as string | null,
      chemical_b_kg:      data.chemical_b_kg      as number | null,
      chemical_cc:        data.chemical_cc        as number | null,
      metabisulfite:      data.metabisulfite      as number | null,
      feeding_type:       data.feeding_type       as string | null,
      feeding_amount:     data.feeding_amount     as number | null,
    })
    .eq('log_id', logId)

  // Checklist
  const checklistKeys = data.checklist_keys as string[]
  if (checklistKeys?.length > 0) {
    await supabase.from('checklist_responses').upsert(
      checklistKeys.map((key) => ({
        log_id:   logId,
        item_key: key,
        checked:  (data[`check_${key}`] as boolean) ?? false,
      })),
      { onConflict: 'log_id,item_key' }
    )
  }

  // Fisicoquímicos — upsert completo, null borra valores anteriores
  const fqEntries = data.fisicoquimicos as Record<string, unknown>[]
  if (fqEntries?.length > 0) {
    const { error: fqError } = await supabase.from('fisicoquimicos').upsert(
      fqEntries.map(e => ({ log_id: logId, ...e })),
      { onConflict: 'log_id,identifier,time_slot' }
    )
    if (fqError) console.error('[updateLog] Error en upsert fisicoquímicos:', fqError.message, fqError.code)
  }

  // Pozo — upsert completo
  const pozoEntries = data.pozo as Record<string, unknown>[]
  if (pozoEntries?.length > 0) {
    const { error: pozoError } = await supabase.from('pozo_readings').upsert(
      pozoEntries.map(e => ({ log_id: logId, ...e })),
      { onConflict: 'log_id,time_slot' }
    )
    if (pozoError) console.error('[updateLog] Error en upsert pozo:', pozoError.message, pozoError.code)
  }

  revalidatePath('/bitacora')
  return { success: true }
}

export async function deleteLog(logId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { error } = await supabase.from('logs').delete().eq('id', logId).eq('user_id', user.id)
  if (error) return { error: error.message }

  revalidatePath('/dashboard')
  redirect('/dashboard')
}

/* ─────────────────────────────────────────────────────────
   CHECKLIST MODULE CONFIG
───────────────────────────────────────────────────────── */

export type ChecklistConfigItem = {
  id:         string
  item_key:   string
  label:      string
  is_default: boolean
  active:     boolean
}

export async function getChecklistConfig(moduleSlug: string): Promise<ChecklistConfigItem[]> {
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('checklist_module_config')
    .select('*')
    .eq('module_slug', moduleSlug)
    .order('created_at', { ascending: true })

  if (existing && existing.length > 0) return existing

  const BASE_ITEMS = [
    ...CHECKLIST_ITEMS.generales,
    ...CHECKLIST_ITEMS.mantenimiento,
    ...CHECKLIST_ITEMS.equipos,
  ]
  const { data: inserted } = await supabase
    .from('checklist_module_config')
    .insert(BASE_ITEMS.map(item => ({
      module_slug: moduleSlug,
      item_key:    item.key,
      label:       item.label,
      is_default:  true,
      active:      true,
    })))
    .select()

  return inserted ?? []
}

export async function updateChecklistConfigItem(id: string, label: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('checklist_module_config').update({ label: label.trim() }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/bitacora')
  return {}
}

export async function toggleChecklistConfigItem(id: string, active: boolean): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('checklist_module_config').update({ active }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/bitacora')
  return {}
}

export async function addChecklistConfigItem(moduleSlug: string, label: string): Promise<{ error?: string; data?: ChecklistConfigItem }> {
  const supabase = await createClient()
  const key = `custom_${moduleSlug}_${Date.now()}`
  const { data, error } = await supabase
    .from('checklist_module_config')
    .insert({ module_slug: moduleSlug, item_key: key, label: label.trim(), is_default: false, active: true })
    .select().single()
  if (error) return { error: error.message }
  revalidatePath('/bitacora')
  return { data }
}

export async function deleteChecklistConfigItem(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('checklist_module_config').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/bitacora')
  return {}
}

/* ─────────────────────────────────────────────────────────
   HELPERS INTERNOS
───────────────────────────────────────────────────────── */

function buildParameters(formData: FormData) {
  return {
    pump_main_bar:      parseNum(formData.get('pump_main_bar')),
    pump_biofilter_bar: parseNum(formData.get('pump_biofilter_bar')),
    flowmeter_lpm:      parseNum(formData.get('flowmeter_lpm')),
    flowmeter_room_lpm: parseNum(formData.get('flowmeter_room_lpm')),
    buffer_tank_bar:    parseNum(formData.get('buffer_tank_bar')),
    water_intake:       parseNum(formData.get('water_intake')),
    ozone_pct:          parseNum(formData.get('ozone_pct')),
    intake_value:       parseNum(formData.get('intake_value')),
    osmosis_value:      (formData.get('osmosis_value') as string) || null,
    ph_ff:              parseNum(formData.get('ph_ff')),
    salinity_ff:        parseNum(formData.get('salinity_ff')),
    orp_ff:             parseNum(formData.get('orp_ff')),
    bicarbonate_kg:     parseNum(formData.get('bicarbonate_kg')),
    chloride_kg:        parseNum(formData.get('chloride_kg')),
    well_level:         (formData.get('well_level')   as string) || null,
    chemical_b_kg:      parseNum(formData.get('chemical_b_kg')),
    chemical_cc:        parseNum(formData.get('chemical_cc')),
    metabisulfite:      parseNum(formData.get('metabisulfite')),
    feeding_type:       (formData.get('feeding_type') as string) || null,
    feeding_amount:     parseNum(formData.get('feeding_amount')),
  }
}

function parseNum(val: FormDataEntryValue | null): number | null {
  if (!val || val === '') return null
  const n = parseFloat(val as string)
  return isNaN(n) ? null : n
}

function parseAdditionalOperators(raw: string | null): string | null {
  if (!raw) return null
  try {
    const arr = JSON.parse(raw) as string[]
    const filtered = arr.filter(s => s.trim() !== '')
    return filtered.length > 0 ? filtered.join(', ') : null
  } catch {
    return null
  }
}

/* ─────────────────────────────────────────────────────────
   CUSTOM CHECKLIST TASKS — legacy
───────────────────────────────────────────────────────── */

export async function getCustomChecklistTasks(): Promise<CustomChecklistTask[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('checklist_custom_tasks').select('*').order('created_at', { ascending: true })
  return data ?? []
}

export async function addCustomChecklistTask(label: string): Promise<{ error?: string; data?: CustomChecklistTask }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('checklist_custom_tasks').insert({ key: `custom_${Date.now()}`, label: label.trim() }).select().single()
  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return { data }
}

export async function updateCustomChecklistTask(id: string, label: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('checklist_custom_tasks').update({ label: label.trim() }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return {}
}

export async function deleteCustomChecklistTask(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('checklist_custom_tasks').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return {}
}
