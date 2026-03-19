// src/app/dashboard/actions.ts

'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Shift, LogFull } from '@/types'

export async function getLogsForMonth(
  moduleSlug: string,
  year: number,
  month: number
): Promise<Record<string, Record<Shift, boolean>>> {
  const supabase = await createClient()

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const endDate   = `${year}-${String(month).padStart(2, '0')}-31`

  const { data: module } = await supabase
    .from('modules')
    .select('id')
    .eq('slug', moduleSlug.toLowerCase())
    .single()

  if (!module) return {}

  const { data: logs } = await supabase
    .from('logs')
    .select('log_date, shift')
    .eq('module_id', module.id)
    .gte('log_date', startDate)
    .lte('log_date', endDate)

  const result: Record<string, Record<Shift, boolean>> = {}
  logs?.forEach((log) => {
    if (!result[log.log_date]) {
      result[log.log_date] = { noche: false, dia: false, tarde: false }
    }
    result[log.log_date][log.shift as Shift] = true
  })

  return result
}

export async function getLog(
  moduleSlug: string,
  date: string,
  shift: Shift
): Promise<LogFull | null> {
  const supabase = await createClient()

  const { data: module } = await supabase
    .from('modules')
    .select('id')
    .eq('slug', moduleSlug.toLowerCase())
    .single()

  if (!module) return null

  const { data: log } = await supabase
    .from('logs')
    .select('*, profiles(full_name, rut), modules(name, slug)')
    .eq('module_id', module.id)
    .eq('log_date', date)
    .eq('shift', shift)
    .single()

  if (!log) return null

  const [{ data: parameters }, { data: checklist }, { data: fisicoquimicos }] =
    await Promise.all([
      supabase.from('log_parameters').select('*').eq('log_id', log.id).single(),
      supabase.from('checklist_responses').select('*').eq('log_id', log.id),
      supabase.from('fisicoquimicos').select('*').eq('log_id', log.id),
    ])

  return {
    log,
    parameters: parameters ?? null,
    checklist:  checklist  ?? [],
    fisicoquimicos: fisicoquimicos ?? [],
  }
}

export async function createLog(formData: FormData) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const moduleSlug   = formData.get('module_slug')    as string
  const date         = formData.get('log_date')        as string
  const shift        = formData.get('shift')           as Shift
  const operatorName = formData.get('operator_name')   as string
  const notes        = formData.get('notes')           as string

  const { data: module } = await supabase
    .from('modules')
    .select('id')
    .eq('slug', moduleSlug.toLowerCase())
    .single()

  if (!module) return { error: 'Módulo no encontrado' }

  const { data: log, error: logError } = await supabase
    .from('logs')
    .insert({
      user_id:       user.id,
      module_id:     module.id,
      log_date:      date,
      shift,
      operator_name: operatorName,
      notes:         notes || null,
    })
    .select()
    .single()

  if (logError) {
    if (logError.code === '23505') return { error: 'Ya existe una bitácora para ese turno' }
    return { error: logError.message }
  }

  // Parámetros numéricos
  await supabase.from('log_parameters').insert({
    log_id:             log.id,
    pump_main_bar:      parseNum(formData.get('pump_main_bar')),
    pump_biofilter_bar: parseNum(formData.get('pump_biofilter_bar')),
    flowmeter_lpm:      parseNum(formData.get('flowmeter_lpm')),
    buffer_tank_bar:    parseNum(formData.get('buffer_tank_bar')),
    water_intake:       parseNum(formData.get('water_intake')),
    well_level:         formData.get('well_level')    || null,
    intake_value:       parseNum(formData.get('intake_value')),
    chemical_b_kg:      parseNum(formData.get('chemical_b_kg')),
    chemical_cc:        parseNum(formData.get('chemical_cc')),
    bicarbonate_kg:     parseNum(formData.get('bicarbonate_kg')),
    chloride_kg:        parseNum(formData.get('chloride_kg')),
    metabisulfite:      parseNum(formData.get('metabisulfite')),
    feeding_type:       formData.get('feeding_type')  || null,
    feeding_amount:     parseNum(formData.get('feeding_amount')),
    ozone_pct:          parseNum(formData.get('ozone_pct')),
  })

  // Checklist
  const checklistKeys = formData.getAll('checklist_keys') as string[]
  if (checklistKeys.length > 0) {
    await supabase.from('checklist_responses').insert(
      checklistKeys.map((key) => ({
        log_id:   log.id,
        item_key: key,
        checked:  formData.get(`check_${key}`) === 'true',
      }))
    )
  }

  // Fisicoquímicos
  const fqEntries = JSON.parse(formData.get('fisicoquimicos') as string || '[]')
  if (fqEntries.length > 0) {
    await supabase.from('fisicoquimicos').insert(
      fqEntries.map((e: Record<string, unknown>) => ({ log_id: log.id, ...e }))
    )
  }

  revalidatePath('/dashboard')
  redirect('/dashboard')
}

