// src/app/bodega/actions.ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient }   from '@/utils/supabase/server'
import { toRoman }         from './utils'

/* ── Types ─────────────────────────────────────────────────── */

export interface BodegaConfig {
  id:   string
  cols: number
  rows: number
}

export interface CargoType {
  id:         string
  name:       string
  slots_used: number
}

export interface BodegaProduct {
  id:            string
  nombre:        string
  calibre:       string
  fecha_venc:    string | null
  medicado:      boolean
  cargo_type_id: string | null
  ubicacion:     string | null
  seccion:       string
  nivel:         number        // 1–5
  seccion_half:  boolean
  active:        boolean
  created_by:    string | null
  created_at:    string
  updated_at:    string
  cargo_type?:   CargoType | null
  creator?:      { full_name: string } | null
}

export interface BodegaHistoryEntry {
  id:           string
  product_id:   string | null
  product_name: string
  action:       'create' | 'update' | 'delete'
  changes:      Record<string, { from: unknown; to: unknown }> | null
  user_id:      string | null
  user_name:    string
  created_at:   string
}

/* ── Helpers ────────────────────────────────────────────────── */

async function getCurrentUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles').select('id, full_name').eq('id', user.id).single()
  return profile
}

/* ── Config ─────────────────────────────────────────────────── */

export async function getBodegaConfig(): Promise<BodegaConfig | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('bodega_config').select('*').order('created_at').limit(1).single()
  return data ?? null
}

