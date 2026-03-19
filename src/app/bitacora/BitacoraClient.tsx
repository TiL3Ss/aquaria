// src/app/bitacora/BitacoraClient.tsx

'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { LogFull, Shift } from '@/types'
import { SHIFT_LABELS, SHIFT_TIMES, CHECKLIST_ITEMS, FQ_IDENTIFIERS } from '@/types'
import { updateLog, deleteLog, createLog } from '@/app/dashboard/actions'

/* ── Types ─────────────────────────────────────────── */
interface Props {
  logFull:      LogFull | null
  module:       string
  date:         string
  shift:        Shift
  mode:         'view' | 'create'
  operatorName: string
}

type FQCell = {
  o2_saturation?: number
  dissolved_o2?:  number
  temperature?:   number
  ph?:            number
  orp?:           number
  salinity?:      number
}
type FQState = Record<string, Record<string, FQCell>>

/* ── Constants ─────────────────────────────────────── */
const SHIFT_BADGE: Record<Shift, string> = {
  noche: 'bg-indigo-100 text-indigo-700',
  dia:   'bg-amber-100  text-amber-700',
  tarde: 'bg-orange-100 text-orange-700',
}

const ALL_CHECKLIST = [
  ...CHECKLIST_ITEMS.generales,
  ...CHECKLIST_ITEMS.mantenimiento,
  ...CHECKLIST_ITEMS.equipos,
]

