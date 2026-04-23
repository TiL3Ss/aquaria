// src/components/Muestreo.tsx
'use client'

import { useState, useCallback, useMemo } from 'react'

// ── Types ─────────────────────────────────────────────────

type PesoUnidad = 'gramos' | 'kilogramos'

interface PezRow {
  numero: number
  peso: string
  op_izq: string
  op_der: string
}

interface EstanqueData {
  orden: number
  numero_estanque: string
  fecha: string
  grupo: string
  responsable: string
  observaciones: string   // ← por estanque, no por pez
  peces: PezRow[]
}

interface MuestreoConfig {
  con_operculos: boolean
  peso_unidad: PesoUnidad
  cantidad_estanques: number
}

interface Props {
  moduleName: string
  date: string          // 'YYYY-MM-DD'
  logId: string
  userName: string
  onClose: () => void
}

// ── Helpers ───────────────────────────────────────────────

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function nowTimeStr(): string {
  return new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
}

function formatDate(ds: string): string {
  if (!ds) return '—'
  const [y, m, dd] = ds.split('-')
  return `${dd}/${m}/${y}`
}

function makeEmptyPeces(n: number): PezRow[] {
  return Array.from({ length: n }, (_, i) => ({
    numero: i + 1,
    peso: '',
    op_izq: '',
    op_der: '',
  }))
}

function makeEmptyEstanque(orden: number, userName: string, date: string): EstanqueData {
  return {
    orden,
    numero_estanque: String(orden),
    fecha: date,
    grupo: '',
    responsable: userName,
    observaciones: '',
    peces: makeEmptyPeces(200),
  }
}

function parseNum(v: string): number | null {
  if (v === '') return null
  const n = parseFloat(v)
  return isNaN(n) ? null : n
}

// ── Stats calculation ─────────────────────────────────────

function calcStats(estanques: EstanqueData[], config: MuestreoConfig) {
  const perEstanque = estanques.map(est => {
    const peces = est.peces.filter(p => p.peso !== '')
    const pesos = peces.map(p => parseNum(p.peso) ?? 0)
    const promPeso = pesos.length > 0 ? pesos.reduce((a, b) => a + b, 0) / pesos.length : null
    const total = peces.length

    // Opérculos solo se registran en los primeros 50 (índice 0–49)
    let opIzqCount = 0
    let opDerCount = 0
    if (config.con_operculos) {
      const primeros50 = est.peces.slice(0, 50).filter(p => p.peso !== '')
      opIzqCount = primeros50.filter(p => p.op_izq !== '').length
      opDerCount = primeros50.filter(p => p.op_der !== '').length
    }

    return { numero: est.numero_estanque, total, promPeso, opIzqCount, opDerCount }
  })

  // Global
  const allPeces = estanques.flatMap(e => e.peces.filter(p => p.peso !== ''))
  const allPesos = allPeces.map(p => parseNum(p.peso) ?? 0)
  const totalGlobal = allPeces.length
  const promGlobal = allPesos.length > 0 ? allPesos.reduce((a, b) => a + b, 0) / allPesos.length : null

  let opIzqGlobal = 0
  let opDerGlobal = 0
  if (config.con_operculos) {
    estanques.forEach(e => {
      const p50 = e.peces.slice(0, 50).filter(p => p.peso !== '')
      opIzqGlobal += p50.filter(p => p.op_izq !== '').length
      opDerGlobal += p50.filter(p => p.op_der !== '').length
    })
  }

  return { perEstanque, totalGlobal, promGlobal, opIzqGlobal, opDerGlobal }
}

// ── Sub-components ────────────────────────────────────────

