// src/app/bitacora/BitacoraClient.tsx
'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type {
  LogFull, Shift,
  FryNumericParam, FrySlotHeader, FryTankReading, FryMachineRoom,
  FishBehavior, FeedLoss, BlowerActive, WaterLevel,
} from '@/types'
import {
  SHIFT_LABELS, SHIFT_TIMES, SHIFT_SLOTS,
  FQ_IDENTIFIERS_HAT, FQ_IDENTIFIERS_FF,
  FQ_IDENTIFIERS_FRY1, FQ_IDENTIFIERS_FRY2,
  FRY_NUMERIC_SLOTS,
  isHAT, isFF, isFRY, isFRY1, isFRY2,
} from '@/types'
import {
  updateLog, deleteLog, createLog,
  addChecklistConfigItem, updateChecklistConfigItem,
  toggleChecklistConfigItem, deleteChecklistConfigItem, reorderChecklistConfig,
} from '@/app/dashboard/actions'
import type { ChecklistConfigItem } from '@/app/dashboard/actions'
import { generateBitacoraPdf } from '@/lib/generateBitacoraPdf'
import { time } from 'console'
import AlimentacionFF     from '@/components/AlimentacionFF'
import { getFeedingPlan } from '@/app/dashboard/alimentacion-actions'
import type { FfFeedingPlanFull } from '@/types/index'


/* ── Types ─────────────────────────────────────────── */
interface Props {
  logFull:         LogFull | null
  module:          string
  date:            string
  shift:           Shift
  mode:            'view' | 'create'
  operatorName:    string
  checklistConfig: ChecklistConfigItem[]
  currentUserId:  string
}

type FQCell = { o2_saturation?: number; dissolved_o2?: number; temperature?: number; ph?: number }
type FQState   = Record<string, Record<string, FQCell>>
type PozoCell  = { temperature?: number; o2_saturation?: number; dissolved_o2?: number }
type PozoState = Record<string, PozoCell>

// FRY — estado de los 5 slots de parámetros numéricos
type FryNumericSlotCell = {
  temperature?: number
  ph?:          number
  salinity?:    number
  ozone_pct?:   number
  orp?:         number
  time_taken?: string
}
type FryNumericState = Record<number, FryNumericSlotCell> // key: 1–5

// FRY — estado de la tabla de TKs (time_slot → identifier → campos)
type FryTankCell = {
  o2_saturation?:   number
  dissolved_o2?:    number
  tank_intake_m3h?: number
  base_ml?:         number
  dose_ml?:         number
  fish_behavior?:   FishBehavior
  feed_loss?:       FeedLoss
}
type FryTankState = Record<string, Record<string, FryTankCell>> // time_slot → id → cell

// FRY — presión O₂ por slot (time_slot → bar)
type FryHeaderState = Record<string, string> // time_slot → raw string para input controlado

// FRY — sala de máquinas (campos planos)
type MachineRoomState = {
  water_intake?:             string
  rotofilter_pressure_bar?:  string
  blower_active?:            BlowerActive | ''
  pump_line_before?:         string
  pump_line_after?:          string
  flowmeter_lpm?:            string
  ozone_manometer_bar?:      string
  active_pumps?:             string
  manifold_pressure?:        string
  pump_sector_water_level?:  WaterLevel | ''
  pump_sector_operational?:  boolean
  camera12_drain?:           string
  camera12_water_level?:     string
  sal_manual?:               boolean
  sal_manual_kg?:            string
}

/* ── Constants ─────────────────────────────────────── */
const SHIFT_BADGE: Record<Shift, string> = {
  noche: 'bg-indigo-100 text-indigo-700',
  dia:   'bg-amber-100  text-amber-700',
  tarde: 'bg-orange-100 text-orange-700',
}

const OSMOSIS_OPTIONS  = ['1/4', '2/4', '3/4', '4/4', 'Muy bajo', 'Bajo', 'Medio', 'Lleno']
const BEHAVIOR_OPTIONS: { value: FishBehavior; label: string }[] = [
  { value: 'activo',    label: 'A – Activo'    },
  { value: 'letargico', label: 'L – Letárgico' },
  { value: 'revisar',   label: 'R – Revisar'   },
]
const FEED_LOSS_OPTIONS: { value: FeedLoss; label: string }[] = [
  { value: 'si',     label: 'Sí'    },
  { value: 'no',     label: 'No'    },
  { value: 'ayuno',  label: 'Ayuno' },
]

function parseAdditionalOperators(arr: string[]): string | null {
  const filtered = arr.filter(s => s.trim() !== '')
  return filtered.length > 0 ? filtered.join(', ') : null
}

function toNum(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return isNaN(n) ? undefined : n
}

function hasAnyValue(entry: Record<string, unknown>, keys: string[]): boolean {
  return keys.some(k => entry[k] !== null && entry[k] !== undefined)
}