export async function updateLog(logId: string, formData: FormData) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const operatorName = formData.get('operator_name') as string
  const notes        = formData.get('notes')         as string

  await supabase
    .from('logs')
    .update({ operator_name: operatorName, notes: notes || null })
    .eq('id', logId)
    .eq('user_id', user.id)

  await supabase
    .from('log_parameters')
    .update({
      pump_main_bar:      parseNum(formData.get('pump_main_bar')),
      pump_biofilter_bar: parseNum(formData.get('pump_biofilter_bar')),
      flowmeter_lpm:      parseNum(formData.get('flowmeter_lpm')),
      buffer_tank_bar:    parseNum(formData.get('buffer_tank_bar')),
      water_intake:       parseNum(formData.get('water_intake')),
      well_level:         formData.get('well_level')   || null,
      intake_value:       parseNum(formData.get('intake_value')),
      chemical_b_kg:      parseNum(formData.get('chemical_b_kg')),
      chemical_cc:        parseNum(formData.get('chemical_cc')),
      bicarbonate_kg:     parseNum(formData.get('bicarbonate_kg')),
      chloride_kg:        parseNum(formData.get('chloride_kg')),
      metabisulfite:      parseNum(formData.get('metabisulfite')),
      feeding_type:       formData.get('feeding_type') || null,
      feeding_amount:     parseNum(formData.get('feeding_amount')),
      ozone_pct:          parseNum(formData.get('ozone_pct')),
    })
    .eq('log_id', logId)

  // Checklist — upsert para crear o actualizar
  const checklistKeys = formData.getAll('checklist_keys') as string[]
  if (checklistKeys.length > 0) {
    await supabase.from('checklist_responses').upsert(
      checklistKeys.map((key) => ({
        log_id:   logId,
        item_key: key,
        checked:  formData.get(`check_${key}`) === 'true',
      })),
      { onConflict: 'log_id,item_key' }
    )
  }

  // Fisicoquímicos — upsert
  const fqEntries = JSON.parse(formData.get('fisicoquimicos') as string || '[]')
  if (fqEntries.length > 0) {
    await supabase.from('fisicoquimicos').upsert(
      fqEntries.map((e: Record<string, unknown>) => ({ log_id: logId, ...e })),
      { onConflict: 'log_id,identifier,time_slot' }
    )
  }

  revalidatePath('/dashboard')
  return { success: true }
}

export async function deleteLog(logId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { error } = await supabase
    .from('logs')
    .delete()
    .eq('id', logId)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  revalidatePath('/dashboard')
  redirect('/dashboard')
}

// ── Utilidad interna ──────────────────────────────────
function parseNum(val: FormDataEntryValue | null): number | null {
  if (!val || val === '') return null
  const n = parseFloat(val as string)
  return isNaN(n) ? null : n
}