function Toggle({ checked, onToggle, disabled }: { checked: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={`relative inline-flex h-7 w-12 flex-shrink-0 rounded-full border-2 border-transparent
        transition-colors duration-200 focus:outline-none disabled:opacity-40
        ${checked ? 'bg-blue-500' : 'bg-gray-200'}`}
    >
      <span className={`pointer-events-none inline-block h-6 w-6 transform rounded-full
        bg-white shadow ring-0 transition duration-200
        ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  )
}

function ConfigRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-gray-50 last:border-0">
      <span className="text-[13px] text-gray-600 font-medium">{label}</span>
      <div className="flex items-center gap-2 flex-shrink-0">{children}</div>
    </div>
  )
}

function FieldInput({
  label, value, onChange, placeholder = '', type = 'text', readOnly = false
}: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; type?: string; readOnly?: boolean
}) {
  return (
    <div>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        className="w-full px-3 py-2.5 rounded-xl text-[13px] border border-gray-200 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 bg-white"
      />
    </div>
  )
}

function StatBadge({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-2xl px-4 py-3 text-center" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
      <div className="text-[11px] text-gray-400 font-medium mb-0.5">{label}</div>
      <div className="text-[18px] font-bold text-gray-900 tabular-nums">{value}</div>
      {sub && <div className="text-[10px] text-blue-500 font-semibold mt-0.5">{sub}</div>}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────

export default function Muestreo({ moduleName, date, logId, userName, onClose }: Props) {
  // Config state
  const [config, setConfig] = useState<MuestreoConfig>({
    con_operculos: false,
    peso_unidad: 'gramos',
    cantidad_estanques: 1,
  })
  const [configLocked, setConfigLocked] = useState(false)

  // Estanques data
  const [estanques, setEstanques] = useState<EstanqueData[]>([
    makeEmptyEstanque(1, userName, date),
  ])
  const [activeEstanque, setActiveEstanque] = useState(0)
  const [showStats, setShowStats] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveOk, setSaveOk] = useState(false)

  // ── Config handlers ───────────────────────────────────

  function applyConfig(newConfig: MuestreoConfig) {
    setConfig(newConfig)
    // Sync estanques array length
    const cur = estanques.length
    const next = newConfig.cantidad_estanques
    if (next > cur) {
      const extras = Array.from({ length: next - cur }, (_, i) =>
        makeEmptyEstanque(cur + i + 1, userName, date)
      )
      setEstanques(prev => [...prev, ...extras])
    } else if (next < cur) {
      setEstanques(prev => prev.slice(0, next))
      if (activeEstanque >= next) setActiveEstanque(next - 1)
    }
  }

  function handleCantidadChange(v: string) {
    const n = Math.min(20, Math.max(1, parseInt(v) || 1))
    applyConfig({ ...config, cantidad_estanques: n })
  }

  // ── Estanque meta handlers ────────────────────────────

  function setMeta(field: keyof Omit<EstanqueData, 'peces' | 'orden'>, value: string) {
    setEstanques(prev => prev.map((e, i) =>
      i === activeEstanque ? { ...e, [field]: value } : e
    ))
  }

  // ── Pez handlers ──────────────────────────────────────

  const setPezField = useCallback((pezIdx: number, field: keyof PezRow, value: string) => {
    setEstanques(prev => prev.map((e, ei) => {
      if (ei !== activeEstanque) return e
      const peces = e.peces.map((p, pi) => pi === pezIdx ? { ...p, [field]: value } : p)
      return { ...e, peces }
    }))
  }, [activeEstanque])

  function addPez() {
    setEstanques(prev => prev.map((e, i) => {
      if (i !== activeEstanque) return e
      const next = e.peces.length + 1
      return { ...e, peces: [...e.peces, { numero: next, peso: '', op_izq: '', op_der: '', observaciones: '' }] }
    }))
  }

  function removePez() {
    setEstanques(prev => prev.map((e, i) => {
      if (i !== activeEstanque || e.peces.length <= 1) return e
      return { ...e, peces: e.peces.slice(0, -1) }
    }))
  }

  // ── Stats ─────────────────────────────────────────────

  const stats = useMemo(() => calcStats(estanques, config), [estanques, config])

  // ── Save (stub — wire to your server action) ──────────

  async function handleSave() {
    setSaving(true)
    // TODO: call upsertMuestreo server action with { logId, config, estanques }
    await new Promise(r => setTimeout(r, 800))
    setSaving(false)
    setSaveOk(true)
    setTimeout(() => setSaveOk(false), 2500)
  }

  const est = estanques[activeEstanque]

  // ══════════════════════════════════════════════════════
  // RENDER — STATS VIEW
  // ══════════════════════════════════════════════════════
  if (showStats) {
    return (
      <div className="flex flex-col h-full bg-[#F2F2F7]">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-white sticky top-0 z-10">
          <button onClick={() => setShowStats(false)}
            className="flex items-center gap-1 text-blue-500 text-[14px] font-medium active:opacity-60">
            <svg width="8" height="13" viewBox="0 0 8 13" fill="none">
              <path d="M7 1L1 6.5L7 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Volver
          </button>
          <span className="text-[13px] font-bold text-gray-800">Resultados del Muestreo</span>
          <div className="w-16" />
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Global */}
          <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-blue-50 text-blue-500 text-[11px] font-bold flex items-center justify-center">G</span>
              <span className="text-[14px] font-semibold text-gray-900">Global — todos los estanques</span>
            </div>
            <div className="p-4 grid grid-cols-2 gap-3">
              <StatBadge
                label="Total peces"
                value={String(stats.totalGlobal)}
              />
              <StatBadge
                label={`Peso prom. (${config.peso_unidad === 'gramos' ? 'g' : 'kg'})`}
                value={stats.promGlobal !== null ? stats.promGlobal.toFixed(2) : '—'}
              />
              {config.con_operculos && (
                <>
                  <StatBadge
                    label="Opérculo Izq."
                    value={stats.totalGlobal > 0 ? `${((stats.opIzqGlobal / stats.totalGlobal) * 100).toFixed(1)}%` : '—'}
                    sub={`${stats.opIzqGlobal} peces`}
                  />
                  <StatBadge
                    label="Opérculo Der."
                    value={stats.totalGlobal > 0 ? `${((stats.opDerGlobal / stats.totalGlobal) * 100).toFixed(1)}%` : '—'}
                    sub={`${stats.opDerGlobal} peces`}
                  />
                </>
              )}
            </div>
          </div>

          {/* Por estanque */}
          <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-600 text-[11px] font-bold flex items-center justify-center">E</span>
              <span className="text-[14px] font-semibold text-gray-900">Por estanque</span>
            </div>
            <div className="divide-y divide-gray-50">
              {stats.perEstanque.map((s, i) => (
                <div key={i} className="px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[13px] font-bold text-blue-500">Estanque {s.numero}</span>
                    <span className="text-[11px] text-gray-400">{s.total} peces</span>
                  </div>
                  <div className={`grid gap-2 ${config.con_operculos ? 'grid-cols-3' : 'grid-cols-2'}`}>
                    <div className="bg-gray-50 rounded-xl px-3 py-2 text-center">
                      <div className="text-[9px] text-gray-400 font-semibold uppercase tracking-wide">
                        Peso prom. ({config.peso_unidad === 'gramos' ? 'g' : 'kg'})
                      </div>
                      <div className="text-[14px] font-bold text-gray-800 tabular-nums mt-0.5">
                        {s.promPeso !== null ? s.promPeso.toFixed(2) : '—'}
                      </div>
                    </div>
                    {config.con_operculos && (
                      <>
                        <div className="bg-amber-50 rounded-xl px-3 py-2 text-center">
                          <div className="text-[9px] text-amber-600 font-semibold uppercase tracking-wide">OP Izq.</div>
                          <div className="text-[14px] font-bold text-amber-700 tabular-nums mt-0.5">
                            {s.total > 0 ? `${((s.opIzqCount / s.total) * 100).toFixed(0)}%` : '—'}
                          </div>
                          <div className="text-[9px] text-amber-500">{s.opIzqCount}</div>
                        </div>
                        <div className="bg-orange-50 rounded-xl px-3 py-2 text-center">
                          <div className="text-[9px] text-orange-600 font-semibold uppercase tracking-wide">OP Der.</div>
                          <div className="text-[14px] font-bold text-orange-700 tabular-nums mt-0.5">
                            {s.total > 0 ? `${((s.opDerCount / s.total) * 100).toFixed(0)}%` : '—'}
                          </div>
                          <div className="text-[9px] text-orange-500">{s.opDerCount}</div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="h-4" />
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════
  // RENDER — MAIN VIEW
  // ══════════════════════════════════════════════════════
  return (
    <div className="flex flex-col h-full bg-[#F2F2F7]">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-white sticky top-0 z-10">
        <button onClick={onClose}
          className="flex items-center gap-1 text-blue-500 text-[14px] font-medium active:opacity-60">
          <svg width="8" height="13" viewBox="0 0 8 13" fill="none">
            <path d="M7 1L1 6.5L7 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Volver
        </button>

        <div className="flex flex-col items-center leading-tight">
          <span className="text-[13px] font-semibold text-gray-800">Muestreo</span>
          <span className="text-[10px] text-gray-400 font-medium">{moduleName} · {formatDate(date)}</span>
        </div>

        <div className="flex items-center gap-1.5">
          {saveOk && <span className="text-[12px] text-green-600 font-semibold">✓</span>}
          <button
            onClick={() => setShowStats(true)}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 active:opacity-60">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10"/>
              <line x1="12" y1="20" x2="12" y2="4"/>
              <line x1="6" y1="20" x2="6" y2="14"/>
            </svg>
          </button>
          <button onClick={handleSave} disabled={saving}
            className="bg-blue-500 text-white text-[13px] font-semibold px-3.5 py-1.5 rounded-full shadow-sm shadow-blue-200 active:bg-blue-600 disabled:opacity-50">
            {saving ? '…' : 'Guardar'}
          </button>
        </div>
      </div>

      {/* ── Scroll content ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

        {/* ── 1. Configuración ── */}
        <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-blue-50 text-blue-500 text-[11px] font-bold flex items-center justify-center">1</span>
            <span className="text-[14px] font-semibold text-gray-900">Configuración</span>
            {configLocked && (
              <button
                onClick={() => setConfigLocked(false)}
                className="ml-auto text-[11px] text-blue-500 font-semibold active:opacity-60">
                Editar
              </button>
            )}
            {!configLocked && (
              <button
                onClick={() => setConfigLocked(true)}
                className="ml-auto text-[11px] text-blue-500 font-semibold active:opacity-60">
                Confirmar
              </button>
            )}
          </div>
          <div className="px-4 py-1">
            <ConfigRow label="Opérculos">
              <span className={`text-[11px] font-semibold ${!config.con_operculos ? 'text-blue-500' : 'text-gray-400'}`}>No</span>
              <Toggle
                checked={config.con_operculos}
                onToggle={() => !configLocked && applyConfig({ ...config, con_operculos: !config.con_operculos })}
                disabled={configLocked}
              />
              <span className={`text-[11px] font-semibold ${config.con_operculos ? 'text-blue-500' : 'text-gray-400'}`}>Sí</span>
            </ConfigRow>

            <ConfigRow label="Tipo de peso">
              {(['gramos', 'kilogramos'] as PesoUnidad[]).map(v => (
                <button key={v} type="button"
                  disabled={configLocked}
                  onClick={() => applyConfig({ ...config, peso_unidad: v })}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-colors disabled:opacity-50
                    ${config.peso_unidad === v ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500 active:bg-gray-200'}`}>
                  {v === 'gramos' ? 'Gramos (g)' : 'Kilos (kg)'}
                </button>
              ))}
            </ConfigRow>

            <ConfigRow label="Cantidad de estanques">
              <div className="flex items-center gap-2">
                <button
                  disabled={configLocked || config.cantidad_estanques <= 1}
                  onClick={() => handleCantidadChange(String(config.cantidad_estanques - 1))}
                  className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center active:bg-gray-200 disabled:opacity-40">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                </button>
                <span className="text-[17px] font-bold text-gray-900 tabular-nums w-6 text-center">
                  {config.cantidad_estanques}
                </span>
                <button
                  disabled={configLocked || config.cantidad_estanques >= 20}
                  onClick={() => handleCantidadChange(String(config.cantidad_estanques + 1))}
                  className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center active:bg-gray-200 disabled:opacity-40">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                </button>
              </div>
            </ConfigRow>
          </div>
        </div>

        {/* ── 2. Navegación de estanques ── */}
        {config.cantidad_estanques > 1 && (
          <div className="flex gap-2 overflow-x-auto scrollbar-none pb-0.5">
            {estanques.map((e, i) => (
              <button key={i} onClick={() => setActiveEstanque(i)}
                className={`flex-shrink-0 px-4 py-2 rounded-2xl text-[12px] font-bold transition-all active:scale-95
                  ${activeEstanque === i ? 'bg-blue-500 text-white shadow-sm shadow-blue-200' : 'bg-white text-gray-500'}`}
                style={activeEstanque !== i ? { boxShadow: '0 1px 4px rgba(0,0,0,0.07)' } : {}}>
                TK {e.numero_estanque}
              </button>
            ))}
          </div>
        )}

        {/* ── 3. Formulario estanque activo ── */}
        <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-600 text-[11px] font-bold flex items-center justify-center">2</span>
              <span className="text-[14px] font-semibold text-gray-900">
                Muestreo — Estanque {est.numero_estanque}
              </span>
            </div>
            <span className="text-[11px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
              {activeEstanque + 1}/{config.cantidad_estanques}
            </span>
          </div>

          {/* Metadata */}
          <div className="px-4 pt-3 pb-4 grid grid-cols-2 gap-3">
            {/* Fecha */}
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Fecha</p>
              <div className="flex gap-1.5">
                <input
                  type="date"
                  value={est.fecha}
                  onChange={e => setMeta('fecha', e.target.value)}
                  className="flex-1 min-w-0 px-2 py-2 rounded-xl text-[12px] border border-gray-200 outline-none focus:border-blue-400 bg-white"
                />
                <button
                  onClick={() => setMeta('fecha', todayStr())}
                  className="px-2 py-2 rounded-xl bg-blue-50 text-blue-500 text-[10px] font-bold active:bg-blue-100 flex-shrink-0">
                  Hoy
                </button>
              </div>
            </div>

            {/* Número de estanque */}
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">N° Estanque</p>
              <input
                type="text"
                value={est.numero_estanque}
                onChange={e => setMeta('numero_estanque', e.target.value)}
                placeholder="ej. 101"
                className="w-full px-3 py-2.5 rounded-xl text-[13px] border border-gray-200 outline-none focus:border-blue-400 bg-white"
              />
            </div>

            {/* Grupo */}
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Grupo / BACH</p>
              <input
                type="text"
                value={est.grupo}
                onChange={e => setMeta('grupo', e.target.value)}
                placeholder="ej. BACH2025-1"
                className="w-full px-3 py-2.5 rounded-xl text-[13px] border border-gray-200 outline-none focus:border-blue-400 bg-white"
              />
            </div>

            {/* Responsable */}
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Responsable</p>
              <input
                type="text"
                value={est.responsable}
                onChange={e => setMeta('responsable', e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-[13px] border border-gray-200 outline-none focus:border-blue-400 bg-white"
              />
            </div>
          </div>
        </div>

        {/* ── 4. Tabla de peces ── */}
        <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-blue-50 text-blue-500 text-[11px] font-bold flex items-center justify-center">3</span>
            <span className="text-[14px] font-semibold text-gray-900">Datos de peces</span>
            <span className="ml-auto text-[10px] text-gray-400 font-mono">{est.peces.length} peces</span>
          </div>

          <div className="overflow-x-auto">
            <table className="border-collapse w-full" style={{ minWidth: config.con_operculos ? '360px' : '220px' }}>
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="sticky left-0 bg-gray-50 z-10 px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-center w-10">N°</th>
                  <th className="px-2 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-center">
                    Peso ({config.peso_unidad === 'gramos' ? 'g' : 'kg'})
                  </th>
                  {config.con_operculos && (
                    <>
                      <th className="px-2 py-2 text-[10px] font-bold text-amber-500 uppercase tracking-wider text-center border-l border-gray-100">
                        OP Izq.
                        <span className="block text-[8px] text-amber-400 font-normal normal-case">1–50</span>
                      </th>
                      <th className="px-2 py-2 text-[10px] font-bold text-orange-500 uppercase tracking-wider text-center">
                        OP Der.
                        <span className="block text-[8px] text-orange-400 font-normal normal-case">1–50</span>
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {est.peces.map((pez, pi) => {
                  const conOpEstaFila = config.con_operculos && pi < 50
                  return (
                    <tr key={pi} className={`border-b border-gray-50 ${pi % 2 === 1 ? 'bg-gray-50/30' : ''}`}>
                      <td className={`sticky left-0 z-10 px-3 py-1 text-[12px] font-bold text-center tabular-nums
                        ${pi < 50 && config.con_operculos ? 'text-blue-500' : 'text-gray-400'}
                        ${pi % 2 === 1 ? 'bg-gray-50' : 'bg-white'}`}>
                        {pez.numero}
                      </td>
                      <td className="px-1 py-1">
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          value={pez.peso}
                          onChange={e => setPezField(pi, 'peso', e.target.value)}
                          placeholder="—"
                          className="w-full text-center text-[12px] tabular-nums rounded-lg px-1 py-1.5 border border-transparent outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100 bg-transparent focus:bg-white transition-all"
                        />
                      </td>
                      {config.con_operculos && (
                        <>
                          <td className="px-1 py-1 border-l border-gray-100">
                            {conOpEstaFila ? (
                              <input
                                type="number"
                                min="1" max="9" step="1"
                                value={pez.op_izq}
                                onChange={e => setPezField(pi, 'op_izq', e.target.value)}
                                placeholder="—"
                                className="w-full text-center text-[12px] tabular-nums rounded-lg px-1 py-1.5 border border-transparent outline-none focus:border-amber-300 focus:ring-1 focus:ring-amber-100 bg-transparent focus:bg-white transition-all"
                              />
                            ) : (
                              <span className="block text-center text-[11px] text-gray-200">—</span>
                            )}
                          </td>
                          <td className="px-1 py-1">
                            {conOpEstaFila ? (
                              <input
                                type="number"
                                min="1" max="9" step="1"
                                value={pez.op_der}
                                onChange={e => setPezField(pi, 'op_der', e.target.value)}
                                placeholder="—"
                                className="w-full text-center text-[12px] tabular-nums rounded-lg px-1 py-1.5 border border-transparent outline-none focus:border-orange-300 focus:ring-1 focus:ring-orange-100 bg-transparent focus:bg-white transition-all"
                              />
                            ) : (
                              <span className="block text-center text-[11px] text-gray-200">—</span>
                            )}
                          </td>
                        </>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Add/remove pez */}
          <div className="px-4 py-3 border-t border-gray-50 flex items-center gap-2">
            <button onClick={removePez} disabled={est.peces.length <= 1}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100 text-gray-600 text-[12px] font-semibold active:bg-gray-200 disabled:opacity-40 transition-colors">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Quitar
            </button>
            <button onClick={addPez} disabled={est.peces.length >= 200}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-50 text-blue-600 text-[12px] font-semibold active:bg-blue-100 disabled:opacity-40 transition-colors">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Agregar pez
            </button>
            <span className="ml-auto text-[11px] text-gray-400 tabular-nums">
              {est.peces.filter(p => p.peso !== '').length}/{est.peces.length} ingresados
            </span>
          </div>

          {config.con_operculos && (
            <div className="px-4 pb-3 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
              <span className="text-[10px] text-gray-400">Opérculos registrados en peces 1–50 únicamente</span>
            </div>
          )}

          {/* ── Observaciones por estanque ── */}
          <div className="px-4 pb-4 border-t border-gray-50 pt-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
              Observaciones del estanque
            </p>
            <textarea
              value={est.observaciones}
              onChange={e => setMeta('observaciones', e.target.value)}
              placeholder="Notas, incidencias o comentarios del estanque…"
              rows={3}
              className="w-full px-3 py-2.5 rounded-xl text-[13px] border border-gray-200 outline-none
                focus:border-blue-400 focus:ring-1 focus:ring-blue-100 bg-white resize-none
                placeholder:text-gray-300 text-gray-700"
            />
          </div>
        </div>

        {/* ── Navegación inferior entre estanques ── */}
        {config.cantidad_estanques > 1 && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveEstanque(i => Math.max(0, i - 1))}
              disabled={activeEstanque === 0}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-white text-gray-700 text-[14px] font-semibold
                active:bg-gray-50 disabled:opacity-30 transition-all"
              style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
              <svg width="8" height="13" viewBox="0 0 8 13" fill="none">
                <path d="M7 1L1 6.5L7 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Anterior
            </button>

            <div className="text-[12px] font-bold text-gray-400 flex-shrink-0 tabular-nums">
              {activeEstanque + 1} / {config.cantidad_estanques}
            </div>

            <button
              onClick={() => setActiveEstanque(i => Math.min(config.cantidad_estanques - 1, i + 1))}
              disabled={activeEstanque === config.cantidad_estanques - 1}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-white text-gray-700 text-[14px] font-semibold
                active:bg-gray-50 disabled:opacity-30 transition-all"
              style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
              Siguiente
              <svg width="8" height="13" viewBox="0 0 8 13" fill="none">
                <path d="M1 1L7 6.5L1 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        )}

        {/* Save button bottom */}
        <button onClick={handleSave} disabled={saving}
          className="w-full py-3.5 bg-blue-500 text-white text-[15px] font-semibold rounded-full shadow-sm shadow-blue-200 active:bg-blue-600 disabled:opacity-50 transition-colors">
          {saving ? 'Guardando…' : 'Guardar muestreo'}
        </button>

        <div className="h-4" />
      </div>
    </div>
  )
}