export async function updateBodegaConfig(
  id: string,
  cols: number,
  rows: number,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('bodega_config').update({ cols, rows, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/bodega')
  return {}
}

/* ── Cargo Types ────────────────────────────────────────────── */

export async function getCargoTypes(): Promise<CargoType[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('bodega_cargo_types').select('*').order('name')
  return data ?? []
}

export async function addCargoType(
  name: string,
  slots_used: number,
): Promise<{ error?: string; data?: CargoType }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('bodega_cargo_types')
    .insert({ name: name.trim(), slots_used })
    .select().single()
  if (error) return { error: error.message }
  revalidatePath('/bodega')
  return { data }
}

export async function updateCargoType(
  id: string,
  name: string,
  slots_used: number,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('bodega_cargo_types').update({ name: name.trim(), slots_used }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/bodega')
  return {}
}

export async function deleteCargoType(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { count } = await supabase
    .from('bodega_products').select('id', { count: 'exact', head: true })
    .eq('cargo_type_id', id).eq('active', true)
  if (count && count > 0)
    return { error: 'No se puede eliminar: hay productos usando este tipo de carga.' }
  const { error } = await supabase.from('bodega_cargo_types').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/bodega')
  return {}
}

/* ── Products ───────────────────────────────────────────────── */

export async function getBodegaProducts(): Promise<BodegaProduct[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('bodega_products')
    .select('*, cargo_type:bodega_cargo_types(*), creator:profiles!created_by(full_name)')
    .eq('active', true)
    .order('seccion')
    .order('nivel')
  return (data ?? []) as BodegaProduct[]
}

export async function createProduct(payload: {
  nombre:        string
  calibre:       string
  fecha_venc:    string | null
  medicado:      boolean
  cargo_type_id: string | null
  ubicacion:     string | null
  seccion:       string
  nivel:         number
  seccion_half:  boolean
}): Promise<{ error?: string; data?: BodegaProduct }> {
  const supabase = await createClient()
  const user = await getCurrentUser()
  if (!user) return { error: 'No autenticado' }

  // Verificar que el slot seccion+nivel esté libre
  const { count } = await supabase
    .from('bodega_products')
    .select('id', { count: 'exact', head: true })
    .eq('seccion', payload.seccion)
    .eq('nivel', payload.nivel)
    .eq('active', true)
  if (count && count > 0)
    return { error: `El nivel ${toRoman(payload.nivel)} de la sección ${payload.seccion} ya está ocupado.` }

  const { data, error } = await supabase
    .from('bodega_products')
    .insert({ ...payload, created_by: user.id, active: true })
    .select('*, cargo_type:bodega_cargo_types(*)')
    .single()

  if (error) return { error: error.message }

  await supabase.from('bodega_history').insert({
    product_id:   data.id,
    product_name: data.nombre,
    action:       'create',
    changes:      null,
    user_id:      user.id,
    user_name:    user.full_name,
  })

  revalidatePath('/bodega')
  return { data: data as BodegaProduct }
}

export async function updateProduct(
  id: string,
  payload: Partial<{
    nombre:        string
    calibre:       string
    fecha_venc:    string | null
    medicado:      boolean
    cargo_type_id: string | null
    ubicacion:     string | null
    seccion:       string
    nivel:         number
    seccion_half:  boolean
  }>,
  oldProduct: BodegaProduct,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const user = await getCurrentUser()
  if (!user) return { error: 'No autenticado' }

  // Si cambia seccion o nivel, verificar que el destino esté libre
  const newSeccion = payload.seccion ?? oldProduct.seccion
  const newNivel   = payload.nivel   ?? oldProduct.nivel
  if (newSeccion !== oldProduct.seccion || newNivel !== oldProduct.nivel) {
    const { count } = await supabase
      .from('bodega_products')
      .select('id', { count: 'exact', head: true })
      .eq('seccion', newSeccion)
      .eq('nivel', newNivel)
      .eq('active', true)
      .neq('id', id)
    if (count && count > 0)
      return { error: `El nivel ${toRoman(newNivel)} de ${newSeccion} ya está ocupado.` }
  }

  const { error } = await supabase
    .from('bodega_products')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { error: error.message }

  const changes: Record<string, { from: unknown; to: unknown }> = {}
  for (const key of Object.keys(payload) as (keyof typeof payload)[]) {
    const oldVal = oldProduct[key as keyof BodegaProduct]
    const newVal = payload[key]
    if (String(oldVal) !== String(newVal)) {
      changes[key] = { from: oldVal, to: newVal }
    }
  }

  await supabase.from('bodega_history').insert({
    product_id:   id,
    product_name: payload.nombre ?? oldProduct.nombre,
    action:       'update',
    changes:      Object.keys(changes).length > 0 ? changes : null,
    user_id:      user.id,
    user_name:    user.full_name,
  })

  revalidatePath('/bodega')
  return {}
}

export async function deleteProduct(
  id: string,
  nombre: string,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const user = await getCurrentUser()
  if (!user) return { error: 'No autenticado' }

  const { error } = await supabase
    .from('bodega_products')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { error: error.message }

  await supabase.from('bodega_history').insert({
    product_id:   id,
    product_name: nombre,
    action:       'delete',
    changes:      null,
    user_id:      user.id,
    user_name:    user.full_name,
  })

  revalidatePath('/bodega')
  return {}
}

export async function moveProduct(
  id: string,
  seccion: string,
  nivel: number,
  oldProduct: BodegaProduct,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const user = await getCurrentUser()
  if (!user) return { error: 'No autenticado' }

  // Verificar que destino esté libre
  const { count } = await supabase
    .from('bodega_products')
    .select('id', { count: 'exact', head: true })
    .eq('seccion', seccion)
    .eq('nivel', nivel)
    .eq('active', true)
    .neq('id', id)
  if (count && count > 0)
    return { error: `El nivel ${toRoman(nivel)} de ${seccion} ya está ocupado.` }

  const { error } = await supabase
    .from('bodega_products')
    .update({ seccion, nivel, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { error: error.message }

  await supabase.from('bodega_history').insert({
    product_id:   id,
    product_name: oldProduct.nombre,
    action:       'update',
    changes:      {
      seccion: { from: oldProduct.seccion, to: seccion },
      nivel:   { from: oldProduct.nivel,   to: nivel   },
    },
    user_id:   user.id,
    user_name: user.full_name,
  })

  revalidatePath('/bodega')
  return {}
}

/* ── History ────────────────────────────────────────────────── */

export async function getBodegaHistory(limit = 200): Promise<BodegaHistoryEntry[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('bodega_history')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as BodegaHistoryEntry[]
}

export async function updateHistoryEntry(
  id: string,
  product_name: string,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('bodega_history').update({ product_name: product_name.trim() }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/bodega')
  return {}
}

export async function deleteHistoryEntry(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('bodega_history').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/bodega')
  return {}
}

