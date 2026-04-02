// src/app/bitacora/BitacoraClient.tsx

'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { LogFull, Shift } from '@/types'
import { SHIFT_LABELS, SHIFT_TIMES, SHIFT_SLOTS, FQ_IDENTIFIERS_HAT, FQ_IDENTIFIERS_FF } from '@/types'
import {
  updateLog, deleteLog, createLog,
  addChecklistConfigItem, updateChecklistConfigItem,
  toggleChecklistConfigItem, deleteChecklistConfigItem,
} from '@/app/dashboard/actions'
import type { ChecklistConfigItem } from '@/app/dashboard/actions'
import { generateBitacoraPdf } from '@/lib/generateBitacoraPdf'

/* ── Types ─────────────────────────────────────────── */
interface Props {
  logFull:         LogFull | null
  module:          string
  date:            string
  shift:           Shift
  mode:            'view' | 'create'
  operatorName:    string
  checklistConfig: ChecklistConfigItem[]
}

type FQCell    = { o2_saturation?: number; dissolved_o2?: number; temperature?: number }
type FQState   = Record<string, Record<string, FQCell>>
type PozoCell  = { temperature?: number; o2_saturation?: number; dissolved_o2?: number }
type PozoState = Record<string, PozoCell>

/* ── Constants ─────────────────────────────────────── */
const SHIFT_BADGE: Record<Shift, string> = {
  noche: 'bg-indigo-100 text-indigo-700',
  dia:   'bg-amber-100  text-amber-700',
  tarde: 'bg-orange-100 text-orange-700',
}

const OSMOSIS_OPTIONS = ['1/4', '2/4', '3/4', '4/4', 'Muy bajo', 'Bajo', 'Medio', 'Lleno']

const isHAT = (m: string) => m.toLowerCase() === 'hat'
const isFF  = (m: string) => m.toLowerCase() === 'ff'

function parseAdditionalOperators(arr: string[]): string | null {
  const filtered = arr.filter(s => s.trim() !== '')
  return filtered.length > 0 ? filtered.join(', ') : null
}

/* ── Convierte valor de BD (string | number | null) → number | undefined ── */
function toNum(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return isNaN(n) ? undefined : n
}

/* ── Devuelve true si al menos uno de los campos tiene valor real ── */
function hasAnyValue(entry: Record<string, unknown>, keys: string[]): boolean {
  return keys.some(k => entry[k] !== null && entry[k] !== undefined)
}

