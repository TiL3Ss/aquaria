//src/components/AlimentacionFF.tsx
'use client'

import { useState, useCallback } from 'react'
import type {
  FfFeedingPlanFull, SobranteVariant, DietaVariant, FfTkId, PlanRowCell,
} from '@/types/index'
import { FF_TK_IDS } from '@/types/index'
import { upsertFeedingPlan } from '@/app/dashboard/alimentacion-actions'

// ── Helpers ───────────────────────────────────────────────

function toN(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return isNaN(n) ? null : n
}

function r3(n: number): number { return Math.round(n * 1000) / 1000 }

function disp(v: number | null, fallback = '—'): string {
  if (v === null) return fallback
  return v % 1 === 0 ? String(v) : v.toFixed(3).replace(/\.?0+$/, '')
}

function majorCalIdx(c1: string | null, c2: string | null): 1 | 2 {
  const p1 = toN(c1) ?? 0
  const p2 = toN(c2) ?? 0
  return p1 >= p2 ? 1 : 2
}

function computeReal(
  cell: PlanRowCell,
  sobVar: SobranteVariant,
  dietVar: DietaVariant,
  cal1Pct: string,
  cal2Pct: string,
) {
  const dTolva = toN(cell.dieta_tolva_kg)
  const dBal1  = toN(cell.dieta_balde_cal1_kg)
  const dBal2  = toN(cell.dieta_balde_cal2_kg)
  const sBalde = toN(cell.sobrante_balde_kg) ?? 0
  const sTolva = sobVar === 'balde_tolva' ? (toN(cell.sobrante_tolva_kg) ?? 0) : 0

  const realTolva = dTolva !== null ? r3(dTolva - sTolva) : null

  let realBal1: number | null = null
  let realBal2: number | null = null

  if (dietVar === '1_calibre') {
    realBal1 = dBal1 !== null ? r3(dBal1 - sBalde) : null
  } else {
    const maj = majorCalIdx(cal1Pct, cal2Pct)
    if (maj === 1) {
      realBal1 = dBal1 !== null ? r3(dBal1 - sBalde) : null
      realBal2 = dBal2
    } else {
      realBal1 = dBal1
      realBal2 = dBal2 !== null ? r3(dBal2 - sBalde) : null
    }
  }

  const parts = [realTolva, realBal1, realBal2].filter(v => v !== null) as number[]
  const realTotal = parts.length > 0 ? r3(parts.reduce((a, b) => a + b, 0)) : null

  return { realTolva, realBal1, realBal2, realTotal }
}

function sobranteTotal(cell: PlanRowCell, sobVar: SobranteVariant): number | null {
  const b = toN(cell.sobrante_balde_kg)
  if (sobVar === 'balde') return b
  const t = toN(cell.sobrante_tolva_kg)
  if (b === null && t === null) return null
  return r3((b ?? 0) + (t ?? 0))
}

function dietaTotal(cell: PlanRowCell, dietVar: DietaVariant): number | null {
  const tolva = toN(cell.dieta_tolva_kg)
  const bal1  = toN(cell.dieta_balde_cal1_kg)
  const bal2  = dietVar === '2_calibres' ? toN(cell.dieta_balde_cal2_kg) : null
  const parts = [tolva, bal1, bal2].filter(v => v !== null) as number[]
  return parts.length > 0 ? r3(parts.reduce((a, b) => a + b, 0)) : null
}

// ── Sub-components ────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider text-center py-1 px-1">
      {label}
    </div>
  )
}

function CellInput({
  value, onChange, editing, placeholder = '0.000',
}: {
  value: number | undefined
  onChange: (v: string) => void
  editing: boolean
  placeholder?: string
}) {
  return (
    <input
      type="number"
      step="0.001"
      min="0"
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      readOnly={!editing}
      placeholder={editing ? placeholder : '—'}
      className={`w-full text-center text-[12px] tabular-nums rounded-lg px-1 py-1.5 border outline-none transition-all
        ${editing
          ? 'bg-white border-gray-200 focus:border-blue-400 focus:ring-1 focus:ring-blue-100 text-gray-900'
          : 'bg-transparent border-transparent text-gray-600 cursor-default'}`}
    />
  )
}