/* ── Component ─────────────────────────────────────── */
export default function BitacoraClient({
  logFull, module, date, shift, mode, operatorName, checklistConfig: initialConfig,
  currentUserId,
}: Props) {
  const router      = useRouter()
  const formRef     = useRef<HTMLFormElement>(null)
  const isSavingRef = useRef(false)
  const checklistRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  /* ── UI state ─── */
  const [isEditing,  setIsEditing]  = useState(mode === 'create')
  const [showDelete, setShowDelete] = useState(false)
  const [deleteInput,setDeleteInput]= useState('')
  const [saving,     setSaving]     = useState(false)
  const [deleting,   setDeleting]   = useState(false)
  const [saveOk,     setSaveOk]     = useState(false)
  const [clock,      setClock]      = useState('')
  const [activeSlot, setActiveSlot] = useState<'A' | 'B'>('A')

  function goBack() { router.push(`/dashboard?module=${module}&date=${date}`) }
  function goHome()  { router.push(`/dashboard?module=${module}`) }

  /* ── Alimentación FF state ─── */
  const [showAlimentacion, setShowAlimentacion] = useState(false)
  const [feedingPlan, setFeedingPlan] = useState<FfFeedingPlanFull | null>(null)
  const [loadingPlan, setLoadingPlan] = useState(false)

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
  const fqIds          = isHAT(module)  ? FQ_IDENTIFIERS_HAT
                       : isFF(module)   ? FQ_IDENTIFIERS_FF
                       : isFRY1(module) ? FQ_IDENTIFIERS_FRY1
                       : isFRY2(module) ? FQ_IDENTIFIERS_FRY2
                       : []

  /* ── Checklist config ─── */
  const [config,       setConfig]       = useState<ChecklistConfigItem[]>(initialConfig ?? [])
  const [newTaskLabel, setNewTaskLabel] = useState('')
  const [editingItem,  setEditingItem]  = useState<{ id: string; label: string } | null>(null)
  const [taskPending,  setTaskPending]  = useState(false)
  const [reorderMode, setReorderMode]  = useState(false)

  /* ── Checklist order ── */

  
  const [draggedId,  setDraggedId]  = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const touchDragId  = useRef<string | null>(null)
  const touchOverId  = useRef<string | null>(null)
 
  // ── Desktop drag ──
  function handleDragStart(id: string) {
    setDraggedId(id)
  }
 
  function handleDragOver(e: React.DragEvent, id: string) {
    e.preventDefault()
    if (id !== draggedId) setDragOverId(id)
  }
 
  function handleDragLeave() {
    setDragOverId(null)
  }
 
  function handleDragEnd() {
    setDraggedId(null)
    setDragOverId(null)
  }
 
  async function commitReorder(fromId: string, toId: string) {
    if (fromId === toId) return
    const oldIndex = config.findIndex(i => i.id === fromId)
    const newIndex = config.findIndex(i => i.id === toId)
    if (oldIndex === -1 || newIndex === -1) return
 
    const reordered = [...config]
    const [moved] = reordered.splice(oldIndex, 1)
    reordered.splice(newIndex, 0, moved)
 
    setConfig(reordered)
    await reorderChecklistConfig(reordered.map(i => i.id))
  }
 
  async function handleDrop(targetId: string) {
    setDragOverId(null)
    const from = draggedId
    setDraggedId(null)
    if (!from) return
    await commitReorder(from, targetId)
  }
 
  // ── Mobile touch ──
  function handleTouchStart(e: React.TouchEvent, id: string) {
    if (!isEditing) return
    touchDragId.current  = id
    touchOverId.current  = id
    setDraggedId(id)
  }
 
  function handleTouchMove(e: React.TouchEvent) {
    if (!touchDragId.current) return
    e.preventDefault() // evita scroll mientras arrastra
 
    const touch = e.touches[0]
    let found: string | null = null
 
    // Recorrer los refs registrados y ver cuál contiene el punto actual
    checklistRefs.current.forEach((el, id) => {
      if (id === touchDragId.current) return
      const rect = el.getBoundingClientRect()
      if (
        touch.clientY >= rect.top    &&
        touch.clientY <= rect.bottom &&
        touch.clientX >= rect.left   &&
        touch.clientX <= rect.right
      ) {
        found = id
      }
    })
 
    if (found && found !== touchOverId.current) {
      touchOverId.current = found
      setDragOverId(found)
    }
  }
 
  async function handleTouchEnd() {
    const from = touchDragId.current
    const to   = touchOverId.current
    touchDragId.current = null
    touchOverId.current = null
    setDraggedId(null)
    setDragOverId(null)
    if (from && to && from !== to) {
      await commitReorder(from, to)
    }
  }

   async function handleOpenAlimentacion() {
    if (!log) return
      setLoadingPlan(true)
      const plan = await getFeedingPlan(log.id)
      setFeedingPlan(plan)
      setLoadingPlan(false)
      setShowAlimentacion(true)
    }

  const activeItems = config.filter(i => i.active)
  const ALL_KEYS    = activeItems.map(i => i.item_key)

  const [checked, setChecked] = useState<Set<string>>(
    new Set(logFull?.checklist.filter(c => c.checked).map(c => c.item_key) ?? [])
  )

  /* ── FQ state ─── */
  const [fqData, setFqData] = useState<FQState>(() => {
    const map: FQState = {}
    fqIds.forEach(id => {
      map[id] = {}
      ;[slotA, slotB].forEach(ts => {
        const f = logFull?.fisicoquimicos.find(r => r.identifier === id && r.time_slot === ts)
        map[id][ts] = f ? {
          o2_saturation: toNum(f.o2_saturation),
          dissolved_o2:  toNum(f.dissolved_o2),
          temperature:   toNum(f.temperature),
           ph:            toNum(f.ph),
        } : {}
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

  /* ── Pozo state ─── */
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

  /* ── FRY — parámetros numéricos (5 slots) ─── */
  const [fryNumeric, setFryNumeric] = useState<FryNumericState>(() => {
    const map: FryNumericState = {}
    FRY_NUMERIC_SLOTS.forEach(n => {
      const found = logFull?.fryNumericParams?.find(p => p.slot_number === n)
      map[n] = found ? {
        temperature: toNum(found.temperature),
        ph:          toNum(found.ph),
        salinity:    toNum(found.salinity),
        ozone_pct:   toNum(found.ozone_pct),
        orp:         toNum(found.orp),
        time_taken:  found.time_taken ?? undefined,
        
        } : {}
    })
    return map
  })
  const [activeFrySlot, setActiveFrySlot] = useState<1|2|3|4|5>(1)

  /* ── FRY — presión O₂ por slot ─── */
  const [fryHeaders, setFryHeaders] = useState<FryHeaderState>(() => {
    const map: FryHeaderState = { [slotA]: '', [slotB]: '' }
    logFull?.frySlotHeaders?.forEach(h => {
      map[h.time_slot] = h.o2_pressure_bar !== null ? String(h.o2_pressure_bar) : ''
    })
    return map
  })

  /* ── FRY — lecturas por TK ─── */
  const [fryTanks, setFryTanks] = useState<FryTankState>(() => {
    const map: FryTankState = {}
    ;[slotA, slotB].forEach(ts => {
      map[ts] = {}
      fqIds.forEach(id => {
        const r = logFull?.fryTankReadings?.find(
          x => x.time_slot === ts && x.identifier === id
        )
        map[ts][id] = r ? {
          o2_saturation:   toNum(r.o2_saturation),
          dissolved_o2:    toNum(r.dissolved_o2),
          tank_intake_m3h: toNum(r.tank_intake_m3h),
          base_ml:         toNum(r.base_ml),
          dose_ml:         toNum(r.dose_ml),
          fish_behavior:   r.fish_behavior ?? undefined,
          feed_loss:       r.feed_loss     ?? undefined,
        } : {}
      })
    })
    return map
  })

  /* ── FRY — sala de máquinas ─── */
  const [machineRoom, setMachineRoom] = useState<MachineRoomState>(() => {
    const mr = logFull?.fryMachineRoom
    if (!mr) return {}
    return {
      water_intake:            mr.water_intake            !== null ? String(mr.water_intake)            : '',
      rotofilter_pressure_bar: mr.rotofilter_pressure_bar !== null ? String(mr.rotofilter_pressure_bar) : '',
      blower_active:           mr.blower_active           ?? '',
      pump_line_before:        mr.pump_line_before        !== null ? String(mr.pump_line_before)        : '',
      pump_line_after:         mr.pump_line_after         !== null ? String(mr.pump_line_after)         : '',
      flowmeter_lpm:           mr.flowmeter_lpm           !== null ? String(mr.flowmeter_lpm)           : '',
      ozone_manometer_bar:     mr.ozone_manometer_bar     !== null ? String(mr.ozone_manometer_bar)     : '',
      active_pumps:            mr.active_pumps            !== null ? String(mr.active_pumps)            : '',
      manifold_pressure:       mr.manifold_pressure       !== null ? String(mr.manifold_pressure)       : '',
      pump_sector_water_level: mr.pump_sector_water_level ?? '',
      pump_sector_operational: mr.pump_sector_operational ?? false,
      camera12_drain:          mr.camera12_drain          !== null ? String(mr.camera12_drain)          : '',
      camera12_water_level:    mr.camera12_water_level    !== null ? String(mr.camera12_water_level)    : '',
      sal_manual:              mr.sal_manual              ?? false,
      sal_manual_kg:           mr.sal_manual_kg           !== null ? String(mr.sal_manual_kg)           : '',
    }
  })

  const params = logFull?.parameters
  const log    = logFull?.log
  const isOwner = !log || log.user_id === currentUserId

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
    setChecked(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  function setFQ(id: string, ts: string, field: keyof FQCell, raw: string) {
    const v = raw === '' ? undefined : parseFloat(raw)
    setFqData(prev => ({ ...prev, [id]: { ...prev[id], [ts]: { ...prev[id]?.[ts], [field]: v } } }))
  }

  function setPozo(ts: string, field: keyof PozoCell, raw: string) {
    const v = raw === '' ? undefined : parseFloat(raw)
    setPozoData(prev => ({ ...prev, [ts]: { ...prev[ts], [field]: v } }))
  }

  function setFryNum(slot: number, field: keyof FryNumericSlotCell, raw: string) {
    const v = raw === '' ? undefined : parseFloat(raw)
    setFryNumeric(prev => ({ ...prev, [slot]: { ...prev[slot], [field]: v } }))
  }

  function setTank(ts: string, id: string, field: keyof FryTankCell, value: unknown) {
    const parsed = typeof value === 'string' && (field === 'fish_behavior' || field === 'feed_loss')
      ? (value === '' ? undefined : value as FishBehavior | FeedLoss)
      : typeof value === 'string'
        ? (value === '' ? undefined : parseFloat(value))
        : value
    setFryTanks(prev => ({
      ...prev,
      [ts]: { ...prev[ts], [id]: { ...prev[ts]?.[id], [field]: parsed } },
    }))
  }

  function setMR(field: keyof MachineRoomState, value: unknown) {
    setMachineRoom(prev => ({ ...prev, [field]: value }))
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

  /* ── Build FQ entries ─── */
  function buildFqEntries(filterEmpty: boolean): Record<string, unknown>[] {
    const tempA = tempSlotA !== '' ? parseFloat(tempSlotA) : null
    const tempB = tempSlotB !== '' ? parseFloat(tempSlotB) : null
    const entries: Record<string, unknown>[] = []
    fqIds.forEach(id => {
      ;[slotA, slotB].forEach(ts => {
        const cell  = fqData[id]?.[ts] ?? {}
        const entry: Record<string, unknown> = {
          identifier:    id,
          time_slot:     ts,
          o2_saturation: cell.o2_saturation ?? null,
          dissolved_o2:  cell.dissolved_o2  ?? null,
          temperature:   ts === slotA ? tempA : tempB,
          ph:            cell.ph            ?? null,
        }
        if (filterEmpty && !hasAnyValue(entry, ['o2_saturation', 'dissolved_o2', 'temperature', 'ph'])) return
        entries.push(entry)
      })
    })
    return entries
  }

  /* ── Build Pozo entries ─── */
  function buildPozoEntries(filterEmpty: boolean): Record<string, unknown>[] {
    const entries: Record<string, unknown>[] = []
    if (!isHAT(module)) return entries
    ;[slotA, slotB].forEach(ts => {
      const cell  = pozoData[ts] ?? {}
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

  /* ── Build FRY entries ─── */
  function buildFryNumericEntries(filterEmpty: boolean): Record<string, unknown>[] {
    return FRY_NUMERIC_SLOTS.flatMap(n => {
      const cell  = fryNumeric[n] ?? {}
      const entry: Record<string, unknown> = {
        slot_number: n,
        temperature: cell.temperature ?? null,
        ph:          cell.ph          ?? null,
        salinity:    cell.salinity    ?? null,
        ozone_pct:   cell.ozone_pct   ?? null,
        orp:         cell.orp         ?? null,
        time_taken:   cell.time_taken   ?? null,
      }
      if (filterEmpty && !hasAnyValue(entry, ['temperature','ph','salinity','ozone_pct','orp', 'time_taken'])) return []
      return [entry]
    })
  }

  function buildFryHeaderEntries(filterEmpty: boolean): Record<string, unknown>[] {
    return [slotA, slotB].flatMap(ts => {
      const val = fryHeaders[ts] !== '' ? parseFloat(fryHeaders[ts]) : null
      if (filterEmpty && val === null) return []
      return [{ time_slot: ts, o2_pressure_bar: val }]
    })
  }

  function buildFryTankEntries(filterEmpty: boolean): Record<string, unknown>[] {
    const entries: Record<string, unknown>[] = []
    ;[slotA, slotB].forEach(ts => {
      fqIds.forEach(id => {
        const cell  = fryTanks[ts]?.[id] ?? {}
        const entry: Record<string, unknown> = {
          time_slot:       ts,
          identifier:      id,
          o2_saturation:   cell.o2_saturation   ?? null,
          dissolved_o2:    cell.dissolved_o2     ?? null,
          tank_intake_m3h: cell.tank_intake_m3h  ?? null,
          base_ml:         cell.base_ml          ?? null,
          dose_ml:         cell.dose_ml          ?? null,
          fish_behavior:   cell.fish_behavior    ?? null,
          feed_loss:       cell.feed_loss        ?? null,
        }
        const numericKeys = ['o2_saturation','dissolved_o2','tank_intake_m3h','base_ml','dose_ml']
        const textKeys    = ['fish_behavior','feed_loss']
        if (filterEmpty && !hasAnyValue(entry, [...numericKeys,...textKeys])) return
        entries.push(entry)
      })
    })
    return entries
  }

  function buildFryMachineRoom(): Record<string, unknown> {
    return {
      water_intake:            machineRoom.water_intake            !== '' ? parseFloat(machineRoom.water_intake            ?? '') : null,
      rotofilter_pressure_bar: machineRoom.rotofilter_pressure_bar !== '' ? parseFloat(machineRoom.rotofilter_pressure_bar ?? '') : null,
      blower_active:           machineRoom.blower_active           || null,
      pump_line_before:        machineRoom.pump_line_before        !== '' ? parseFloat(machineRoom.pump_line_before        ?? '') : null,
      pump_line_after:         machineRoom.pump_line_after         !== '' ? parseFloat(machineRoom.pump_line_after         ?? '') : null,
      flowmeter_lpm:           machineRoom.flowmeter_lpm           !== '' ? parseFloat(machineRoom.flowmeter_lpm           ?? '') : null,
      ozone_manometer_bar:     machineRoom.ozone_manometer_bar     !== '' ? parseFloat(machineRoom.ozone_manometer_bar     ?? '') : null,
      active_pumps:            machineRoom.active_pumps            !== '' ? parseInt(machineRoom.active_pumps              ?? '') : null,
      manifold_pressure:       machineRoom.manifold_pressure       !== '' ? parseFloat(machineRoom.manifold_pressure       ?? '') : null,
      pump_sector_water_level: machineRoom.pump_sector_water_level || null,
      pump_sector_operational: machineRoom.pump_sector_operational ?? null,
      camera12_drain:          machineRoom.camera12_drain          !== '' ? parseInt(machineRoom.camera12_drain            ?? '') : null,
      camera12_water_level:    machineRoom.camera12_water_level    !== '' ? parseFloat(machineRoom.camera12_water_level    ?? '') : null,
      sal_manual:              machineRoom.sal_manual              ?? null,
      sal_manual_kg:           machineRoom.sal_manual && machineRoom.sal_manual_kg !== ''
                                 ? parseFloat(machineRoom.sal_manual_kg ?? '')
                                 : null,
    }
  }

  /* ── Save ─── */
  async function handleSave() {
    if (!formRef.current)    return
    if (isSavingRef.current) return
    isSavingRef.current = true
    setSaving(true)

    try {
      const form      = formRef.current
      const numInputs = form.querySelectorAll('input[type="number"], select')

      const basePayload: Record<string, unknown> = {
        module_slug:          module,
        log_date:             date,
        shift,
        operator_name:        (form.querySelector('[name="operator_name"]') as HTMLInputElement)?.value,
        notes:                (form.querySelector('[name="notes"]') as HTMLTextAreaElement)?.value,
        additional_operators: parseAdditionalOperators(extraResponsables),
        checklist_keys:       ALL_KEYS,
        fisicoquimicos:       isFRY(module) ? [] : buildFqEntries(mode === 'create'),
        pozo:                 buildPozoEntries(mode === 'create'),
      }

      ALL_KEYS.forEach(key => { basePayload[`check_${key}`] = checked.has(key) })

      // Campos numéricos del formulario base (HAT / FF)
      if (!isFRY(module)) {
        numInputs.forEach(el => {
          const input = el as HTMLInputElement | HTMLSelectElement
          if (input.name && !input.name.startsWith('fry_')) {
            basePayload[input.name] = input.type === 'number'
              ? (input.value !== '' ? parseFloat(input.value) : null)
              : (input.value || null)
          }
        })
      }

      if (isFRY(module)) {
        basePayload.fryNumericParams = buildFryNumericEntries(mode === 'create')
        basePayload.frySlotHeaders   = buildFryHeaderEntries(mode === 'create')
        basePayload.fryTankReadings  = buildFryTankEntries(mode === 'create')
        basePayload.fryMachineRoom   = buildFryMachineRoom()
        // Parámetros numéricos estándar que FRY también usa en log_parameters
        basePayload.bicarbonate_kg   = parseFloatOrNull(form.querySelector<HTMLInputElement>('[name="bicarbonate_kg"]')?.value)
        basePayload.chloride_kg      = parseFloatOrNull(form.querySelector<HTMLInputElement>('[name="chloride_kg"]')?.value)
      }

      if (mode === 'create') {
        await createLog(basePayload)
        return // redirect dentro de createLog
      }

      if (log) {
        await updateLog(log.id, { ...basePayload, module_slug: module })
        setIsEditing(false)
        setSaveOk(true)
        setTimeout(() => setSaveOk(false), 2500)
      }
    } finally {
      isSavingRef.current = false
      setSaving(false)
    }
  }

  function parseFloatOrNull(v?: string): number | null {
    if (!v || v === '') return null
    const n = parseFloat(v)
    return isNaN(n) ? null : n
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
      <input type="number" name={name} step="0.01"
        defaultValue={val ?? ''}
        readOnly={!isEditing}
        placeholder={isEditing ? '0.00' : '—'}
        className={`${fieldCls(isEditing)} ${unit ? 'pr-10' : ''}`}
      />
      {unit && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-400 font-medium pointer-events-none">{unit}</span>
      )}
    </div>
  )

  /* ── UI ─── */
  return (
    <div className="min-h-dvh bg-[#F2F2F7] flex flex-col">

      {/* ══ TOP NAV ══ */}
      <header className="topbar-blur border-b border-black/[0.06] px-3 h-14 flex items-center justify-between sticky top-0 z-30 pt-safe">
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

        <div className={`flex flex-col items-center px-3 py-1 rounded-2xl shrink-0 ${SHIFT_BADGE[shift]}`}>
          <span className="text-[11px] font-bold leading-tight">{SHIFT_LABELS[shift]}</span>
          <span className="text-[10px] font-mono tabular-nums opacity-80">{clock}</span>
        </div>

        <div className="flex items-center gap-1.5 min-w-0">
          {saveOk && !isEditing && (
            <span className="text-[12px] text-green-600 font-semibold animate-fade-in shrink-0">✓</span>
          )}
          {!isEditing && mode !== 'create' && (
            <>
              {isFF(module) && shift === 'noche' && (
                  <button
                    onClick={handleOpenAlimentacion}
                    disabled={loadingPlan}
                    className="w-8 h-8 flex items-center justify-center rounded-xl bg-orange-50 text-orange-600 active:opacity-60 transition-opacity disabled:opacity-40"
                    aria-label="Plan de alimentación">
                    {loadingPlan ? (
                      <div className="w-4 h-4 rounded-full border-2 border-orange-200 border-t-orange-500 animate-spin" />
                    ) : (
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M3 12s4-6 10-6 8 6 8 6-2 6-8 6-10-6-10-6z" />
                        <path d="M3 12l-2-2v4l2-2z" />
                        <circle cx="13" cy="10" r="0.8" fill="currentColor" />
                      </svg>
                    )}
                  </button>
            )}  
              <button onClick={() => logFull && generateBitacoraPdf(logFull, module, date, shift, config)}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-emerald-100 text-emerald-500 active:opacity-60 transition-opacity" aria-label="Descargar PDF">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
              </button>
              <button onClick={() => setIsEditing(true)}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-blue-50 text-blue-500 active:opacity-60 transition-opacity" aria-label="Editar">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
                  {isOwner ? (
                <button onClick={() => setShowDelete(true)}
                  className="w-8 h-8 flex items-center justify-center rounded-xl bg-red-50 text-red-400 active:opacity-60 transition-opacity" aria-label="Eliminar">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                  </svg>
                </button>
              ) : (
                <div
                  className="w-8 h-8 flex items-center justify-center rounded-xl bg-gray-100 text-gray-300 cursor-not-allowed"
                  title="No puedes eliminar una bitácora de otro operador"
                  aria-label="Eliminar (no disponible)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                  </svg>
                </div>
              )}
            </>
          )}
          {isEditing && (
            <>
              {mode !== 'create' && (
                <button onClick={() => setIsEditing(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-xl bg-gray-100 text-gray-500 active:opacity-60 transition-opacity" aria-label="Cancelar">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              )}
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

          {!isOwner && mode !== 'create' && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-start gap-3 animate-fade-in">
            <div className="flex-shrink-0 mt-0.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="#d97706" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-amber-800 leading-snug">
                Bitácora creada por otro operador
              </p>
              <p className="text-[12px] text-amber-600 mt-0.5 leading-relaxed">
                Puedes editar y guardar cambios, pero no puedes eliminar esta bitácora
                porque fue registrada por{' '}
                <span className="font-semibold">
                  {log?.profiles?.full_name ?? 'otro usuario'}
                </span>.
              </p>
            </div>
          </div>
        )}

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
                  <div
                    key={item.id}
                    ref={el => {
                      if (el) checklistRefs.current.set(item.id, el)
                      else    checklistRefs.current.delete(item.id)
                    }}
                      data-checklist-id={item.id}
                      draggable={isEditing && !editingItem && reorderMode}
                      onDragStart={() => reorderMode && handleDragStart(item.id)}
                      onDragOver={e  => reorderMode && handleDragOver(e, item.id)}
                      onDragLeave={() => reorderMode && handleDragLeave()}
                      onDrop={() => reorderMode && handleDrop(item.id)}
                      onDragEnd={() => reorderMode && handleDragEnd()}
                      onTouchStart={e => reorderMode && handleTouchStart(e, item.id)}
                      onTouchMove={e  => reorderMode && handleTouchMove(e)}
                      onTouchEnd={() => reorderMode && handleTouchEnd()}
                      className={`flex items-center gap-2 rounded-xl transition-all
                        ${dragOverId === item.id ? 'ring-2 ring-blue-300 bg-blue-50/50' : ''}
                        ${draggedId  === item.id ? 'opacity-40 scale-[0.98]'            : ''}`}
                  >
                    {/* Handle de arrastre — solo visible en modo edición */}
                    {isEditing && !editingItem && reorderMode && (
                      <div
                        className="flex-shrink-0 cursor-grab active:cursor-grabbing px-1 py-3 text-gray-300 hover:text-gray-400 transition-colors touch-none select-none"
                        title="Arrastrar para reordenar">
                        <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor">
                          <circle cx="4" cy="3"  r="1.5"/>
                          <circle cx="8" cy="3"  r="1.5"/>
                          <circle cx="4" cy="8"  r="1.5"/>
                          <circle cx="8" cy="8"  r="1.5"/>
                          <circle cx="4" cy="13" r="1.5"/>
                          <circle cx="8" cy="13" r="1.5"/>
                        </svg>
                      </div>
                    )}
 
                    <div className="flex-1 min-w-0">
                      {editingItem?.id === item.id ? (
                        <div className="flex gap-2">
                          <input type="text" value={editingItem.label}
                            onChange={e => setEditingItem({ ...editingItem, label: e.target.value })}
                            className="flex-1 px-3 py-2 rounded-xl text-[14px] border border-blue-300 outline-none focus:ring-2 focus:ring-blue-50 bg-white" autoFocus
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
                              ${checked.has(item.item_key) && item.active ? 'bg-green-500 border-green-500' : 'border-gray-300 bg-white'}`}>
                            {checked.has(item.item_key) && item.active && (
                              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                                <polyline points="2,6 5,9 10,3" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </button>
                          <span className={`text-[14px] font-medium leading-tight flex-1 truncate
                            ${checked.has(item.item_key) && item.active ? 'text-green-800' : 'text-gray-600'}`}>
                            {item.label}
                          </span>
                        </div>
                      )}
                    </div>
 
                    {isEditing && !editingItem && (
                      <div className="flex gap-1 flex-shrink-0">
                        <button type="button" onClick={() => setEditingItem({ id: item.id, label: item.label })}
                          className="w-7 h-7 rounded-lg bg-gray-100 text-gray-400 text-[12px] flex items-center justify-center active:opacity-60" title="Editar">✎</button>
                        <button type="button" onClick={() => handleToggleItem(item.id, !item.active)} disabled={taskPending}
                          className={`w-7 h-7 rounded-lg text-[11px] flex items-center justify-center active:opacity-60 disabled:opacity-40 font-bold
                            ${item.active ? 'bg-amber-50 text-amber-500' : 'bg-green-50 text-green-500'}`}
                          title={item.active ? 'Desactivar' : 'Activar'}>{item.active ? '○' : '●'}</button>
                        <button type="button" onClick={() => handleDeleteItem(item.id)} disabled={taskPending}
                          className="w-7 h-7 rounded-lg bg-red-50 text-red-400 text-[13px] flex items-center justify-center active:opacity-60 disabled:opacity-40" title="Eliminar">×</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {isEditing && config.length > 1 && !editingItem && (
                <div className="flex items-center justify-between px-1 py-1.5">
                  <span className="text-[11px] text-gray-400">
                    {reorderMode ? 'Arrastra para cambiar el orden' : 'Modo reordenar'}
                  </span>
                  {/* Toggle switch */}
                  <button
                    type="button"
                    onClick={() => {
                      setReorderMode(prev => !prev)
                      // Limpiar estado de drag al desactivar
                      setDraggedId(null)
                      setDragOverId(null)
                    }}
                    className={`relative inline-flex h-6 w-10 flex-shrink-0 rounded-full border-2 border-transparent
                      transition-colors duration-200 focus:outline-none
                      ${reorderMode ? 'bg-blue-500' : 'bg-gray-200'}`}
                    role="switch"
                    aria-checked={reorderMode}
                    aria-label="Activar modo reordenar"
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full
                        bg-white shadow ring-0 transition duration-200
                        ${reorderMode ? 'translate-x-4' : 'translate-x-0'}`}
                    />
                  </button>
                </div>
              )}
 
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
                  ${checked.size === ALL_KEYS.length && ALL_KEYS.length > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {checked.size} / {ALL_KEYS.length} completados
                </span>
              </div>
            </div>
          </Card>

          {/* ── 3. Parámetros numéricos ─── */}
          <Card title="Parámetros numéricos" n={3}>
            {isFRY(module) ? (
              /* FRY: 5 slots de toma de parámetros */
              <div>
                <p className="text-[12px] text-gray-400 mb-3">Hasta 5 tomas por turno. Puedes dejar slots sin completar.</p>
                {/* Tabs 1–5 — muestran la hora si ya tiene valor */}
                <div className="flex gap-1.5 mb-4">
                  {FRY_NUMERIC_SLOTS.map(n => (
                    <button key={n} type="button" onClick={() => setActiveFrySlot(n)}
                      className={`flex-1 py-2 rounded-xl text-[13px] font-bold transition-colors flex flex-col items-center leading-tight
                        ${activeFrySlot === n
                          ? 'bg-blue-500 text-white shadow-sm shadow-blue-200'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                      <span>{n}</span>
                      {fryNumeric[n]?.time_taken && (
                        <span className={`text-[9px] font-mono mt-0.5 ${activeFrySlot === n ? 'opacity-80' : 'opacity-60'}`}>
                          {fryNumeric[n].time_taken}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
 
                {/* Hora de toma */}
                <div className="mb-4">
                  <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-0.5 block mb-1">
                    Hora de toma — slot {activeFrySlot}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="time"
                      value={fryNumeric[activeFrySlot]?.time_taken ?? ''}
                      onChange={e => setFryNumeric(prev => ({
                        ...prev,
                        [activeFrySlot]: { ...prev[activeFrySlot], time_taken: e.target.value },
                      }))}
                      readOnly={!isEditing}
                      className={`flex-1 px-3.5 py-3 rounded-xl text-[14px] border outline-none transition-all font-mono
                        ${isEditing
                          ? 'bg-white border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-50 text-gray-900'
                          : 'bg-gray-50 border-transparent text-gray-700 cursor-default'}`}
                    />
                    {isEditing && (
                      <button
                        type="button"
                        onClick={() => {
                          const now = new Date().toLocaleTimeString('es-CL', {
                            hour: '2-digit', minute: '2-digit', hour12: false,
                          })
                          setFryNumeric(prev => ({
                            ...prev,
                            [activeFrySlot]: { ...prev[activeFrySlot], time_taken: now },
                          }))
                        }}
                        className="px-3.5 py-3 rounded-xl bg-blue-50 text-blue-500 text-[12px] font-semibold whitespace-nowrap active:bg-blue-100 transition-colors border border-blue-100"
                        title="Usar hora actual">
                        Ahora
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-3 gap-y-3">
                  {([ 
                    { field: 'temperature' as const, label: 'Temperatura',  unit: '°C'  },
                    { field: 'ph'          as const, label: 'pH',           unit: ''    },
                    { field: 'salinity'    as const, label: 'Salinidad',    unit: 'ppt' },
                    { field: 'ozone_pct'   as const, label: 'Ozono',        unit: '%'   },
                    { field: 'orp'         as const, label: 'ORP',          unit: 'mV'  },
                  ] as const).map(({ field, label, unit }) => (
                    <Field key={field} label={label} className={field === 'orp' ? 'col-span-2' : ''}>
                      <div className="relative">
                        <input type="number" step="0.01"
                          value={fryNumeric[activeFrySlot]?.[field] ?? ''}
                          onChange={e => setFryNum(activeFrySlot, field, e.target.value)}
                          readOnly={!isEditing}
                          placeholder={isEditing ? '0.00' : '—'}
                          className={`${fieldCls(isEditing)} ${unit ? 'pr-10' : ''}`}
                        />
                        {unit && (
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-400 font-medium pointer-events-none">{unit}</span>
                        )}
                      </div>
                    </Field>
                  ))}
                </div>
              </div>
            ) : (
              /* HAT / FF: campos estándar */
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
                        defaultValue={params?.osmosis_value ?? ''} className={fieldCls(isEditing)}>
                        <option value="">—</option>
                        {OSMOSIS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </Field>
                    <Field label="pH">        {numField('ph_ff',       params?.ph_ff)}</Field>
                    <Field label="Salinidad"> {numField('salinity_ff', params?.salinity_ff, 'ppt')}</Field>
                    <Field label="ORP" className="col-span-2">{numField('orp_ff', params?.orp_ff, 'mV')}</Field>
                    <Field label="Ingreso de agua" className="col-span-2">
                      {numField('water_intake', params?.water_intake)}
                    </Field>
                    <Field label="Ingreso TKs" className="col-span-2">
                      {numField('pozo_intake_m3h', params?.pozo_intake_m3h, 'm³/h')}
                    </Field>
                  </>
                )}
              </div>
            )}
          </Card>

          {/* ── 4. Químicos ─── */}
          <Card title="Químicos" n={4}>
            <div className="grid grid-cols-2 gap-x-3 gap-y-3">
              <Field label="Bicarbonato de sodio">{numField('bicarbonate_kg', params?.bicarbonate_kg, 'kg')}</Field>
              <Field label="Cloruro de calcio">   {numField('chloride_kg',    params?.chloride_kg,    'kg')}</Field>
 
              {isFRY(module) && (
                <>
                  {/* SAL Manual — switch Sí/No */}
                  <Field label="SAL Manual" className="col-span-2">
                    <div className="flex items-center gap-3">
                      {/* Toggle pill */}
                      <button
                        type="button"
                        onClick={() => isEditing && setMR('sal_manual', !machineRoom.sal_manual)}
                        disabled={!isEditing}
                        className={`relative inline-flex h-7 w-12 flex-shrink-0 rounded-full border-2 border-transparent
                          transition-colors duration-200 focus:outline-none
                          ${machineRoom.sal_manual ? 'bg-blue-500' : 'bg-gray-200'}
                          ${!isEditing ? 'opacity-60 cursor-default' : 'cursor-pointer'}`}
                        role="switch"
                        aria-checked={machineRoom.sal_manual ?? false}
                      >
                        <span
                          className={`pointer-events-none inline-block h-6 w-6 transform rounded-full
                            bg-white shadow ring-0 transition duration-200
                            ${machineRoom.sal_manual ? 'translate-x-5' : 'translate-x-0'}`}
                        />
                      </button>
                      <span className={`text-[14px] font-semibold transition-colors
                        ${machineRoom.sal_manual ? 'text-blue-600' : 'text-gray-400'}`}>
                        {machineRoom.sal_manual ? 'Sí' : 'No'}
                      </span>
                    </div>
                  </Field>
 
                  {/* Cantidad de sal — solo visible cuando sal_manual = true */}
                  {machineRoom.sal_manual && (
                    <Field label="Cantidad de sal" className="col-span-2">
                      <div className="relative">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          value={machineRoom.sal_manual_kg ?? ''}
                          onChange={e => setMR('sal_manual_kg', e.target.value)}
                          readOnly={!isEditing}
                          placeholder={isEditing ? '0.0' : '—'}
                          className={`${fieldCls(isEditing)} pr-10`}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-400 font-medium pointer-events-none">
                          kg
                        </span>
                      </div>
                    </Field>
                  )}
                </>
              )}
            </div>
          </Card>

          {/* ── 5. Fisicoquímicos ─── */}
          {!isFRY(module) && fqIds.length > 0 && (
            <Card title="Parámetros fisicoquímicos" n={5}>
              <p className="text-[12px] text-gray-400 mb-3 leading-relaxed">
                Sat% y O₂ (Mg/L) por identificador. Temperatura compartida por horario.
              </p>
              <div className="flex gap-2 mb-4">
                {(['A', 'B'] as const).map(tab => (
                  <button key={tab} type="button" onClick={() => setActiveSlot(tab)}
                    className={`flex-1 py-2 rounded-xl text-[13px] font-semibold transition-colors
                      ${activeSlot === tab ? 'bg-blue-500 text-white shadow-sm shadow-blue-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                    {tab === 'A' ? slotA : slotB}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-x-3 mb-4">
                <Field label={`Temperatura ${currentSlot}`}>
                  <div className="relative">
                    <input type="number" step="0.01"
                      value={activeSlot === 'A' ? tempSlotA : tempSlotB}
                      onChange={e => activeSlot === 'A' ? setTempSlotA(e.target.value) : setTempSlotB(e.target.value)}
                      readOnly={!isEditing} placeholder={isEditing ? '0.00' : '—'}
                      className={`${fieldCls(isEditing)} pr-10`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-400 font-medium pointer-events-none">°C</span>
                  </div>
                </Field>
                <Field label={`pH ${currentSlot}`}>
                  <input type="number" step="0.01"
                    value={fqData[fqIds[0]]?.[currentSlot]?.ph ?? ''}
                    onChange={e => {
                      const v = e.target.value === '' ? undefined : parseFloat(e.target.value)
                      // pH se guarda una sola vez por slot (igual que temperatura)
                      // lo almacenamos en todos los identificadores del slot actual
                      setFqData(prev => {
                        const next = { ...prev }
                        fqIds.forEach(id => {
                          next[id] = {
                            ...next[id],
                            [currentSlot]: { ...next[id]?.[currentSlot], ph: v },
                          }
                        })
                        return next
                      })
                    }}
                    readOnly={!isEditing} placeholder={isEditing ? '0.00' : '—'}
                    className={fieldCls(isEditing)}
                  />
                </Field>
              </div>
              <div className="overflow-x-auto -mx-4 px-4 scrollbar-none">
                <table className="border-collapse w-full">
                     <thead>
                    <tr>
                      <th className="text-left text-[11px] font-bold text-gray-400 uppercase tracking-wide pb-2 pr-3 sticky left-0 bg-white z-10 w-12">ID</th>
                      <th className="text-center text-[11px] text-gray-400 font-semibold pb-2 px-2">Sat%</th>
                      <th className="text-center text-[11px] text-gray-400 font-semibold pb-2 px-2">Mg/L</th>
                      <th className="text-center text-[11px] text-gray-400 font-semibold pb-2 px-2">pH</th>
                    </tr>
                  </thead>
                   <tbody>
                    {fqIds.map((id, rowIdx) => (
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
                        {/* pH — solo se edita en la primera fila, el resto es solo lectura y muestra el mismo valor */}
                        <td className="px-1 py-1.5">
                          {rowIdx === 0 ? (
                            <input type="number" step="0.01"
                              value={fqData[id]?.[currentSlot]?.ph ?? ''}
                              onChange={e => {
                                const v = e.target.value === '' ? undefined : parseFloat(e.target.value)
                                setFqData(prev => {
                                  const next = { ...prev }
                                  fqIds.forEach(fid => {
                                    next[fid] = {
                                      ...next[fid],
                                      [currentSlot]: { ...next[fid]?.[currentSlot], ph: v },
                                    }
                                  })
                                  return next
                                })
                              }}
                              readOnly={!isEditing}
                              className="fq-input w-full text-center"
                              placeholder="—"
                            />
                          ) : (
                            <span className="block text-center text-[12px] text-gray-400 tabular-nums">
                              {fqData[fqIds[0]]?.[currentSlot]?.ph ?? '—'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* ── 5. Fisicoquímicos FRY ─── */}
          {isFRY(module) && (
            <Card title="Parámetros fisicoquímicos" n={5}>
              <p className="text-[12px] text-gray-400 mb-3 leading-relaxed">
                O₂ Sat%, Mg/L, Ingreso, Base, Dosis, Comportamiento y Pérdida de alimento por tanque.
              </p>

              {/* Tabs slot A / B */}
              <div className="flex gap-2 mb-3">
                {(['A', 'B'] as const).map(tab => (
                  <button key={tab} type="button" onClick={() => setActiveSlot(tab)}
                    className={`flex-1 py-2 rounded-xl text-[13px] font-semibold transition-colors
                      ${activeSlot === tab ? 'bg-blue-500 text-white shadow-sm shadow-blue-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                    {tab === 'A' ? slotA : slotB}
                  </button>
                ))}
              </div>

              {/* Presión manómetro O₂ — 1 por slot */}
              <div className="mb-4">
                <Field label={`Presión manómetro O₂ — ${currentSlot}`}>
                  <div className="relative">
                    <input type="number" step="0.01" min="3.5" max="10.1"
                      value={fryHeaders[currentSlot] ?? ''}
                      onChange={e => setFryHeaders(prev => ({ ...prev, [currentSlot]: e.target.value }))}
                      readOnly={!isEditing}
                      placeholder={isEditing ? '3.5 – 10.1' : '—'}
                      className={`${fieldCls(isEditing)} pr-12`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-400 font-medium pointer-events-none">bar</span>
                  </div>
                </Field>
              </div>

              {/* Tabla de TKs */}
              <div className="overflow-x-auto -mx-4 px-4 scrollbar-none">
                <table className="border-collapse" style={{ minWidth: '560px' }}>
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left text-[10px] font-bold text-gray-400 uppercase pb-2 pr-2 sticky left-0 bg-white z-10 w-14">TK</th>
                      <th className="text-center text-[10px] text-gray-400 font-semibold pb-2 px-1">Sat%</th>
                      <th className="text-center text-[10px] text-gray-400 font-semibold pb-2 px-1">Mg/L</th>
                      <th className="text-center text-[10px] text-gray-400 font-semibold pb-2 px-1">m³/h</th>
                      <th className="text-center text-[10px] text-gray-400 font-semibold pb-2 px-1">Base</th>
                      <th className="text-center text-[10px] text-gray-400 font-semibold pb-2 px-1">Dosis</th>
                      <th className="text-center text-[10px] text-gray-400 font-semibold pb-2 px-1">Comp.</th>
                      <th className="text-center text-[10px] text-gray-400 font-semibold pb-2 px-1">Alim.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fqIds.map(id => {
                      const cell = fryTanks[currentSlot]?.[id] ?? {}
                      return (
                        <tr key={id} className="border-b border-gray-50">
                          <td className="pr-2 py-1.5 font-bold text-[12px] text-blue-500 sticky left-0 bg-white whitespace-nowrap">{id}</td>
                          {/* O₂ Sat% */}
                          <td className="px-1 py-1">
                            <input type="number" step="0.01"
                              value={cell.o2_saturation ?? ''}
                              onChange={e => setTank(currentSlot, id, 'o2_saturation', e.target.value)}
                              readOnly={!isEditing} placeholder="—"
                              className="fq-input w-14 text-center"
                            />
                          </td>
                          {/* O₂ Mg/L */}
                          <td className="px-1 py-1">
                            <input type="number" step="0.01"
                              value={cell.dissolved_o2 ?? ''}
                              onChange={e => setTank(currentSlot, id, 'dissolved_o2', e.target.value)}
                              readOnly={!isEditing} placeholder="—"
                              className="fq-input w-14 text-center"
                            />
                          </td>
                          {/* Ingreso m³/h */}
                          <td className="px-1 py-1">
                            <input type="number" step="0.001"
                              value={cell.tank_intake_m3h ?? ''}
                              onChange={e => setTank(currentSlot, id, 'tank_intake_m3h', e.target.value)}
                              readOnly={!isEditing} placeholder="—"
                              className="fq-input w-16 text-center"
                            />
                          </td>
                          {/* Base ml */}
                          <td className="px-1 py-1">
                            <input type="number" step="1" max="99"
                              value={cell.base_ml ?? ''}
                              onChange={e => setTank(currentSlot, id, 'base_ml', e.target.value)}
                              readOnly={!isEditing} placeholder="—"
                              className="fq-input w-12 text-center"
                            />
                          </td>
                          {/* Dosis ml */}
                          <td className="px-1 py-1">
                            <input type="number" step="1" min="0" max="99"
                              value={cell.dose_ml ?? ''}
                              onChange={e => setTank(currentSlot, id, 'dose_ml', e.target.value)}
                              readOnly={!isEditing} placeholder="—"
                              className="fq-input w-12 text-center"
                            />
                          </td>
                          {/* Comportamiento */}
                          <td className="px-1 py-1">
                            <select
                              value={cell.fish_behavior ?? ''}
                              onChange={e => setTank(currentSlot, id, 'fish_behavior', e.target.value)}
                              disabled={!isEditing}
                              className="fq-input w-16 text-center text-[11px]"
                            >
                              <option value="">—</option>
                              {BEHAVIOR_OPTIONS.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                          </td>
                          {/* Pérdida alimento */}
                          <td className="px-1 py-1">
                            <select
                              value={cell.feed_loss ?? ''}
                              onChange={e => setTank(currentSlot, id, 'feed_loss', e.target.value)}
                              disabled={!isEditing}
                              className="fq-input w-16 text-center text-[11px]"
                            >
                              <option value="">—</option>
                              {FEED_LOSS_OPTIONS.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Leyenda comportamiento */}
              <p className="text-[10px] text-gray-400 mt-2">
                Comp.: A = Activo · L = Letárgico · R = Revisar &nbsp;|&nbsp; Alim.: pérdida de alimento
              </p>
            </Card>
          )}

          {/* ── 6. Pozo (HAT only) ─── */}
          {isHAT(module) && (
            <Card title="Parámetros de Pozo" n={6}>
              <div className="flex gap-2 mb-4">
                {(['A', 'B'] as const).map(tab => (
                  <button key={tab} type="button" onClick={() => setActiveSlot(tab)}
                    className={`flex-1 py-2 rounded-xl text-[13px] font-semibold transition-colors
                      ${activeSlot === tab ? 'bg-indigo-500 text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
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

          {/* ── 6. Sala de Máquinas (FRY only) ─── */}
          {isFRY(module) && (
            <Card title="Sala de Máquinas" n={6}>
              <div className="grid grid-cols-2 gap-x-3 gap-y-3">

                <Field label="Ingreso de agua">
                  <div className="relative">
                    <input type="number" step="0.01"
                      value={machineRoom.water_intake ?? ''}
                      onChange={e => setMR('water_intake', e.target.value)}
                      readOnly={!isEditing} placeholder={isEditing ? '0.00' : '—'}
                      className={fieldCls(isEditing)}
                    />
                  </div>
                </Field>

                <Field label="Rotofiltro — bomba aspersores">
                  <div className="relative">
                    <input type="number" step="0.01" min="5" max="7"
                      value={machineRoom.rotofilter_pressure_bar ?? ''}
                      onChange={e => setMR('rotofilter_pressure_bar', e.target.value)}
                      readOnly={!isEditing} placeholder={isEditing ? '5–7' : '—'}
                      className={`${fieldCls(isEditing)} pr-10`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-400 pointer-events-none">bar</span>
                  </div>
                </Field>

                <Field label="Blower operativo">
                  <select
                    value={machineRoom.blower_active ?? ''}
                    onChange={e => setMR('blower_active', e.target.value)}
                    disabled={!isEditing}
                    className={fieldCls(isEditing)}>
                    <option value="">—</option>
                    <option value="1">Blower 1</option>
                    <option value="2">Blower 2</option>
                    <option value="ambos">Ambos</option>
                  </select>
                </Field>

                <Field label="Bombas operativas">
                  <select
                    value={machineRoom.active_pumps ?? ''}
                    onChange={e => setMR('active_pumps', e.target.value)}
                    disabled={!isEditing}
                    className={fieldCls(isEditing)}>
                    <option value="">—</option>
                    {[0,1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </Field>

                <Field label="Presión línea — antes">
                  <div className="relative">
                    <input type="number" step="0.01"
                      value={machineRoom.pump_line_before ?? ''}
                      onChange={e => setMR('pump_line_before', e.target.value)}
                      readOnly={!isEditing} placeholder={isEditing ? '~1.5' : '—'}
                      className={`${fieldCls(isEditing)} pr-10`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-400 pointer-events-none">bar</span>
                  </div>
                </Field>

                <Field label="Presión línea — después">
                  <div className="relative">
                    <input type="number" step="0.01"
                      value={machineRoom.pump_line_after ?? ''}
                      onChange={e => setMR('pump_line_after', e.target.value)}
                      readOnly={!isEditing} placeholder={isEditing ? '~1.0' : '—'}
                      className={`${fieldCls(isEditing)} pr-10`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-400 pointer-events-none">bar</span>
                  </div>
                </Field>

                <Field label="Flujómetro">
                  <div className="relative">
                    <input type="number" step="0.1" min="1" max="100"
                      value={machineRoom.flowmeter_lpm ?? ''}
                      onChange={e => setMR('flowmeter_lpm', e.target.value)}
                      readOnly={!isEditing} placeholder={isEditing ? '1–100' : '—'}
                      className={`${fieldCls(isEditing)} pr-14`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-400 pointer-events-none">L/min</span>
                  </div>
                </Field>

                <Field label="Manómetro ozono">
                  <div className="relative">
                    <input type="number" step="0.1" min="0.1" max="5.0"
                      value={machineRoom.ozone_manometer_bar ?? ''}
                      onChange={e => setMR('ozone_manometer_bar', e.target.value)}
                      readOnly={!isEditing} placeholder={isEditing ? '0.1–5.0' : '—'}
                      className={`${fieldCls(isEditing)} pr-10`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-400 pointer-events-none">bar</span>
                  </div>
                </Field>

                <Field label="Presión manifold" className="col-span-2">
                  <div className="relative">
                    <input type="number" step="0.01" min="0" max="0.9"
                      value={machineRoom.manifold_pressure ?? ''}
                      onChange={e => setMR('manifold_pressure', e.target.value)}
                      readOnly={!isEditing} placeholder={isEditing ? '0.00–0.90' : '—'}
                      className={`${fieldCls(isEditing)} pr-10`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-400 pointer-events-none">bar</span>
                  </div>
                </Field>

                {/* Sector bombas — nivel + operativa */}
                <Field label="Nivel agua — sector bombas">
                  <select
                    value={machineRoom.pump_sector_water_level ?? ''}
                    onChange={e => setMR('pump_sector_water_level', e.target.value)}
                    disabled={!isEditing}
                    className={fieldCls(isEditing)}>
                    <option value="">—</option>
                    <option value="bajo">Bajo</option>
                    <option value="medio">Medio</option>
                    <option value="alto">Alto</option>
                  </select>
                </Field>

                <Field label="Bombas sector — operativas">
                  <div className={`flex items-center gap-3 px-3.5 py-3 rounded-xl border transition-all
                    ${isEditing ? 'bg-white border-gray-200' : 'bg-gray-50 border-transparent'}`}>
                    <button type="button"
                      onClick={() => isEditing && setMR('pump_sector_operational', !machineRoom.pump_sector_operational)}
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all
                        ${machineRoom.pump_sector_operational ? 'bg-green-500 border-green-500' : 'border-gray-300 bg-white'}`}>
                      {machineRoom.pump_sector_operational && (
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                          <polyline points="2,6 5,9 10,3" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </button>
                    <span className="text-[14px] text-gray-700">
                      {machineRoom.pump_sector_operational ? 'Sí' : 'No'}
                    </span>
                  </div>
                </Field>

                {/* Cámara 12 */}
                <Field label="Vaciado cámara 12">
                  <select
                    value={machineRoom.camera12_drain ?? ''}
                    onChange={e => setMR('camera12_drain', e.target.value)}
                    disabled={!isEditing}
                    className={fieldCls(isEditing)}>
                    <option value="">—</option>
                    {[0,1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </Field>

                <Field label="Nivel agua cámara 12">
                  <div className="relative">
                    <input type="number" step="1" min="0" max="300"
                      value={machineRoom.camera12_water_level ?? ''}
                      onChange={e => setMR('camera12_water_level', e.target.value)}
                      readOnly={!isEditing} placeholder={isEditing ? '0–300' : '—'}
                      className={`${fieldCls(isEditing)} pr-6`}
                    />
                  </div>
                </Field>

              </div>
            </Card>
          )}

          {/* ── 7. Observaciones ─── */}
          <Card title="Observaciones" n={isFRY(module) || isHAT(module) ? 7 : 6}>
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
          <br />
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

       {showAlimentacion && isFF(module) && shift === 'noche' && log && (
       <div className="fixed inset-0 z-50 bg-[#F2F2F7] flex flex-col animate-slide-up">
         <AlimentacionFF
           logId={log.id}
           initialData={feedingPlan}
           date={date}
           onClose={() => setShowAlimentacion(false)}
         />
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