/* ── Component ─────────────────────────────────────── */
export default function BitacoraClient({
  logFull, module, date, shift, mode, operatorName, checklistConfig: initialConfig,
}: Props) {
  const router      = useRouter()
  const formRef     = useRef<HTMLFormElement>(null)
  // Ref para bloquear doble ejecución del guardado (race condition)
  const isSavingRef = useRef(false)

  /* ── UI state ─── */
  const [isEditing,  setIsEditing]  = useState(mode === 'create')
  const [showDelete, setShowDelete] = useState(false)
  const [deleteInput,setDeleteInput]= useState('')
  const [saving,     setSaving]     = useState(false)
  const [deleting,   setDeleting]   = useState(false)
  const [saveOk,     setSaveOk]     = useState(false)
  const [clock,      setClock]      = useState('')
  const [activeSlot, setActiveSlot] = useState<'A' | 'B'>('A')

  /* ── Navigation helpers ─── */
  function goBack() { router.push(`/dashboard?module=${module}&date=${date}`) }
  function goHome()  { router.push(`/dashboard?module=${module}`) }

  /* ── Clock ─── */
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('es-CL', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  /* ── Slots ─── */
  const [slotA, slotB] = SHIFT_SLOTS[shift]
  const currentSlot    = activeSlot === 'A' ? slotA : slotB
  const fqIds          = isHAT(module) ? FQ_IDENTIFIERS_HAT : isFF(module) ? FQ_IDENTIFIERS_FF : []

  /* ── Checklist config ─── */
  const [config,       setConfig]       = useState<ChecklistConfigItem[]>(initialConfig ?? [])
  const [newTaskLabel, setNewTaskLabel] = useState('')
  const [editingItem,  setEditingItem]  = useState<{ id: string; label: string } | null>(null)
  const [taskPending,  setTaskPending]  = useState(false)

  const activeItems = config.filter(i => i.active)
  const ALL_KEYS    = activeItems.map(i => i.item_key)

  const [checked, setChecked] = useState<Set<string>>(
    new Set(logFull?.checklist.filter(c => c.checked).map(c => c.item_key) ?? [])
  )

  /* ── FQ state ───────────────────────────────────────────────────────────────
   * Supabase retorna valores numéricos como strings ("100.00").
   * toNum() los convierte a number para que los inputs controlados funcionen.
   * ─────────────────────────────────────────────────────────────────────────── */
  const [fqData, setFqData] = useState<FQState>(() => {
    const map: FQState = {}
    fqIds.forEach(id => {
      map[id] = {}
      ;[slotA, slotB].forEach(ts => {
        const f = logFull?.fisicoquimicos.find(r => r.identifier === id && r.time_slot === ts)
        map[id][ts] = f
          ? {
              o2_saturation: toNum(f.o2_saturation),
              dissolved_o2:  toNum(f.dissolved_o2),
              temperature:   toNum(f.temperature),
            }
          : {}
      })
    })
    return map
  })

  const [tempSlotA, setTempSlotA] = useState<string>(() => {
    const f = logFull?.fisicoquimicos.find(r => r.time_slot === slotA)
    const n = toNum(f?.temperature)
    return n !== undefined ? String(n) : ''
  })
  const [tempSlotB, setTempSlotB] = useState<string>(() => {
    const f = logFull?.fisicoquimicos.find(r => r.time_slot === slotB)
    const n = toNum(f?.temperature)
    return n !== undefined ? String(n) : ''
  })

  /* ── Pozo state (HAT only) ─── */
  const [pozoData, setPozoData] = useState<PozoState>(() => {
    const map: PozoState = { [slotA]: {}, [slotB]: {} }
    logFull?.pozo?.forEach(r => {
      map[r.time_slot] = {
        temperature:   toNum(r.temperature),
        o2_saturation: toNum(r.o2_saturation),
        dissolved_o2:  toNum(r.dissolved_o2),
      }
    })
    return map
  })

  const params = logFull?.parameters
  const log    = logFull?.log

  /* ── Responsables adicionales ─── */
  const [extraResponsables, setExtraResponsables] = useState<string[]>(() => {
    const raw = log?.additional_operators
    if (!raw) return []
    return raw.split(', ').filter(s => s.trim() !== '')
  })

  const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('es-CL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  /* ── Helpers ─── */
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

  function setPozo(ts: string, field: keyof PozoCell, raw: string) {
    const v = raw === '' ? undefined : parseFloat(raw)
    setPozoData(prev => ({ ...prev, [ts]: { ...prev[ts], [field]: v } }))
  }

  /* ── Checklist CRUD ─── */
  async function handleAddTask() {
    if (!newTaskLabel.trim()) return
    setTaskPending(true)
    const res = await addChecklistConfigItem(module, newTaskLabel.trim())
    if (res.data) { setConfig(prev => [...prev, res.data!]); setNewTaskLabel('') }
    setTaskPending(false)
  }

  async function handleUpdateTask() {
    if (!editingItem) return
    setTaskPending(true)
    await updateChecklistConfigItem(editingItem.id, editingItem.label)
    setConfig(prev => prev.map(i => i.id === editingItem.id ? { ...i, label: editingItem.label } : i))
    setEditingItem(null)
    setTaskPending(false)
  }

  async function handleToggleItem(id: string, active: boolean) {
    setTaskPending(true)
    await toggleChecklistConfigItem(id, active)
    setConfig(prev => prev.map(i => i.id === id ? { ...i, active } : i))
    setTaskPending(false)
  }

  async function handleDeleteItem(id: string) {
    setTaskPending(true)
    await deleteChecklistConfigItem(id)
    setConfig(prev => prev.filter(i => i.id !== id))
    setTaskPending(false)
  }

  /* ── Construir entradas FQ ──────────────────────────────────────────────────
   * filterEmpty=true  → create: omite filas donde todo es null
   * filterEmpty=false → update: incluye todas las filas (null borra en BD)
   * ─────────────────────────────────────────────────────────────────────────── */
  function buildFqEntries(filterEmpty: boolean): Record<string, unknown>[] {
    const tempA = tempSlotA !== '' ? parseFloat(tempSlotA) : null
    const tempB = tempSlotB !== '' ? parseFloat(tempSlotB) : null
    const entries: Record<string, unknown>[] = []

    fqIds.forEach(id => {
      ;[slotA, slotB].forEach(ts => {
        const cell = fqData[id]?.[ts] ?? {}
        const entry: Record<string, unknown> = {
          identifier:    id,
          time_slot:     ts,
          o2_saturation: cell.o2_saturation ?? null,
          dissolved_o2:  cell.dissolved_o2  ?? null,
          temperature:   ts === slotA ? tempA : tempB,
        }
        if (filterEmpty && !hasAnyValue(entry, ['o2_saturation', 'dissolved_o2', 'temperature'])) return
        entries.push(entry)
      })
    })

    return entries
  }

  /* ── Construir entradas Pozo ─── */
  function buildPozoEntries(filterEmpty: boolean): Record<string, unknown>[] {
    const entries: Record<string, unknown>[] = []
    if (!isHAT(module)) return entries

    ;[slotA, slotB].forEach(ts => {
      const cell = pozoData[ts] ?? {}
      const entry: Record<string, unknown> = {
        time_slot:     ts,
        temperature:   cell.temperature   ?? null,
        o2_saturation: cell.o2_saturation ?? null,
        dissolved_o2:  cell.dissolved_o2  ?? null,
      }
      if (filterEmpty && !hasAnyValue(entry, ['temperature', 'o2_saturation', 'dissolved_o2'])) return
      entries.push(entry)
    })

    return entries
  }

  /* ── Save ───────────────────────────────────────────────────────────────────
   * isSavingRef bloquea doble ejecución causada por doble click.
   * setSaving controla el estado visual del botón.
   * ─────────────────────────────────────────────────────────────────────────── */
  async function handleSave() {
    if (!formRef.current)    return
    if (isSavingRef.current) return  // bloquea segunda llamada antes de que termine la primera
    isSavingRef.current = true
    setSaving(true)

    try {
      if (mode === 'create') {
        const form      = formRef.current
        const numInputs = form.querySelectorAll('input[type="number"], select')
        const payload: Record<string, unknown> = {
          module_slug:          module,
          log_date:             date,
          shift,
          operator_name:        (form.querySelector('[name="operator_name"]') as HTMLInputElement)?.value,
          notes:                (form.querySelector('[name="notes"]') as HTMLTextAreaElement)?.value,
          additional_operators: parseAdditionalOperators(extraResponsables),
          checklist_keys:       ALL_KEYS,
          fisicoquimicos:       buildFqEntries(true),
          pozo:                 buildPozoEntries(true),
        }
        ALL_KEYS.forEach(key => { payload[`check_${key}`] = checked.has(key) })
        numInputs.forEach(el => {
          const input = el as HTMLInputElement | HTMLSelectElement
          if (input.name) {
            payload[input.name] = input.type === 'number'
              ? (input.value !== '' ? parseFloat(input.value) : null)
              : (input.value || null)
          }
        })
        await createLog(payload)
        // El server action hace redirect() — el código no continúa desde aquí
        return
      }

      if (log) {
        const form      = formRef.current
        const numInputs = form.querySelectorAll('input[type="number"], select')
        const payload: Record<string, unknown> = {
          operator_name:        (form.querySelector('[name="operator_name"]') as HTMLInputElement)?.value,
          notes:                (form.querySelector('[name="notes"]') as HTMLTextAreaElement)?.value,
          additional_operators: parseAdditionalOperators(extraResponsables),
          checklist_keys:       ALL_KEYS,
          fisicoquimicos:       buildFqEntries(false),
          pozo:                 buildPozoEntries(false),
        }
        ALL_KEYS.forEach(key => { payload[`check_${key}`] = checked.has(key) })
        numInputs.forEach(el => {
          const input = el as HTMLInputElement | HTMLSelectElement
          if (input.name) {
            payload[input.name] = input.type === 'number'
              ? (input.value !== '' ? parseFloat(input.value) : null)
              : (input.value || null)
          }
        })
        await updateLog(log.id, payload)
        setIsEditing(false)
        setSaveOk(true)
        setTimeout(() => setSaveOk(false), 2500)
      }
    } finally {
      // Siempre liberar el lock, incluso si hay error
      isSavingRef.current = false
      setSaving(false)
    }
  }

  /* ── Delete ─── */
  async function handleDelete() {
    if (!log) return
    setDeleting(true)
    await deleteLog(log.id)
  }

  /* ── Input helpers ─── */
  const fieldCls = (editing: boolean) =>
    `w-full px-3.5 py-3 rounded-xl text-[14px] border outline-none transition-all
     ${editing
       ? 'bg-white border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-50 text-gray-900'
       : 'bg-gray-50 border-transparent text-gray-700 cursor-default'}`

  const numField = (name: string, val?: number | null, unit?: string) => (
    <div className="relative">
      <input
        type="number" name={name} step="0.01"
        defaultValue={val ?? ''}
        readOnly={!isEditing}
        placeholder={isEditing ? '0.00' : '—'}
        className={`${fieldCls(isEditing)} ${unit ? 'pr-10' : ''}`}
      />
      {unit && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-400 font-medium pointer-events-none">
          {unit}
        </span>
      )}
    </div>
  )

  /* ── UI ─── */
  return (
    <div className="min-h-dvh bg-[#F2F2F7] flex flex-col">

      {/* ══ TOP NAV ══ */}
<header className="topbar-blur border-b border-black/[0.06] px-3 h-14 flex items-center justify-between sticky top-0 z-30 pt-safe">
  
  {/* ── Izquierda: Volver + Home ── */}
  <div className="flex items-center gap-1.5 min-w-0">
    <button onClick={goBack}
      className="flex items-center gap-1 text-blue-500 text-[14px] font-medium active:opacity-60 transition-opacity shrink-0">
      <svg width="8" height="13" viewBox="0 0 8 13" fill="none">
        <path d="M7 1L1 6.5L7 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <span>Turno</span>
    </button>
    <button onClick={goHome}
      className="w-8 h-8 flex items-center justify-center rounded-xl bg-gray-100 text-gray-500 active:opacity-60 transition-opacity shrink-0"
      aria-label="Inicio">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/>
        <path d="M9 21V12h6v9"/>
      </svg>
    </button>
  </div>

  {/* ── Centro: Badge de turno ── */}
  <div className={`flex flex-col items-center px-3 py-1 rounded-2xl shrink-0 ${SHIFT_BADGE[shift]}`}>
    <span className="text-[11px] font-bold leading-tight">{SHIFT_LABELS[shift]}</span>
    <span className="text-[10px] font-mono tabular-nums opacity-80">{clock}</span>
  </div>

  {/* ── Derecha: Acciones ── */}
  <div className="flex items-center gap-1.5 min-w-0">
    
    {/* Guardado OK */}
    {saveOk && !isEditing && (
      <span className="text-[12px] text-green-600 font-semibold animate-fade-in shrink-0">✓</span>
    )}

    {/* Modo vista */}
    {!isEditing && mode !== 'create' && (
      <>
        {/* PDF */}
        <button
          onClick={() => logFull && generateBitacoraPdf(logFull, module, date, shift, config)}
          className="w-8 h-8 flex items-center justify-center rounded-xl bg-gray-100 text-gray-500 active:opacity-60 transition-opacity"
          aria-label="Descargar PDF">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </button>

        {/* Editar → ícono lápiz */}
        <button onClick={() => setIsEditing(true)}
          className="w-8 h-8 flex items-center justify-center rounded-xl bg-blue-50 text-blue-500 active:opacity-60 transition-opacity"
          aria-label="Editar">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>

        {/* Eliminar → ícono basura */}
        <button onClick={() => setShowDelete(true)}
          className="w-8 h-8 flex items-center justify-center rounded-xl bg-red-50 text-red-400 active:opacity-60 transition-opacity"
          aria-label="Eliminar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14H6L5 6"/>
            <path d="M10 11v6"/><path d="M14 11v6"/>
            <path d="M9 6V4h6v2"/>
          </svg>
        </button>
      </>
    )}

    {/* Modo edición */}
    {isEditing && (
      <>
        {/* Cancelar → ícono X */}
        {mode !== 'create' && (
          <button onClick={() => setIsEditing(false)}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-gray-100 text-gray-500 active:opacity-60 transition-opacity"
            aria-label="Cancelar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        )}

        {/* Guardar → texto corto con pill */}
        <button onClick={handleSave} disabled={saving}
          className="bg-blue-500 text-white text-[13px] font-semibold px-3.5 py-1.5 rounded-full shadow-sm shadow-blue-200 active:bg-blue-600 transition-colors disabled:opacity-50 shrink-0">
          {saving ? '…' : 'Guardar'}
        </button>
      </>
    )}
  </div>
</header>

      {/* ══ CONTENT ══ */}
      <main className="flex-1 px-4 py-4 space-y-3 max-w-lg mx-auto w-full pb-safe">

        <div className="bg-white rounded-2xl card-shadow px-4 py-4 animate-fade-in">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">{module.toUpperCase()}</p>
              <h1 className="text-[17px] font-bold text-gray-900 capitalize leading-snug">{dateLabel}</h1>
              <p className="text-[13px] text-gray-400 mt-0.5">{SHIFT_TIMES[shift]}</p>
            </div>
            {isEditing && (
              <span className="flex-shrink-0 text-[11px] font-semibold bg-amber-50 text-amber-600 px-2.5 py-1 rounded-full">Editando</span>
            )}
          </div>
        </div>

        <form ref={formRef} onSubmit={e => e.preventDefault()} className="space-y-3">

          {/* ── 1. Metadatos ─── */}
          <Card title="Metadatos" n={1}>
            <div className="space-y-3">
              <Field label="Operador / Responsable">
                <input type="text" name="operator_name"
                  defaultValue={log?.operator_name ?? operatorName}
                  readOnly={!isEditing} placeholder="Nombre del operador"
                  className={fieldCls(isEditing)}
                />
              </Field>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-0.5">
                  Responsables adicionales
                </label>
                {extraResponsables.map((r, i) => (
                  <div key={i} className="flex gap-2">
                    <input type="text" value={r} readOnly={!isEditing}
                      onChange={e => {
                        const n = [...extraResponsables]
                        n[i] = e.target.value
                        setExtraResponsables(n)
                      }}
                      className={`${fieldCls(isEditing)} flex-1`}
                    />
                    {isEditing && (
                      <button type="button"
                        onClick={() => setExtraResponsables(prev => prev.filter((_, j) => j !== i))}
                        className="px-3 text-red-400 text-[18px] active:opacity-60">×</button>
                    )}
                  </div>
                ))}
                {isEditing && (
                  <button type="button" onClick={() => setExtraResponsables(prev => [...prev, ''])}
                    className="w-full py-2.5 rounded-xl border border-dashed border-blue-200 text-blue-500 text-[13px] font-medium hover:bg-blue-50 transition-colors">
                    + Agregar responsable
                  </button>
                )}
              </div>
            </div>
          </Card>

          {/* ── 2. Checklist ─── */}
          <Card title="Check-list operacional" n={2}>
            <div className="space-y-2">
              <div className="space-y-1.5">
                {config.map(item => (
                  <div key={item.id} className="flex items-center gap-2">
                    <div className="flex-1">
                      {editingItem?.id === item.id ? (
                        <div className="flex gap-2">
                          <input type="text" value={editingItem.label}
                            onChange={e => setEditingItem({ ...editingItem, label: e.target.value })}
                            className="flex-1 px-3 py-2 rounded-xl text-[14px] border border-blue-300 outline-none focus:ring-2 focus:ring-blue-50 bg-white"
                            autoFocus
                          />
                          <button type="button" onClick={handleUpdateTask} disabled={taskPending}
                            className="px-3 py-2 rounded-xl bg-blue-500 text-white text-[13px] font-semibold disabled:opacity-50">OK</button>
                          <button type="button" onClick={() => setEditingItem(null)}
                            className="px-3 py-2 rounded-xl bg-gray-100 text-gray-600 text-[13px]">✕</button>
                        </div>
                      ) : (
                        <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${!item.active ? 'opacity-40' : ''}`}>
                          <button type="button" onClick={() => toggleCheck(item.item_key)} disabled={!item.active}
                            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all
                              ${checked.has(item.item_key) && item.active
                                ? 'bg-green-500 border-green-500'
                                : 'border-gray-300 bg-white'}`}>
                            {checked.has(item.item_key) && item.active && (
                              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                                <polyline points="2,6 5,9 10,3" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </button>
                          <span className={`text-[14px] font-medium leading-tight flex-1
                            ${checked.has(item.item_key) && item.active ? 'text-green-800' : 'text-gray-600'}`}>
                            {item.label}
                          </span>
                        </div>
                      )}
                    </div>
                    {isEditing && !editingItem && (
                      <div className="flex gap-1 flex-shrink-0">
                        <button type="button" onClick={() => setEditingItem({ id: item.id, label: item.label })}
                          className="w-7 h-7 rounded-lg bg-gray-100 text-gray-400 text-[12px] flex items-center justify-center active:opacity-60"
                          title="Editar">✎</button>
                        <button type="button" onClick={() => handleToggleItem(item.id, !item.active)} disabled={taskPending}
                          className={`w-7 h-7 rounded-lg text-[11px] flex items-center justify-center active:opacity-60 disabled:opacity-40 font-bold
                            ${item.active ? 'bg-amber-50 text-amber-500' : 'bg-green-50 text-green-500'}`}
                          title={item.active ? 'Desactivar' : 'Activar'}>
                          {item.active ? '○' : '●'}
                        </button>
                        <button type="button" onClick={() => handleDeleteItem(item.id)} disabled={taskPending}
                          className="w-7 h-7 rounded-lg bg-red-50 text-red-400 text-[13px] flex items-center justify-center active:opacity-60 disabled:opacity-40"
                          title="Eliminar">×</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {isEditing && (
                <div className="pt-2 space-y-2 border-t border-gray-100">
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider pt-1">
                    Nueva tarea — {module.toUpperCase()}
                  </p>
                  <div className="flex gap-2">
                    <input type="text" value={newTaskLabel}
                      onChange={e => setNewTaskLabel(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddTask())}
                      placeholder="Descripción de la tarea…"
                      className="flex-1 px-3.5 py-2.5 rounded-xl text-[14px] border border-gray-200 bg-gray-50 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-50 transition-all"
                    />
                    <button type="button" onClick={handleAddTask} disabled={taskPending || !newTaskLabel.trim()}
                      className="px-4 py-2.5 rounded-xl bg-blue-500 text-white text-[13px] font-semibold disabled:opacity-40 active:bg-blue-600 transition-colors">
                      {taskPending ? '…' : 'Agregar'}
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-400">Las tareas se guardan para este módulo.</p>
                </div>
              )}

              <div className="pt-1">
                <span className={`text-[12px] font-semibold px-3 py-1 rounded-full
                  ${checked.size === ALL_KEYS.length && ALL_KEYS.length > 0
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-500'}`}>
                  {checked.size} / {ALL_KEYS.length} completados
                </span>
              </div>
            </div>
          </Card>

          {/* ── 3. Parámetros numéricos ─── */}
          <Card title="Parámetros numéricos" n={3}>
            <div className="grid grid-cols-2 gap-x-3 gap-y-3">
              {isHAT(module) && (
                <>
                  <Field label="Bomba principal">     {numField('pump_main_bar',      params?.pump_main_bar,      'Bar')}</Field>
                  <Field label="Bomba biofiltros">    {numField('pump_biofilter_bar', params?.pump_biofilter_bar, 'Bar')}</Field>
                  <Field label="Flujómetro de Sala">  {numField('flowmeter_room_lpm', params?.flowmeter_room_lpm, 'L/min')}</Field>
                  <Field label="Flujómetros Bandejas">{numField('flowmeter_lpm',      params?.flowmeter_lpm,      'L/min')}</Field>
                  <Field label="Buffer tank">         {numField('buffer_tank_bar',    params?.buffer_tank_bar,    'Bar')}</Field>
                  <Field label="Ingreso agua" className="col-span-2">
                    {numField('water_intake', params?.water_intake, 'dientes')}
                  </Field>
                </>
              )}
              {isFF(module) && (
                <>
                  <Field label="Ozono">  {numField('ozone_pct',    params?.ozone_pct,    '%')}</Field>
                  <Field label="Intake"> {numField('intake_value', params?.intake_value)}</Field>
                  <Field label="Osmosis" className="col-span-2">
                    <select name="osmosis_value" disabled={!isEditing}
                      defaultValue={params?.osmosis_value ?? ''}
                      className={fieldCls(isEditing)}>
                      <option value="">—</option>
                      {OSMOSIS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </Field>
                  <Field label="pH">        {numField('ph_ff',       params?.ph_ff)}</Field>
                  <Field label="Salinidad"> {numField('salinity_ff', params?.salinity_ff, 'ppt')}</Field>
                  <Field label="ORP" className="col-span-2">
                    {numField('orp_ff', params?.orp_ff, 'mV')}
                  </Field>
                </>
              )}
            </div>
          </Card>

          {/* ── 4. Químicos ─── */}
          <Card title="Químicos" n={4}>
            <div className="grid grid-cols-2 gap-x-3 gap-y-3">
              <Field label="Bicarbonato de sodio">{numField('bicarbonate_kg', params?.bicarbonate_kg, 'kg')}</Field>
              <Field label="Cloruro de calcio">   {numField('chloride_kg',    params?.chloride_kg,    'kg')}</Field>
            </div>
          </Card>

          {/* ── 5. Fisicoquímicos ─── */}
          {fqIds.length > 0 && (
            <Card title="Parámetros fisicoquímicos" n={5}>
              <p className="text-[12px] text-gray-400 mb-3 leading-relaxed">
                Sat% y O₂ (Mg/L) por identificador. Temperatura compartida por horario.
              </p>
              <div className="flex gap-2 mb-4">
                {(['A', 'B'] as const).map(tab => (
                  <button key={tab} type="button" onClick={() => setActiveSlot(tab)}
                    className={`flex-1 py-2 rounded-xl text-[13px] font-semibold transition-colors
                      ${activeSlot === tab
                        ? 'bg-blue-500 text-white shadow-sm shadow-blue-200'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                    {tab === 'A' ? slotA : slotB}
                  </button>
                ))}
              </div>
              <div className="mb-4">
                <Field label={`Temperatura ${currentSlot}`}>
                  <div className="relative">
                    <input type="number" step="0.01"
                      value={activeSlot === 'A' ? tempSlotA : tempSlotB}
                      onChange={e => activeSlot === 'A'
                        ? setTempSlotA(e.target.value)
                        : setTempSlotB(e.target.value)
                      }
                      readOnly={!isEditing}
                      placeholder={isEditing ? '0.00' : '—'}
                      className={`${fieldCls(isEditing)} pr-10`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-400 font-medium pointer-events-none">°C</span>
                  </div>
                </Field>
              </div>
              <div className="overflow-x-auto -mx-4 px-4 scrollbar-none">
                <table className="border-collapse w-full">
                  <thead>
                    <tr>
                      <th className="text-left text-[11px] font-bold text-gray-400 uppercase tracking-wide pb-2 pr-3 sticky left-0 bg-white z-10 w-12">ID</th>
                      <th className="text-center text-[11px] text-gray-400 font-semibold pb-2 px-2">Sat%</th>
                      <th className="text-center text-[11px] text-gray-400 font-semibold pb-2 px-2">Mg/L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fqIds.map(id => (
                      <tr key={id}>
                        <td className="pr-3 py-1.5 font-bold text-[13px] text-blue-500 sticky left-0 bg-white whitespace-nowrap">{id}</td>
                        {(['o2_saturation', 'dissolved_o2'] as const).map(field => (
                          <td key={field} className="px-1 py-1.5">
                            <input type="number" step="0.01"
                              value={fqData[id]?.[currentSlot]?.[field] ?? ''}
                              onChange={e => setFQ(id, currentSlot, field, e.target.value)}
                              readOnly={!isEditing}
                              className="fq-input w-full text-center"
                              placeholder="—"
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* ── 6. Pozo (HAT only) ─── */}
          {isHAT(module) && (
            <Card title="Parámetros de Pozo" n={6}>
              <div className="flex gap-2 mb-4">
                {(['A', 'B'] as const).map(tab => (
                  <button key={tab} type="button" onClick={() => setActiveSlot(tab)}
                    className={`flex-1 py-2 rounded-xl text-[13px] font-semibold transition-colors
                      ${activeSlot === tab
                        ? 'bg-indigo-500 text-white shadow-sm'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                    {tab === 'A' ? slotA : slotB}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Temperatura">
                  <div className="relative">
                    <input type="number" step="0.01"
                      value={pozoData[currentSlot]?.temperature ?? ''}
                      onChange={e => setPozo(currentSlot, 'temperature', e.target.value)}
                      readOnly={!isEditing} placeholder={isEditing ? '0.00' : '—'}
                      className={`${fieldCls(isEditing)} pr-8`}
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 pointer-events-none">°C</span>
                  </div>
                </Field>
                <Field label="Sat%">
                  <input type="number" step="0.01"
                    value={pozoData[currentSlot]?.o2_saturation ?? ''}
                    onChange={e => setPozo(currentSlot, 'o2_saturation', e.target.value)}
                    readOnly={!isEditing} placeholder={isEditing ? '0.00' : '—'}
                    className={fieldCls(isEditing)}
                  />
                </Field>
                <Field label="Mg/L">
                  <input type="number" step="0.01"
                    value={pozoData[currentSlot]?.dissolved_o2 ?? ''}
                    onChange={e => setPozo(currentSlot, 'dissolved_o2', e.target.value)}
                    readOnly={!isEditing} placeholder={isEditing ? '0.00' : '—'}
                    className={fieldCls(isEditing)}
                  />
                </Field>
              </div>
            </Card>
          )}

          {/* ── 7. Observaciones ─── */}
          <Card title="Observaciones" n={isHAT(module) ? 7 : 6}>
            <textarea name="notes" rows={4} readOnly={!isEditing}
              defaultValue={log?.notes ?? ''}
              placeholder={isEditing ? 'Escribe observaciones del turno aquí…' : 'Sin observaciones registradas.'}
              className={`w-full px-3.5 py-3 rounded-xl text-[14px] resize-none border outline-none transition-all leading-relaxed
                ${isEditing
                  ? 'bg-white border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-50 text-gray-900'
                  : 'bg-gray-50 border-transparent text-gray-600 cursor-default'}`}
            />
          </Card>

           {isEditing && (
            <button onClick={handleSave} disabled={saving}
              className="w-full py-3.5 bg-blue-500 text-white text-[15px] font-semibold rounded-full shadow-sm shadow-blue-200 active:bg-blue-600 transition-colors disabled:opacity-50">
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          )}
          <br></br>
        </form>
      </main>

      {/* ══ DELETE SHEET ══ */}
      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40">
          <div className="animate-slide-up bg-white rounded-t-3xl w-full max-w-lg mx-auto px-5 pt-4 pb-safe space-y-4">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto" />
            <div className="w-14 h-14 rounded-2xl bg-red-100 flex items-center justify-center mx-auto">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
                <path d="M9 6V4h6v2"/>
              </svg>
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-[18px] font-bold text-gray-900">Eliminar bitácora</h3>
              <p className="text-[13px] text-gray-500 leading-relaxed">
                Se eliminarán todos los datos del turno. Esta acción no puede deshacerse.
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-[12px] font-bold text-gray-500 uppercase tracking-wider px-0.5">
                Escribe <span className="text-red-500 font-mono">ELIMINAR</span> para confirmar
              </label>
              <input type="text" value={deleteInput} onChange={e => setDeleteInput(e.target.value)}
                placeholder="ELIMINAR" autoCapitalize="characters"
                className="w-full px-4 py-3.5 bg-gray-50 rounded-2xl text-[15px] font-mono border border-gray-200 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-50 transition-all"
              />
            </div>
            <div className="flex gap-3 pb-2">
              <button onClick={() => { setShowDelete(false); setDeleteInput('') }}
                className="flex-1 py-3.5 rounded-2xl bg-gray-100 text-gray-700 font-semibold text-[15px] active:bg-gray-200 transition-colors">
                Cancelar
              </button>
              <button onClick={handleDelete} disabled={deleteInput !== 'ELIMINAR' || deleting}
                className="flex-1 py-3.5 rounded-2xl bg-red-500 text-white font-semibold text-[15px] active:bg-red-600 transition-colors disabled:opacity-35">
                {deleting ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Sub-components ─── */
function Card({ title, n, children }: { title: string; n: number; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl card-shadow overflow-hidden animate-fade-in">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2.5">
        <span className="w-6 h-6 rounded-lg bg-blue-50 text-blue-500 text-[11px] font-bold flex items-center justify-center flex-shrink-0">{n}</span>
        <span className="text-[14px] font-semibold text-gray-900">{title}</span>
      </div>
      <div className="px-4 py-4">{children}</div>
    </div>
  )
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1 ${className}`}>
      <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-0.5">{label}</label>
      {children}
    </div>
  )
}
