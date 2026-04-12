// src/app/dashboard/alimentacion-actions.ts
'use server'

import { revalidatePath }  from 'next/cache'
import { createClient }    from '@/utils/supabase/server'
import type {
  FfFeedingPlanFull, SobranteVariant, DietaVariant, FfTkId, PlanRowCell,
} from '@/types/index'
import { FF_TK_IDS } from '@/types/index'

// ── Helpers ───────────────────────────────────────────────

function toN(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return isNaN(n) ? null : n
}

/** Determina qué calibre es el "mayor %" (el que va a tolva) */
function majorCalIdx(cal1Pct: number | null, cal2Pct: number | null): 1 | 2 {
  if (cal1Pct === null || cal2Pct === null) return 1
  // En caso de empate (50/50), el calibre menor (cal 1 por convención) va a tolva
  return cal1Pct >= cal2Pct ? 1 : 2
}

/** Calcula los valores de la categoría Real */
function computeReal(
  row:         PlanRowCell,
  sobVariant:  SobranteVariant,
  dietVariant: DietaVariant,
  cal1Pct:     number | null,
  cal2Pct:     number | null,
): {
  real_tolva_kg:      number | null
  real_tolva_cal2_kg: number | null   // ← nuevo
  real_balde_cal1_kg: number | null
  real_balde_cal2_kg: number | null
  real_total_kg:      number | null
} {
  const dTolva  = toN(row.dieta_tolva_kg)
  const dTolva2 = (dietVariant === '2_calibres_tolva' || dietVariant === '2_calibres_ambos')
    ? toN(row.dieta_tolva_cal2_kg) : null
  const dBal1   = toN(row.dieta_balde_cal1_kg)
  const dBal2   = toN(row.dieta_balde_cal2_kg)
  const sBalde  = toN(row.sobrante_balde_kg)
  const sTolva  = sobVariant === 'balde_tolva' ? toN(row.sobrante_tolva_kg) : 0

  // Tolva cal1 siempre descuenta sobrante tolva
  const realTolva = dTolva !== null ? round3(dTolva - (sTolva ?? 0)) : null
  // Tolva cal2 no descuenta sobrante (el sobrante va contra el mayor, que es tolva cal1)
  const realTolva2 = dTolva2 !== null ? dTolva2 : null

  let realBal1: number | null = null
  let realBal2: number | null = null

  if (dietVariant === '1_calibre' || dietVariant === '2_calibres_tolva') {
    realBal1 = dBal1 !== null ? round3(dBal1 - (sBalde ?? 0)) : null
    realBal2 = null
  } else {
    // 2_calibres y 2_calibres_ambos: sobrante balde descuenta del calibre de mayor %
    const majorIdx = majorCalIdx(cal1Pct, cal2Pct)
    if (majorIdx === 1) {
      realBal1 = dBal1 !== null ? round3(dBal1 - (sBalde ?? 0)) : null
      realBal2 = dBal2
    } else {
      realBal1 = dBal1
      realBal2 = dBal2 !== null ? round3(dBal2 - (sBalde ?? 0)) : null
    }
  }

  const parts = [realTolva, realTolva2, realBal1, realBal2].filter(v => v !== null) as number[]
  const realTotal = parts.length > 0 ? round3(parts.reduce((a, b) => a + b, 0)) : null

  return {
    real_tolva_kg:      realTolva,
    real_tolva_cal2_kg: realTolva2,
    real_balde_cal1_kg: realBal1,
    real_balde_cal2_kg: realBal2,
    real_total_kg:      realTotal,
  }
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

// ── GET ───────────────────────────────────────────────────

export async function getFeedingPlan(logId: string): Promise<FfFeedingPlanFull | null> {
  const supabase = await createClient()
  const { data: plan } = await supabase
    .from('ff_feeding_plan')
    .select('*')
    .eq('log_id', logId)
    .single()
  if (!plan) return null

  const { data: rows } = await supabase
    .from('ff_feeding_plan_rows')
    .select('*')
    .eq('plan_id', plan.id)
    .order('tk_id')

  return { plan, rows: rows ?? [] }
}

// ── UPSERT ────────────────────────────────────────────────

export async function upsertFeedingPlan(payload: {
  logId:           string
  sobranteVariant: SobranteVariant
  dietaVariant:    DietaVariant
  calibre1:        string
  calibre2:        string
  calibre1Pct:     string
  calibre2Pct:     string
  rows:            Record<FfTkId, PlanRowCell>
}): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { logId, sobranteVariant, dietaVariant, calibre1, calibre2, calibre1Pct, calibre2Pct, rows } = payload
  const c1pct = toN(calibre1Pct)
  const c2pct = toN(calibre2Pct)

  // Upsert cabecera
  const { data: plan, error: planErr } = await supabase
  .from('ff_feeding_plan')
  .upsert({
    log_id:           logId,
    sobrante_variant: sobranteVariant,
    dieta_variant:    dietaVariant,
    calibre_1:        calibre1 || null,
    calibre_2:        (dietaVariant === '2_calibres' || dietaVariant === '2_calibres_tolva' || dietaVariant === '2_calibres_ambos')
                        ? (calibre2 || null) : null,
    calibre_1_pct:    (dietaVariant === '2_calibres' || dietaVariant === '2_calibres_tolva' || dietaVariant === '2_calibres_ambos')
                        ? c1pct : null,
    calibre_2_pct:    (dietaVariant === '2_calibres' || dietaVariant === '2_calibres_tolva' || dietaVariant === '2_calibres_ambos')
                        ? c2pct : null,
  }, { onConflict: 'log_id' })
  .select()
  .single()

// En el map de rowsToUpsert, agrega los campos nuevos:
const rowsToUpsert = FF_TK_IDS.map(tkId => {
  const cell = rows[tkId] ?? {}
  const real = computeReal(cell, sobranteVariant, dietaVariant, c1pct, c2pct)
  const sTotal = sobranteVariant === 'balde_tolva'
    ? (toN(cell.sobrante_balde_kg) !== null || toN(cell.sobrante_tolva_kg) !== null
        ? round3((toN(cell.sobrante_balde_kg) ?? 0) + (toN(cell.sobrante_tolva_kg) ?? 0))
        : null)
    : toN(cell.sobrante_balde_kg)

  return {
    plan_id:             plan.id,
    tk_id:               tkId,
    sobrante_balde_kg:   toN(cell.sobrante_balde_kg),
    sobrante_tolva_kg:   sobranteVariant === 'balde_tolva' ? toN(cell.sobrante_tolva_kg) : null,
    dieta_tolva_kg:      toN(cell.dieta_tolva_kg),
    dieta_tolva_cal2_kg: (dietaVariant === '2_calibres_tolva' || dietaVariant === '2_calibres_ambos')
      ? toN(cell.dieta_tolva_cal2_kg) : null,
    dieta_balde_cal2_kg: (dietaVariant === '2_calibres' || dietaVariant === '2_calibres_ambos')
      ? toN(cell.dieta_balde_cal2_kg) : null,
    dieta_balde_cal1_kg: toN(cell.dieta_balde_cal1_kg),
    real_tolva_kg:       real.real_tolva_kg,
    real_tolva_cal2_kg:  real.real_tolva_cal2_kg,
    real_balde_cal1_kg:  real.real_balde_cal1_kg,
    real_balde_cal2_kg:  real.real_balde_cal2_kg,
    real_total_kg:       real.real_total_kg,
  }
})

  const { error: rowsErr } = await supabase
    .from('ff_feeding_plan_rows')
    .upsert(rowsToUpsert, { onConflict: 'plan_id,tk_id' })

  if (rowsErr) return { error: rowsErr.message }

  revalidatePath('/bitacora')
  return {}
}