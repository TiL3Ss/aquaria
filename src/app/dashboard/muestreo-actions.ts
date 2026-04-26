// src/app/dashboard/muestreo-actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient }   from '@/utils/supabase/server'

// ── Types ─────────────────────────────────────────────────────

type PesoUnidad = 'gramos' | 'kilogramos'

export interface PezRowPayload {
  numero: number
  peso: string
  op_izq: string
  op_der: string
}

export interface EstanquePayload {
  orden: number
  numero_estanque: string
  fecha: string
  grupo: string
  responsable: string
  observaciones: string
  peces: PezRowPayload[]
}

export interface MuestreoConfigPayload {
  con_operculos: boolean
  peso_unidad: PesoUnidad
  cantidad_estanques: number
}

// ── Helpers ───────────────────────────────────────────────────

function toN(v: string): number | null {
  if (!v || v === '') return null
  const n = parseFloat(v)
  return isNaN(n) ? null : n
}

function toInt(v: string): number | null {
  if (!v || v === '') return null
  const n = parseInt(v, 10)
  return isNaN(n) ? null : n
}

// ── Upsert principal ──────────────────────────────────────────


export async function upsertMuestreo(payload: {
  moduleSlug:  string
  sessionDate: string
  config:      MuestreoConfigPayload
  estanques:   EstanquePayload[]
  sessionId?:  string | null
}): Promise<{ sessionId?: string; error?: string }> {

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { moduleSlug, sessionDate, config, estanques, sessionId } = payload
  let resolvedSessionId = sessionId ?? null

  const peces_por_estanque = estanques[0]?.peces.length ?? 200

  // ── 1. Sesión ─────────────────────────────────────────────
  if (resolvedSessionId) {
    // Guardados posteriores → UPDATE simple
    const { error } = await supabase
      .from('muestreo_sessions')
      .update({
        con_operculos:      config.con_operculos,
        peso_unit:          config.peso_unidad,
        cantidad_estanques: config.cantidad_estanques,
        peces_por_estanque,
        updated_at:         new Date().toISOString(),
      })
      .eq('id', resolvedSessionId)
    if (error) return { error: error.message }

  } else {
    // Primer guardado → upsert por (module_slug, session_date)
    const { data, error } = await supabase
      .from('muestreo_sessions')
      .upsert({
        module_slug:        moduleSlug,
        session_date:       sessionDate,
        con_operculos:      config.con_operculos,
        peso_unit:          config.peso_unidad,
        cantidad_estanques: config.cantidad_estanques,
        peces_por_estanque,
        created_by:         user.id,
        updated_at:         new Date().toISOString(),
      }, { onConflict: 'module_slug,session_date' })
      .select('id')
      .single()

    if (error || !data) return { error: error?.message ?? 'Error al crear la sesión de muestreo' }
    resolvedSessionId = data.id
  }

  // ── 2. Estanques + observaciones + filas ──────────────────
  for (const est of estanques) {
    const { data: estData, error: estError } = await supabase
      .from('muestreo_estanques')
      .upsert({
        session_id:      resolvedSessionId,
        sort_order:      est.orden,
        numero_estanque: est.numero_estanque || String(est.orden),
        fecha:           est.fecha || sessionDate,  // fecha NOT NULL → fallback a sessionDate
        grupo:           est.grupo || null,
        responsable:     est.responsable || '',
        observaciones:   est.observaciones || null, // columna directa tras migration
        updated_at:      new Date().toISOString(),
      }, { onConflict: 'session_id,sort_order' })
      .select('id')
      .single()

    if (estError || !estData) {
      return { error: estError?.message ?? `Error al guardar estanque ${est.orden}` }
    }

    const estanqueId = estData.id

    // ── 3. Peces con peso → muestreo_filas ──────────────────
    const pecesConPeso = est.peces.filter(p => p.peso !== '')
    if (pecesConPeso.length === 0) continue

    const filasPayload = pecesConPeso.map(p => {
      const conOpEstePez = config.con_operculos && p.numero <= 50
      return {
        estanque_id:   estanqueId,
        numero_pez:    p.numero,
        peso:          toN(p.peso),
        op_izq:        conOpEstePez ? toInt(p.op_izq) : null,
        op_der:        conOpEstePez ? toInt(p.op_der) : null,
        observaciones: null,
      }
    })

    const { error: filasError } = await supabase
      .from('muestreo_filas')
      .upsert(filasPayload, { onConflict: 'estanque_id,numero_pez' })

    if (filasError) return { error: filasError.message }
  }

  revalidatePath('/dashboard')
  return { sessionId: resolvedSessionId  ?? undefined }
}

// ── GET — cargar sesión existente ─────────────────────────────

export async function getMuestreoSession(sessionId: string) {
  const supabase = await createClient()

  const { data: session } = await supabase
    .from('muestreo_sessions')
    .select('*')
    .eq('id', sessionId)
    .single()
  if (!session) return null

  const { data: estanques } = await supabase
    .from('muestreo_estanques')
    .select('*')
    .eq('session_id', sessionId)
    .order('sort_order')

  if (!estanques || estanques.length === 0) return { session, estanques: [] }

  const estanquesConFilas = await Promise.all(
    estanques.map(async (est: any) => {
      const { data: filas } = await supabase
        .from('muestreo_filas')
        .select('*')
        .eq('estanque_id', est.id)
        .gt('numero_pez', 0)    // excluir filas reservadas si las hubiera
        .order('numero_pez')

      return {
        ...est,
        // observaciones ya viene en est.observaciones (columna directa)
        peces: filas ?? [],
      }
    })
  )

  return { session, estanques: estanquesConFilas }
}

// ── GET por módulo+fecha (para cargar al abrir el sheet) ──────

export async function getMuestreoByModuleDate(
  moduleSlug: string,
  sessionDate: string,
) {
  const supabase = await createClient()

  const { data: session } = await supabase
    .from('muestreo_sessions')
    .select('*')
    .eq('module_slug',   moduleSlug)
    .eq('session_date',  sessionDate)
    .maybeSingle()

  if (!session) return null
  return getMuestreoSession(session.id)
}

// ── DELETE — elimina sesión completa manualmente (sin CASCADE en FK) ──
// Orden: muestreo_filas → muestreo_estanques → muestreo_sessions

export async function deleteMuestreo(
  sessionId: string,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  // 1. Obtener IDs de estanques de esta sesión
  const { data: estanques, error: estFetchErr } = await supabase
    .from('muestreo_estanques')
    .select('id')
    .eq('session_id', sessionId)

  if (estFetchErr) return { error: estFetchErr.message }

  // 2. Eliminar filas de peces de todos los estanques
  if (estanques && estanques.length > 0) {
    const estanqueIds = estanques.map((e: any) => e.id)

    const { error: filasErr} = await supabase
      .from('muestreo_filas')
      .delete()
      .in('estanque_id', estanqueIds)

    if (filasErr) return { error: filasErr.message }
  }

  // 3. Eliminar estanques
  const { error: estErr } = await supabase
    .from('muestreo_estanques')
    .delete()
    .eq('session_id', sessionId)

  if (estErr) return { error: estErr.message }

  // 4. Eliminar sesión
  const { error: sessErr } = await supabase
    .from('muestreo_sessions')
    .delete()
    .eq('id', sessionId)

  if (sessErr) return { error: sessErr.message }

  revalidatePath('/dashboard')
  return {}
}