/* ── Component ─────────────────────────────────────── */
export default function BitacoraClient({
  logFull, module, date, shift, mode, operatorName,
}: Props) {
  const router  = useRouter()
  const formRef = useRef<HTMLFormElement>(null)

  const [isEditing,   setIsEditing]   = useState(mode === 'create')
  const [showDelete,  setShowDelete]  = useState(false)
  const [deleteInput, setDeleteInput] = useState('')
  const [saving,      setSaving]      = useState(false)
  const [deleting,    setDeleting]    = useState(false)
  const [saveOk,      setSaveOk]      = useState(false)

  /* Checklist */
  const [checked, setChecked] = useState<Set<string>>(
    new Set(logFull?.checklist.filter(c => c.checked).map(c => c.item_key) ?? [])
  )

  /* Fisicoquímicos */
  const [fqData, setFqData] = useState<FQState>(() => {
    const map: FQState = {}
    FQ_IDENTIFIERS.forEach(id => {
      map[id] = {}
      ;(['00:00','04:00'] as const).forEach(ts => {
        const f = logFull?.fisicoquimicos.find(r => r.identifier === id && r.time_slot === ts)
        map[id][ts] = f
          ? { o2_saturation: f.o2_saturation ?? undefined, dissolved_o2: f.dissolved_o2 ?? undefined,
              temperature: f.temperature ?? undefined, ph: f.ph ?? undefined,
              orp: f.orp ?? undefined, salinity: f.salinity ?? undefined }
          : {}
      })
    })
    return map
  })

  const params = logFull?.parameters
  const log    = logFull?.log

  const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('es-CL', {
    weekday:'long', day:'numeric', month:'long', year:'numeric',
  })

  /* ── Helpers ────────────────────────────────────── */
  function toggleCheck(key: string) {
    if (!isEditing) return
    setChecked(prev => {
      const n = new Set(prev)
      n.has(key) ? n.delete(key) : n.add(key)
      return n
    })
  }

  function setFQ(id: string, ts: string, field: keyof FQCell, raw: string) {
    const v = raw === '' ? undefined : parseFloat(raw)
    setFqData(prev => ({
      ...prev,
      [id]: { ...prev[id], [ts]: { ...prev[id]?.[ts], [field]: v } },
    }))
  }

  /* ── Save ───────────────────────────────────────── */
  async function handleSave() {
    if (!formRef.current) return
    setSaving(true)
    const fd = new FormData(formRef.current)

    // Checklist
    ALL_CHECKLIST.forEach(item => {
      fd.append('checklist_keys', item.key)
      fd.set(`check_${item.key}`, checked.has(item.key) ? 'true' : 'false')
    })

    // Fisicoquímicos
    const fqEntries: Record<string, unknown>[] = []
    FQ_IDENTIFIERS.forEach(id => {
      ;(['00:00','04:00'] as const).forEach(ts => {
        const cell = fqData[id]?.[ts] ?? {}
        if (Object.values(cell).some(v => v !== undefined))
          fqEntries.push({ identifier: id, time_slot: ts, ...cell })
      })
    })
    fd.set('fisicoquimicos', JSON.stringify(fqEntries))

    if (mode === 'create') {
      fd.set('module_slug', module)
      fd.set('log_date',    date)
      fd.set('shift',       shift)
      await createLog(fd)
    } else if (log) {
      await updateLog(log.id, fd)
      setIsEditing(false)
      setSaveOk(true)
      setTimeout(() => setSaveOk(false), 2500)
    }
    setSaving(false)
  }

  /* ── Delete ─────────────────────────────────────── */
  async function handleDelete() {
    if (!log) return
    setDeleting(true)
    await deleteLog(log.id)
  }

  /* ── Input class helpers ────────────────────────── */
  const fieldInput = (editing: boolean) =>
    `w-full px-3.5 py-3 rounded-xl text-[14px] border outline-none transition-all
     ${editing
       ? 'bg-white border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-50 text-gray-900'
       : 'bg-gray-50 border-transparent text-gray-700 cursor-default'}`

  const numField = (
    name: string,
    val?: number | null,
    unit?: string,
  ) => (
    <div className="relative">
      <input
        type="number"
        name={name}
        step="0.01"
        defaultValue={val ?? ''}
        readOnly={!isEditing}
        placeholder={isEditing ? '0.00' : '—'}
        className={`${fieldInput(isEditing)} ${unit ? 'pr-10' : ''}`}
      />
      {unit && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-400 font-medium pointer-events-none">
          {unit}
        </span>
      )}
    </div>
  )

  /* ── UI ─────────────────────────────────────────── */
  return (
    <div className="min-h-dvh bg-[#F2F2F7] flex flex-col">

      {/* ══ TOP NAV ════════════════════════════════════ */}
      <header className="topbar-blur border-b border-black/[0.06] px-4 h-14 flex items-center justify-between sticky top-0 z-30 pt-safe">

        {/* Back */}
        <button
          onClick={() => router.push('/dashboard')}
          className="flex items-center gap-1 text-blue-500 text-[15px] font-medium active:opacity-60 transition-opacity"
        >
          <svg width="8" height="13" viewBox="0 0 8 13" fill="none">
            <path d="M7 1L1 6.5L7 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Inicio
        </button>

        {/* Shift badge */}
        <span className={`text-[12px] font-semibold px-3 py-1 rounded-full ${SHIFT_BADGE[shift]}`}>
          {SHIFT_LABELS[shift]}
        </span>

        {/* Actions */}
        <div className="flex items-center gap-1.5">
          {/* Save success flash */}
          {saveOk && !isEditing && (
            <span className="text-[13px] text-green-600 font-medium animate-fade-in">Guardado ✓</span>
          )}

          {!isEditing && mode !== 'create' && (
            <>
              <button onClick={() => setIsEditing(true)}
                className="text-blue-500 text-[14px] font-semibold px-2 py-1 active:opacity-60 transition-opacity">
                Editar
              </button>
              <button onClick={() => setShowDelete(true)}
                className="text-red-500 text-[14px] font-semibold px-2 py-1 active:opacity-60 transition-opacity">
                Eliminar
              </button>
            </>
          )}

          {isEditing && (
            <>
              {mode !== 'create' && (
                <button onClick={() => setIsEditing(false)}
                  className="text-gray-500 text-[14px] px-2 py-1 active:opacity-60">
                  Cancelar
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-blue-500 text-white text-[13px] font-semibold px-4 py-1.5 rounded-full shadow-sm shadow-blue-200 active:bg-blue-600 transition-colors disabled:opacity-50"
              >
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </>
          )}
        </div>
      </header>

      {/* ══ CONTENT ═══════════════════════════════════ */}
      <main className="flex-1 px-4 py-4 space-y-3 max-w-lg mx-auto w-full pb-safe">

        {/* ── Info header ─── */}
        <div className="bg-white rounded-2xl card-shadow px-4 py-4 animate-fade-in">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                {module.toUpperCase()}
              </p>
              <h1 className="text-[17px] font-bold text-gray-900 capitalize leading-snug">
                {dateLabel}
              </h1>
              <p className="text-[13px] text-gray-400 mt-0.5">{SHIFT_TIMES[shift]}</p>
            </div>
            {isEditing && (
              <span className="flex-shrink-0 text-[11px] font-semibold bg-amber-50 text-amber-600 px-2.5 py-1 rounded-full">
                Editando
              </span>
            )}
          </div>
        </div>

        <form ref={formRef} onSubmit={e => e.preventDefault()} className="space-y-3">

          {/* ── 1. Metadatos ─── */}
          <Card title="Metadatos" n={1}>
            <Field label="Operador / Responsable">
              <input
                type="text"
                name="operator_name"
                defaultValue={log?.operator_name ?? operatorName}
                readOnly={!isEditing}
                placeholder="Nombre del operador"
                className={fieldInput(isEditing)}
              />
            </Field>
          </Card>

          {/* ── 2. Checklist ─── */}
          <Card title="Check-list operacional" n={2}>
            <div className="space-y-4">
              {(
                [
                  { key: 'generales',    label: 'Operaciones generales'    },
                  { key: 'mantenimiento',label: 'Mantenimiento y limpieza'  },
                  { key: 'equipos',      label: 'Estado de equipos'         },
                ] as const
              ).map(({ key, label }) => (
                <div key={key}>
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2 px-0.5">
                    {label}
                  </p>
                  <div className="space-y-1.5">
                    {CHECKLIST_ITEMS[key].map(item => {
                      const on = checked.has(item.key)
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => toggleCheck(item.key)}
                          className={`check-row w-full text-left ${on ? 'is-checked' : ''} ${!isEditing ? 'is-disabled' : ''}`}
                        >
                          {/* Circle check */}
                          <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all
                            ${on ? 'bg-green-500 border-green-500' : 'border-gray-300 bg-white'}`}>
                            {on && (
                              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                                <polyline points="2,6 5,9 10,3" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </span>
                          <span className={`text-[14px] font-medium leading-tight
                            ${on ? 'text-green-800' : 'text-gray-600'}`}>
                            {item.label}
                          </span>
                          {/* Count badge on the right */}
                          <span className="ml-auto flex-shrink-0 text-[11px]">
                            {on ? '✓' : ''}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}

              {/* Summary pill */}
              <div className="flex items-center gap-2 pt-1">
                <span className={`text-[12px] font-semibold px-3 py-1 rounded-full
                  ${checked.size === ALL_CHECKLIST.length
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-500'}`}>
                  {checked.size} / {ALL_CHECKLIST.length} completados
                </span>
              </div>
            </div>
          </Card>

          {/* ── 3. Parámetros numéricos ─── */}
          <Card title="Parámetros numéricos" n={3}>
            <div className="grid grid-cols-2 gap-x-3 gap-y-3">
              <Field label="Bomba principal">{numField('pump_main_bar',     params?.pump_main_bar,     'Bar')}</Field>
              <Field label="Bomba biofiltros">{numField('pump_biofilter_bar',params?.pump_biofilter_bar,'Bar')}</Field>
              <Field label="Flujómetros">     {numField('flowmeter_lpm',     params?.flowmeter_lpm,    'L/min')}</Field>
              <Field label="Buffer tank">     {numField('buffer_tank_bar',   params?.buffer_tank_bar,   'Bar')}</Field>
              <Field label="Ingreso agua">    {numField('water_intake',      params?.water_intake,      'dientes')}</Field>
              <Field label="Pozo">
                <select
                  name="well_level"
                  disabled={!isEditing}
                  defaultValue={params?.well_level ?? ''}
                  className={fieldInput(isEditing)}
                >
                  <option value="">—</option>
                  <option value="alto">Alto</option>
                  <option value="rebase">Rebase</option>
                </select>
              </Field>
              <Field label="Intake">   {numField('intake_value', params?.intake_value)}</Field>
              <Field label="Ozono">    {numField('ozone_pct',    params?.ozone_pct,     '%')}</Field>
            </div>
          </Card>

          {/* ── 4. Dosificación ─── */}
          <Card title="Dosificación" n={4}>
            <div className="grid grid-cols-2 gap-x-3 gap-y-3">
              <Field label="Químico B">       {numField('chemical_b_kg',  params?.chemical_b_kg,  'kg')}</Field>
              <Field label="Químico Cc">      {numField('chemical_cc',    params?.chemical_cc)}</Field>
              <Field label="Bicarbonato">     {numField('bicarbonate_kg', params?.bicarbonate_kg, 'kg')}</Field>
              <Field label="Cloruro">         {numField('chloride_kg',    params?.chloride_kg,    'kg')}</Field>
              <Field label="Metabisulfito">   {numField('metabisulfite',  params?.metabisulfite)}</Field>
              <Field label="Tipo alimentación">
                <select
                  name="feeding_type"
                  disabled={!isEditing}
                  defaultValue={params?.feeding_type ?? ''}
                  className={fieldInput(isEditing)}
                >
                  <option value="">—</option>
                  <option value="manual">Manual</option>
                  <option value="automatica">Automática</option>
                </select>
              </Field>
              <Field label="Cant. alimento" className="col-span-2">
                {numField('feeding_amount', params?.feeding_amount, 'kg')}
              </Field>
            </div>
          </Card>

          {/* ── 5. Fisicoquímicos ─── */}
          <Card title="Parámetros fisicoquímicos" n={5}>
            {/* Explanation */}
            <p className="text-[12px] text-gray-400 mb-3 leading-relaxed">
              Ingresa los valores por identificador y horario. Los campos pH, ORP y Salinidad aplican al registro general del turno.
            </p>

            {/* Scrollable table */}
            <div className="overflow-x-auto -mx-4 px-4 scrollbar-none">
              <table className="border-collapse" style={{ minWidth: 560 }}>
                <thead>
                  <tr>
                    <th className="text-left text-[11px] font-bold text-gray-400 uppercase tracking-wide pb-3 pr-3 w-12 sticky left-0 bg-white z-10">
                      ID
                    </th>
                    {/* 00:00 group */}
                    <th colSpan={3} className="text-center text-[10px] font-bold text-indigo-400 uppercase tracking-wider pb-1 border-b-2 border-indigo-100">
                      00:00
                    </th>
                    {/* 04:00 group */}
                    <th colSpan={3} className="text-center text-[10px] font-bold text-blue-400 uppercase tracking-wider pb-1 border-b-2 border-blue-100 pl-2">
                      04:00
                    </th>
                    {/* General */}
                    <th colSpan={3} className="text-center text-[10px] font-bold text-teal-400 uppercase tracking-wider pb-1 border-b-2 border-teal-100 pl-2">
                      General
                    </th>
                  </tr>
                  <tr>
                    <th />
                    {/* 00:00 */}
                    {['Sat%','O₂','T°C'].map(h => (
                      <th key={`h00-${h}`} className="text-center text-[11px] text-gray-400 font-semibold pb-2 px-1 whitespace-nowrap">{h}</th>
                    ))}
                    {/* 04:00 */}
                    {['Sat%','O₂','T°C'].map(h => (
                      <th key={`h04-${h}`} className="text-center text-[11px] text-gray-400 font-semibold pb-2 px-1 whitespace-nowrap">{h}</th>
                    ))}
                    {/* General */}
                    {['pH','ORP','Sal'].map(h => (
                      <th key={`hg-${h}`} className="text-center text-[11px] text-gray-400 font-semibold pb-2 px-1 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {/* Separator rows for C vs TK */}
                  {FQ_IDENTIFIERS.map((id, rowIdx) => {
                    const prevId = FQ_IDENTIFIERS[rowIdx - 1]
                    const isTKstart = id === 'TK1' && prevId?.startsWith('C')
                    const isC = id.startsWith('C')

                    return (
                      <>
                        {isTKstart && (
                          <tr key="sep-tk">
                            <td colSpan={10} className="py-1">
                              <div className="h-px bg-gray-100 my-1" />
                            </td>
                          </tr>
                        )}
                        <tr key={id} className={`transition-colors ${isC ? '' : 'bg-blue-50/30'}`}>
                          {/* ID cell — sticky on mobile */}
                          <td className="pr-3 py-1.5 font-bold text-[13px] text-blue-500 sticky left-0 bg-white whitespace-nowrap">
                            {id}
                          </td>

                          {/* 00:00 fields */}
                          {(['o2_saturation','dissolved_o2','temperature'] as const).map(field => (
                            <td key={`00-${field}`} className="px-1 py-1.5">
                              <input
                                type="number" step="0.01"
                                value={fqData[id]?.['00:00']?.[field] ?? ''}
                                onChange={e => setFQ(id, '00:00', field, e.target.value)}
                                readOnly={!isEditing}
                                className={`fq-input ${isEditing ? 'editing' : ''}`}
                                placeholder="—"
                              />
                            </td>
                          ))}

                          {/* 04:00 fields */}
                          {(['o2_saturation','dissolved_o2','temperature'] as const).map(field => (
                            <td key={`04-${field}`} className="px-1 py-1.5">
                              <input
                                type="number" step="0.01"
                                value={fqData[id]?.['04:00']?.[field] ?? ''}
                                onChange={e => setFQ(id, '04:00', field, e.target.value)}
                                readOnly={!isEditing}
                                className={`fq-input ${isEditing ? 'editing' : ''}`}
                                placeholder="—"
                              />
                            </td>
                          ))}

                          {/* General params (pH, ORP, salinity) */}
                          {(['ph','orp','salinity'] as const).map(field => (
                            <td key={`gen-${field}`} className="px-1 py-1.5">
                              <input
                                type="number" step="0.01"
                                value={fqData[id]?.['00:00']?.[field] ?? ''}
                                onChange={e => setFQ(id, '00:00', field, e.target.value)}
                                readOnly={!isEditing}
                                className={`fq-input ${isEditing ? 'editing' : ''}`}
                                placeholder="—"
                              />
                            </td>
                          ))}
                        </tr>
                      </>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* ── 6. Notas ─── */}
          <Card title="Observaciones" n={6}>
            <textarea
              name="notes"
              rows={4}
              readOnly={!isEditing}
              defaultValue={log?.notes ?? ''}
              placeholder={isEditing ? 'Escribe observaciones del turno aquí…' : 'Sin observaciones registradas.'}
              className={`w-full px-3.5 py-3 rounded-xl text-[14px] resize-none border outline-none transition-all leading-relaxed
                ${isEditing
                  ? 'bg-white border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-50 text-gray-900'
                  : 'bg-gray-50 border-transparent text-gray-600 cursor-default'}`}
            />
          </Card>

        </form>
      </main>

      {/* ══ DELETE BOTTOM SHEET ════════════════════════ */}
      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40">
          <div className="animate-slide-up bg-white rounded-t-3xl w-full max-w-lg mx-auto px-5 pt-4 pb-safe space-y-4">
            {/* Handle */}
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto" />

            {/* Icon */}
            <div className="w-14 h-14 rounded-2xl bg-red-100 flex items-center justify-center mx-auto">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14H6L5 6"/>
                <path d="M10 11v6"/><path d="M14 11v6"/>
                <path d="M9 6V4h6v2"/>
              </svg>
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-[18px] font-bold text-gray-900">Eliminar bitácora</h3>
              <p className="text-[13px] text-gray-500 leading-relaxed">
                Se eliminarán todos los datos del turno: checklist, parámetros y registros fisicoquímicos. Esta acción no puede deshacerse.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[12px] font-bold text-gray-500 uppercase tracking-wider px-0.5">
                Escribe <span className="text-red-500 font-mono">ELIMINAR</span> para confirmar
              </label>
              <input
                type="text"
                value={deleteInput}
                onChange={e => setDeleteInput(e.target.value)}
                placeholder="ELIMINAR"
                autoCapitalize="characters"
                className="w-full px-4 py-3.5 bg-gray-50 rounded-2xl text-[15px] font-mono border border-gray-200 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-50 transition-all"
              />
            </div>

            <div className="flex gap-3 pb-2">
              <button
                onClick={() => { setShowDelete(false); setDeleteInput('') }}
                className="flex-1 py-3.5 rounded-2xl bg-gray-100 text-gray-700 font-semibold text-[15px] active:bg-gray-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteInput !== 'ELIMINAR' || deleting}
                className="flex-1 py-3.5 rounded-2xl bg-red-500 text-white font-semibold text-[15px] active:bg-red-600 transition-colors disabled:opacity-35"
              >
                {deleting ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Helper sub-components ───────────────────────── */
function Card({
  title, n, children,
}: {
  title: string; n: number; children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl card-shadow overflow-hidden animate-fade-in">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2.5">
        <span className="w-6 h-6 rounded-lg bg-blue-50 text-blue-500 text-[11px] font-bold flex items-center justify-center flex-shrink-0">
          {n}
        </span>
        <span className="text-[14px] font-semibold text-gray-900">{title}</span>
      </div>
      <div className="px-4 py-4">{children}</div>
    </div>
  )
}

function Field({
  label, children, className = '',
}: {
  label: string; children: React.ReactNode; className?: string
}) {
  return (
    <div className={`space-y-1 ${className}`}>
      <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-0.5">
        {label}
      </label>
      {children}
    </div>
  )
}