function CalcCell({ value, positive = false }: { value: number | null; positive?: boolean }) {
  if (value === null) return <span className="block text-center text-[12px] text-gray-300">—</span>
  const neg = value < 0
  return (
    <span className={`block text-center text-[12px] font-semibold tabular-nums
      ${neg ? 'text-red-500' : positive ? 'text-emerald-600' : 'text-blue-600'}`}>
      {disp(value)}
    </span>
  )
}

// ── Toggle Switch ─────────────────────────────────────────

function Toggle({
  checked, onToggle, labelOn, labelOff,
}: {
  checked: boolean; onToggle: () => void; labelOn: string; labelOff: string
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`relative inline-flex h-7 w-12 flex-shrink-0 rounded-full border-2 border-transparent
        transition-colors duration-200 focus:outline-none
        ${checked ? 'bg-blue-500' : 'bg-gray-200'}`}
      role="switch"
      aria-checked={checked}
    >
      <span className={`pointer-events-none inline-block h-6 w-6 transform rounded-full
        bg-white shadow ring-0 transition duration-200
        ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  )
}

// ── Config Option Row ─────────────────────────────────────

function ConfigRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-gray-50 last:border-0">
      <span className="text-[13px] text-gray-600 font-medium">{label}</span>
      <div className="flex items-center gap-2 flex-shrink-0">{children}</div>
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────

interface Props {
  logId:        string
  initialData:  FfFeedingPlanFull | null
  onClose:      () => void
}

// ══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════

export default function AlimentacionFF({ logId, initialData, onClose }: Props) {
  const existing = initialData?.plan

  // ── Variantes ─────────────────────────────────────────
  const [sobVar,  setSobVar]  = useState<SobranteVariant>(existing?.sobrante_variant ?? 'balde')
  const [dietVar, setDietVar] = useState<DietaVariant>(existing?.dieta_variant ?? '1_calibre')

  // ── Calibres ──────────────────────────────────────────
  const [cal1,    setCal1]    = useState(existing?.calibre_1    ?? '')
  const [cal2,    setCal2]    = useState(existing?.calibre_2    ?? '')
  const [cal1Pct, setCal1Pct] = useState(existing?.calibre_1_pct !== null ? String(existing?.calibre_1_pct) : '')
  const [cal2Pct, setCal2Pct] = useState(existing?.calibre_2_pct !== null ? String(existing?.calibre_2_pct) : '')

  // ── Rows state ─────────────────────────────────────────
  const [rows, setRows] = useState<Record<FfTkId, PlanRowCell>>(() => {
    const map = {} as Record<FfTkId, PlanRowCell>
    FF_TK_IDS.forEach(tk => {
      const r = initialData?.rows.find(x => x.tk_id === tk)
      map[tk] = r ? {
        sobrante_balde_kg:   toN(r.sobrante_balde_kg)    ?? undefined,
        sobrante_tolva_kg:   toN(r.sobrante_tolva_kg)    ?? undefined,
        dieta_tolva_kg:      toN(r.dieta_tolva_kg)       ?? undefined,
        dieta_balde_cal1_kg: toN(r.dieta_balde_cal1_kg)  ?? undefined,
        dieta_balde_cal2_kg: toN(r.dieta_balde_cal2_kg)  ?? undefined,
      } : {}
    })
    return map
  })

  // ── UI state ──────────────────────────────────────────
  const [editing, setEditing] = useState(!existing)
  const [saving,  setSaving]  = useState(false)
  const [saveOk,  setSaveOk]  = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  // ── Helpers ───────────────────────────────────────────
  const setCell = useCallback((tk: FfTkId, field: keyof PlanRowCell, raw: string) => {
    const v = raw === '' ? undefined : parseFloat(raw)
    setRows(prev => ({
      ...prev,
      [tk]: { ...prev[tk], [field]: v },
    }))
  }, [])

  const majorIdx = dietVar === '2_calibres' ? majorCalIdx(cal1Pct, cal2Pct) : 1
  // Etiqueta de calibres para headers
  const calMajorLabel = dietVar === '2_calibres'
    ? (majorIdx === 1 ? (cal1 || 'Cal.1') : (cal2 || 'Cal.2'))
    : (cal1 || 'Cal.1')
  const calMinorLabel = dietVar === '2_calibres'
    ? (majorIdx === 1 ? (cal2 || 'Cal.2') : (cal1 || 'Cal.1'))
    : ''

  // ── Save ─────────────────────────────────────────────
  async function handleSave() {
    setSaving(true)
    setError(null)
    const res = await upsertFeedingPlan({
      logId,
      sobranteVariant: sobVar,
      dietaVariant:    dietVar,
      calibre1:        cal1,
      calibre2:        cal2,
      calibre1Pct:     cal1Pct,
      calibre2Pct:     cal2Pct,
      rows,
    })
    setSaving(false)
    if (res.error) { setError(res.error); return }
    setEditing(false)
    setSaveOk(true)
    setTimeout(() => setSaveOk(false), 2500)
  }

  // ── Derived cal1Pct / cal2Pct al cambiar uno ─────────
  function handleCal1Pct(v: string) {
    setCal1Pct(v)
    const n = toN(v)
    if (n !== null) setCal2Pct(String(r3(100 - n)))
  }
  function handleCal2Pct(v: string) {
    setCal2Pct(v)
    const n = toN(v)
    if (n !== null) setCal1Pct(String(r3(100 - n)))
  }

  // ══════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════
  return (
    <div className="flex flex-col h-full">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 sticky top-0 bg-white z-10">
        <button onClick={onClose}
          className="flex items-center gap-1 text-blue-500 text-[14px] font-medium active:opacity-60">
          <svg width="8" height="13" viewBox="0 0 8 13" fill="none">
            <path d="M7 1L1 6.5L7 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Volver
        </button>

        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-gray-800">Plan de Alimentación</span>
          <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">FF · Noche</span>
        </div>

        <div className="flex items-center gap-1.5">
          {saveOk && <span className="text-[12px] text-green-600 font-semibold">✓</span>}
          {!editing ? (
            <button onClick={() => setEditing(true)}
              className="w-8 h-8 flex items-center justify-center rounded-xl bg-blue-50 text-blue-500 active:opacity-60">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
          ) : (
            <>
              {existing && (
                <button onClick={() => setEditing(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-xl bg-gray-100 text-gray-500 active:opacity-60">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              )}
              <button onClick={handleSave} disabled={saving}
                className="bg-blue-500 text-white text-[13px] font-semibold px-3.5 py-1.5 rounded-full shadow-sm shadow-blue-200 active:bg-blue-600 disabled:opacity-50">
                {saving ? '…' : 'Guardar'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="mx-4 mt-3 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-[12px] text-red-600">
          {error}
        </div>
      )}

      {/* ── Scroll content ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

        {/* ── 1. Configuración ── */}
        <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-blue-50 text-blue-500 text-[11px] font-bold flex items-center justify-center">1</span>
            <span className="text-[14px] font-semibold text-gray-900">Configuración</span>
            {!editing && <span className="ml-auto text-[11px] text-gray-400">Solo lectura</span>}
          </div>
          <div className="px-4 py-3 space-y-0">
            <ConfigRow label="Sobrante">
              <span className={`text-[11px] font-semibold transition-colors ${sobVar === 'balde' ? 'text-blue-500' : 'text-gray-400'}`}>Balde</span>
              <Toggle
                checked={sobVar === 'balde_tolva'}
                onToggle={() => editing && setSobVar(s => s === 'balde' ? 'balde_tolva' : 'balde')}
                labelOn="Balde y Tolva" labelOff="Balde"
              />
              <span className={`text-[11px] font-semibold transition-colors ${sobVar === 'balde_tolva' ? 'text-blue-500' : 'text-gray-400'}`}>Balde y Tolva</span>
            </ConfigRow>

            <ConfigRow label="Dieta">
              <span className={`text-[11px] font-semibold transition-colors ${dietVar === '1_calibre' ? 'text-blue-500' : 'text-gray-400'}`}>1 Calibre</span>
              <Toggle
                checked={dietVar === '2_calibres'}
                onToggle={() => editing && setDietVar(s => s === '1_calibre' ? '2_calibres' : '1_calibre')}
                labelOn="2 Calibres" labelOff="1 Calibre"
              />
              <span className={`text-[11px] font-semibold transition-colors ${dietVar === '2_calibres' ? 'text-blue-500' : 'text-gray-400'}`}>2 Calibres</span>
            </ConfigRow>
          </div>

          {/* Inputs de calibre */}
          <div className="px-4 pb-4">
            {dietVar === '1_calibre' ? (
              <div>
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Calibre</p>
                <input
                  type="text" value={cal1} onChange={e => editing && setCal1(e.target.value)}
                  readOnly={!editing} placeholder="ej. 0.5"
                  className={`w-full px-3 py-2.5 rounded-xl text-[14px] border outline-none transition-all
                    ${editing ? 'bg-white border-gray-200 focus:border-blue-400 focus:ring-1 focus:ring-blue-100' : 'bg-gray-50 border-transparent text-gray-700 cursor-default'}`}
                />
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Calibres y porcentajes</p>
                <div className="grid grid-cols-2 gap-3">
                  {/* Cal 1 */}
                  <div>
                    <p className="text-[10px] text-gray-400 mb-1">Calibre 1</p>
                    <input type="text" value={cal1} onChange={e => editing && setCal1(e.target.value)}
                      readOnly={!editing} placeholder="ej. 0.5"
                      className={`w-full px-3 py-2 rounded-xl text-[13px] border outline-none transition-all
                        ${editing ? 'bg-white border-gray-200 focus:border-blue-400' : 'bg-gray-50 border-transparent cursor-default'}`}
                    />
                  </div>
                  {/* Cal 2 */}
                  <div>
                    <p className="text-[10px] text-gray-400 mb-1">Calibre 2</p>
                    <input type="text" value={cal2} onChange={e => editing && setCal2(e.target.value)}
                      readOnly={!editing} placeholder="ej. 0.7"
                      className={`w-full px-3 py-2 rounded-xl text-[13px] border outline-none transition-all
                        ${editing ? 'bg-white border-gray-200 focus:border-blue-400' : 'bg-gray-50 border-transparent cursor-default'}`}
                    />
                  </div>
                  {/* % Cal 1 */}
                  <div>
                    <p className="text-[10px] text-gray-400 mb-1">% Calibre 1</p>
                    <div className="relative">
                      <input type="number" min="0" max="100" step="0.1"
                        value={cal1Pct} onChange={e => editing && handleCal1Pct(e.target.value)}
                        readOnly={!editing} placeholder="ej. 75"
                        className={`w-full px-3 py-2 pr-7 rounded-xl text-[13px] border outline-none transition-all
                          ${editing ? 'bg-white border-gray-200 focus:border-blue-400' : 'bg-gray-50 border-transparent cursor-default'}`}
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">%</span>
                    </div>
                  </div>
                  {/* % Cal 2 */}
                  <div>
                    <p className="text-[10px] text-gray-400 mb-1">% Calibre 2</p>
                    <div className="relative">
                      <input type="number" min="0" max="100" step="0.1"
                        value={cal2Pct} onChange={e => editing && handleCal2Pct(e.target.value)}
                        readOnly={!editing} placeholder="ej. 25"
                        className={`w-full px-3 py-2 pr-7 rounded-xl text-[13px] border outline-none transition-all
                          ${editing ? 'bg-white border-gray-200 focus:border-blue-400' : 'bg-gray-50 border-transparent cursor-default'}`}
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">%</span>
                    </div>
                  </div>
                </div>
                {/* Indicador de cuál va a tolva */}
                {(cal1Pct || cal2Pct) && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-xl">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round">
                      <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
                    </svg>
                    <span className="text-[11px] text-blue-600 font-medium">
                      Tolva ← <span className="font-bold">
                        {majorIdx === 1 ? (cal1 || 'Cal.1') : (cal2 || 'Cal.2')}
                      </span> ({majorIdx === 1 ? cal1Pct : cal2Pct}%)
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── 2. Tabla ── */}
        <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-blue-50 text-blue-500 text-[11px] font-bold flex items-center justify-center">2</span>
            <span className="text-[14px] font-semibold text-gray-900">Datos por tanque</span>
            <span className="ml-auto text-[10px] text-gray-400 font-mono">kg</span>
          </div>

          <div className="overflow-x-auto">
            <table className="border-collapse" style={{ minWidth: tableMinWidth(sobVar, dietVar) }}>
              <thead>
                {/* ── Fila 1: categorías ── */}
                <tr className="border-b border-gray-100">
                  <th className="sticky left-0 bg-white z-10 text-left px-3 py-2 text-[11px] font-bold text-gray-400 uppercase tracking-wider w-12">TK</th>

                  {/* SOBRANTE */}
                  <th colSpan={sobVar === 'balde' ? 1 : 3}
                    className="text-center py-2 px-1 border-l border-gray-100">
                    <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider bg-amber-50 px-2 py-0.5 rounded-full">
                      Sobrante
                    </span>
                  </th>

                  {/* DIETA */}
                  <th colSpan={dietVar === '1_calibre' ? 3 : 4}
                    className="text-center py-2 px-1 border-l border-gray-100">
                    <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider bg-blue-50 px-2 py-0.5 rounded-full">
                      Dieta
                    </span>
                  </th>

                  {/* REAL */}
                  <th colSpan={dietVar === '1_calibre' ? 3 : 4}
                    className="text-center py-2 px-1 border-l border-gray-100">
                    <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider bg-emerald-50 px-2 py-0.5 rounded-full">
                      Real
                    </span>
                  </th>
                </tr>

                {/* ── Fila 2: sub-columnas ── */}
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="sticky left-0 bg-gray-50 z-10 px-3 py-1.5 w-12" />

                  {/* SOBRANTE cols */}
                  <SubTh label="Balde" border />
                  {sobVar === 'balde_tolva' && <>
                    <SubTh label="Tolva" />
                    <SubTh label="Total" muted />
                  </>}

                  {/* DIETA cols */}
                  <SubTh label={`Tolva\n${calMajorLabel}`} border />
                  <SubTh label={`Balde\n${calMajorLabel}`} />
                  {dietVar === '2_calibres' && <SubTh label={`Balde\n${calMinorLabel}`} />}
                  <SubTh label="Total" muted />

                  {/* REAL cols */}
                  <SubTh label={`Tolva\n${calMajorLabel}`} border />
                  <SubTh label={`Balde\n${calMajorLabel}`} />
                  {dietVar === '2_calibres' && <SubTh label={`Balde\n${calMinorLabel}`} />}
                  <SubTh label="Total" muted />
                </tr>
              </thead>

              <tbody>
                {FF_TK_IDS.map((tk, idx) => {
                  const cell    = rows[tk] ?? {}
                  const sobTot  = sobranteTotal(cell, sobVar)
                  const dietTot = dietaTotal(cell, dietVar)
                  const { realTolva, realBal1, realBal2, realTotal } = computeReal(cell, sobVar, dietVar, cal1Pct, cal2Pct)

                  return (
                    <tr key={tk} className={`border-b border-gray-50 ${idx % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                      {/* TK id */}
                      <td className="sticky left-0 bg-white z-10 px-3 py-1.5 font-bold text-[12px] text-blue-500 whitespace-nowrap"
                        style={{ background: idx % 2 === 1 ? '#f9fafb' : 'white' }}>
                        {tk}
                      </td>

                      {/* ── SOBRANTE ── */}
                      <td className="px-1 py-1 border-l border-gray-100 min-w-[64px]">
                        <CellInput value={cell.sobrante_balde_kg} onChange={v => setCell(tk, 'sobrante_balde_kg', v)} editing={editing} />
                      </td>
                      {sobVar === 'balde_tolva' && <>
                        <td className="px-1 py-1 min-w-[64px]">
                          <CellInput value={cell.sobrante_tolva_kg} onChange={v => setCell(tk, 'sobrante_tolva_kg', v)} editing={editing} />
                        </td>
                        <td className="px-1 py-1 min-w-[64px]">
                          <CalcCell value={sobTot} />
                        </td>
                      </>}

                      {/* ── DIETA ── */}
                      <td className="px-1 py-1 border-l border-gray-100 min-w-[64px]">
                        <CellInput value={cell.dieta_tolva_kg} onChange={v => setCell(tk, 'dieta_tolva_kg', v)} editing={editing} />
                      </td>
                      <td className="px-1 py-1 min-w-[64px]">
                        <CellInput value={cell.dieta_balde_cal1_kg} onChange={v => setCell(tk, 'dieta_balde_cal1_kg', v)} editing={editing} />
                      </td>
                      {dietVar === '2_calibres' && (
                        <td className="px-1 py-1 min-w-[64px]">
                          <CellInput value={cell.dieta_balde_cal2_kg} onChange={v => setCell(tk, 'dieta_balde_cal2_kg', v)} editing={editing} />
                        </td>
                      )}
                      <td className="px-1 py-1 min-w-[64px]">
                        <CalcCell value={dietTot} />
                      </td>

                      {/* ── REAL ── */}
                      <td className="px-1 py-1 border-l border-gray-100 min-w-[64px]">
                        <CalcCell value={realTolva} positive />
                      </td>
                      <td className="px-1 py-1 min-w-[64px]">
                        <CalcCell value={realBal1} positive />
                      </td>
                      {dietVar === '2_calibres' && (
                        <td className="px-1 py-1 min-w-[64px]">
                          <CalcCell value={realBal2} positive />
                        </td>
                      )}
                      <td className="px-1 py-1 min-w-[64px]">
                        <CalcCell value={realTotal} positive />
                      </td>
                    </tr>
                  )
                })}

                {/* ── Fila totales ── */}
                <TotalsRow rows={rows} sobVar={sobVar} dietVar={dietVar} cal1Pct={cal1Pct} cal2Pct={cal2Pct} />
              </tbody>
            </table>
          </div>

          {/* Leyenda */}
          <div className="px-4 py-2.5 border-t border-gray-50 flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="text-[10px] text-gray-400">Sobrante — ingresar manualmente</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              <span className="text-[10px] text-gray-400">Dieta — pauta del turno</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-[10px] text-gray-400">Real — calculado automáticamente</span>
            </div>
          </div>
        </div>

        {/* Guardar bottom */}
        {editing && (
          <button onClick={handleSave} disabled={saving}
            className="w-full py-3.5 bg-blue-500 text-white text-[15px] font-semibold rounded-full shadow-sm shadow-blue-200 active:bg-blue-600 disabled:opacity-50 transition-colors">
            {saving ? 'Guardando…' : 'Guardar plan'}
          </button>
        )}

        <div className="h-4" />
      </div>
    </div>
  )
}

// ── Sub-header cell ───────────────────────────────────────

function SubTh({ label, border = false, muted = false }: { label: string; border?: boolean; muted?: boolean }) {
  return (
    <th className={`px-1 py-1.5 text-center min-w-[64px] ${border ? 'border-l border-gray-100' : ''}`}>
      <span className={`text-[9px] font-bold uppercase tracking-wide whitespace-pre-line leading-tight
        ${muted ? 'text-gray-300' : 'text-gray-400'}`}>
        {label}
      </span>
    </th>
  )
}

// ── Totals row ────────────────────────────────────────────

function TotalsRow({
  rows, sobVar, dietVar, cal1Pct, cal2Pct,
}: {
  rows: Record<FfTkId, PlanRowCell>
  sobVar: SobranteVariant
  dietVar: DietaVariant
  cal1Pct: string
  cal2Pct: string
}) {
  function sumCol(fn: (tk: FfTkId) => number | null): number | null {
    let total: number | null = null
    FF_TK_IDS.forEach(tk => {
      const v = fn(tk)
      if (v !== null) total = r3((total ?? 0) + v)
    })
    return total
  }

  const sobBalde = sumCol(tk => toN(rows[tk]?.sobrante_balde_kg) ?? null)
  const sobTolva = sobVar === 'balde_tolva' ? sumCol(tk => toN(rows[tk]?.sobrante_tolva_kg) ?? null) : null
  const sobTot   = sobVar === 'balde' ? sobBalde
    : (sobBalde !== null || sobTolva !== null ? r3((sobBalde ?? 0) + (sobTolva ?? 0)) : null)

  const dTolva  = sumCol(tk => toN(rows[tk]?.dieta_tolva_kg) ?? null)
  const dBal1   = sumCol(tk => toN(rows[tk]?.dieta_balde_cal1_kg) ?? null)
  const dBal2   = dietVar === '2_calibres' ? sumCol(tk => toN(rows[tk]?.dieta_balde_cal2_kg) ?? null) : null
  const dTot    = [dTolva, dBal1, dBal2].filter(v => v !== null).length > 0
    ? r3([dTolva ?? 0, dBal1 ?? 0, dBal2 ?? 0].reduce((a, b) => a + b, 0)) : null

  const reals = FF_TK_IDS.map(tk => computeReal(rows[tk] ?? {}, sobVar, dietVar, cal1Pct, cal2Pct))
  const rTolva  = sumCol(tk => computeReal(rows[tk] ?? {}, sobVar, dietVar, cal1Pct, cal2Pct).realTolva)
  const rBal1   = sumCol(tk => computeReal(rows[tk] ?? {}, sobVar, dietVar, cal1Pct, cal2Pct).realBal1)
  const rBal2   = dietVar === '2_calibres' ? sumCol(tk => computeReal(rows[tk] ?? {}, sobVar, dietVar, cal1Pct, cal2Pct).realBal2) : null
  const rTot    = sumCol(tk => computeReal(rows[tk] ?? {}, sobVar, dietVar, cal1Pct, cal2Pct).realTotal)

  const tdCls = "px-1 py-2 text-center"
  const borderCls = "border-l border-gray-100"

  return (
    <tr className="border-t-2 border-gray-200 bg-gray-50/80">
      <td className="sticky left-0 bg-gray-50 z-10 px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">
        Total
      </td>

      {/* Sobrante */}
      <td className={`${tdCls} ${borderCls}`}><CalcCell value={sobBalde} /></td>
      {sobVar === 'balde_tolva' && <>
        <td className={tdCls}><CalcCell value={sobTolva} /></td>
        <td className={tdCls}><CalcCell value={sobTot} /></td>
      </>}

      {/* Dieta */}
      <td className={`${tdCls} ${borderCls}`}><CalcCell value={dTolva} /></td>
      <td className={tdCls}><CalcCell value={dBal1} /></td>
      {dietVar === '2_calibres' && <td className={tdCls}><CalcCell value={dBal2} /></td>}
      <td className={tdCls}><CalcCell value={dTot} /></td>

      {/* Real */}
      <td className={`${tdCls} ${borderCls}`}><CalcCell value={rTolva} positive /></td>
      <td className={tdCls}><CalcCell value={rBal1} positive /></td>
      {dietVar === '2_calibres' && <td className={tdCls}><CalcCell value={rBal2} positive /></td>}
      <td className={tdCls}><CalcCell value={rTot} positive /></td>
    </tr>
  )
}

// ── Helpers ───────────────────────────────────────────────

function tableMinWidth(sobVar: SobranteVariant, dietVar: DietaVariant): string {
  // TK(48) + sobrante cols + dieta cols + real cols
  const sobCols  = sobVar === 'balde' ? 1 : 3
  const dietCols = dietVar === '1_calibre' ? 3 : 4
  const realCols = dietVar === '1_calibre' ? 3 : 4
  const total    = 48 + (sobCols + dietCols + realCols) * 68
  return `${total}px`
}