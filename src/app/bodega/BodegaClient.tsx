// src/app/bodega/BodegaClient.tsx

'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import type {
  BodegaConfig, CargoType, BodegaProduct, BodegaHistoryEntry,
} from './actions'
import {
  updateBodegaConfig,
  addCargoType, updateCargoType, deleteCargoType,
  createProduct, updateProduct, deleteProduct, moveProduct,
  getBodegaHistory,
  updateHistoryEntry, deleteHistoryEntry,
} from './actions'

/* ── Types ─────────────────────────────────────────────────── */
interface Props {
  profile:          { id: string; full_name: string; role: string }
  initialConfig:    BodegaConfig | null
  initialCargoTypes: CargoType[]
  initialProducts:  BodegaProduct[]
  initialHistory:   BodegaHistoryEntry[]
}

/* ── Calibre colours ────────────────────────────────────────── */
const CALIBRES = ['0.3','0.5','0.7','1.0','1.5','3.0','6.0'] as const
type Calibre = typeof CALIBRES[number]

const CALIBRE_COLORS: Record<Calibre, { bg: string; text: string; light: string; dot: string }> = {
  '0.3': { bg:'bg-violet-500',  text:'text-white',     light:'bg-violet-100',  dot:'#8b5cf6' },
  '0.5': { bg:'bg-blue-500',    text:'text-white',     light:'bg-blue-100',    dot:'#3b82f6' },
  '0.7': { bg:'bg-cyan-500',    text:'text-white',     light:'bg-cyan-100',    dot:'#06b6d4' },
  '1.0': { bg:'bg-green-500',   text:'text-white',     light:'bg-green-100',   dot:'#22c55e' },
  '1.5': { bg:'bg-yellow-400',  text:'text-gray-900',  light:'bg-yellow-100',  dot:'#eab308' },
  '3.0': { bg:'bg-orange-500',  text:'text-white',     light:'bg-orange-100',  dot:'#f97316' },
  '6.0': { bg:'bg-red-500',     text:'text-white',     light:'bg-red-100',     dot:'#ef4444' },
}
function getCalibreColor(c: string) {
  return CALIBRE_COLORS[c as Calibre] ?? { bg:'bg-gray-400', text:'text-white', light:'bg-gray-100', dot:'#9ca3af' }
}

/* ── Grid helpers ───────────────────────────────────────────── */
const COL_LABELS = ['A','B','C','D','E','F','G','H','I','J']

function getSectionLabel(col: number, row: number): string {
  return `${COL_LABELS[col]}${row + 1}`
}

/* ── Action label ───────────────────────────────────────────── */
const ACTION_LABELS: Record<string, string> = {
  create: 'Creado',
  update: 'Modificado',
  delete: 'Eliminado',
}
const ACTION_COLORS: Record<string, string> = {
  create: 'bg-green-100 text-green-700',
  update: 'bg-blue-100 text-blue-700',
  delete: 'bg-red-100 text-red-700',
}

/* ── Empty product form ─────────────────────────────────────── */
function emptyForm() {
  return {
    nombre: '', calibre: '1.0', fecha_venc: '',
    medicado: false, cargo_type_id: '', ubicacion: '', seccion: '', seccion_half: false,
  }
}

/* ══════════════════════════════════════════════════════════════
   COMPONENT
══════════════════════════════════════════════════════════════ */
export default function BodegaClient({
  profile, initialConfig, initialCargoTypes, initialProducts, initialHistory,
}: Props) {
  const router = useRouter()

  /* ── State ─── */
  const [config,     setConfig]     = useState<BodegaConfig | null>(initialConfig)
  const [cargoTypes, setCargoTypes] = useState<CargoType[]>(initialCargoTypes)
  const [products,   setProducts]   = useState<BodegaProduct[]>(initialProducts)
  const [history,    setHistory]    = useState<BodegaHistoryEntry[]>(initialHistory)

  const cols = config?.cols ?? 7
  const rows = config?.rows ?? 6

  /* ── UI state ─── */
  const [view, setView]               = useState<'main' | 'history' | 'config'>('main')
  const [dragEnabled, setDragEnabled] = useState(false)
  const [saving, setSaving]           = useState(false)

  // Search / filter
  const [search, setSearch]             = useState('')
  const [filterCalibre, setFilterCalibre] = useState('')
  const [filterMedicado, setFilterMedicado] = useState<'' | 'si' | 'no'>('')
  const [filterTipo, setFilterTipo]     = useState('')
  const [filterSeccion, setFilterSeccion] = useState('')
  const [showFilters, setShowFilters]   = useState(false)

  // History search
  const [histSearch, setHistSearch]     = useState('')
  const [histAction, setHistAction]     = useState('')
  const [histUser, setHistUser]         = useState('')

  // CRUD modals
  const [showCreate, setShowCreate]     = useState(false)
  const [showEdit,   setShowEdit]       = useState<BodegaProduct | null>(null)
  const [showDelete, setShowDelete]     = useState<BodegaProduct | null>(null)
  const [showSelectCell, setShowSelectCell] = useState(false) // para elegir sección al crear/editar
  const [editHistEntry, setEditHistEntry]   = useState<BodegaHistoryEntry | null>(null)
  const [deleteHistEntry, setDeleteHistId]  = useState<BodegaHistoryEntry | null>(null)

  // Form state
  const [form, setForm] = useState(emptyForm())
  const [formErr, setFormErr] = useState('')

  // Config form
  const [cfgCols, setCfgCols] = useState(String(cols))
  const [cfgRows, setCfgRows] = useState(String(rows))
  const [newCargoName, setNewCargoName]   = useState('')
  const [newCargoSlots, setNewCargoSlots] = useState('1.0')
  const [editingCargo, setEditingCargo]   = useState<CargoType | null>(null)
  const [cfgSaving, setCfgSaving]         = useState(false)

  // Drag
  const dragProductId = useRef<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)

  /* ── Derived ─── */
  const isEmpty = products.length === 0

  useEffect(() => { if (isEmpty) setDragEnabled(false) }, [isEmpty])

  /* ── Build cell map: seccion → products[] ─── */
  const cellMap = useMemo(() => {
    const map: Record<string, BodegaProduct[]> = {}
    for (const p of products) {
      if (!map[p.seccion]) map[p.seccion] = []
      map[p.seccion].push(p)
    }
    return map
  }, [products])

  /* ── Filtered products for list/search ─── */
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const q = search.toLowerCase()
      const matchQ = !q || p.nombre.toLowerCase().includes(q)
        || p.seccion.toLowerCase().includes(q)
        || p.calibre.includes(q)
      const matchCal  = !filterCalibre  || p.calibre === filterCalibre
      const matchMed  = !filterMedicado || (filterMedicado === 'si' ? p.medicado : !p.medicado)
      const matchTipo = !filterTipo     || p.cargo_type_id === filterTipo
      const matchSec  = !filterSeccion  || p.seccion.toLowerCase().includes(filterSeccion.toLowerCase())
      return matchQ && matchCal && matchMed && matchTipo && matchSec
    })
  }, [products, search, filterCalibre, filterMedicado, filterTipo, filterSeccion])

  /* ── Filtered history ─── */
  const filteredHistory = useMemo(() => {
    return history.filter(h => {
      const q = histSearch.toLowerCase()
      const matchQ = !q || h.product_name.toLowerCase().includes(q) || h.user_name.toLowerCase().includes(q)
      const matchA = !histAction || h.action === histAction
      const matchU = !histUser   || h.user_name.toLowerCase().includes(histUser.toLowerCase())
      return matchQ && matchA && matchU
    })
  }, [history, histSearch, histAction, histUser])

  /* ── Helpers ─── */
  function setF<K extends keyof ReturnType<typeof emptyForm>>(k: K, v: ReturnType<typeof emptyForm>[K]) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  function openCreate() {
    setForm(emptyForm())
    setFormErr('')
    setShowCreate(true)
  }

  function openEdit(p: BodegaProduct) {
    setForm({
      nombre: p.nombre, calibre: p.calibre,
      fecha_venc: p.fecha_venc ?? '', medicado: p.medicado,
      cargo_type_id: p.cargo_type_id ?? '', ubicacion: p.ubicacion ?? '',
      seccion: p.seccion, seccion_half: p.seccion_half,
    })
    setFormErr('')
    setShowEdit(p)
  }

  async function handleCreate() {
    if (!form.nombre.trim()) return setFormErr('El nombre es obligatorio.')
    if (!form.seccion)       return setFormErr('Selecciona una sección.')
    setSaving(true)
    const res = await createProduct({
      nombre:        form.nombre.trim(),
      calibre:       form.calibre,
      fecha_venc:    form.fecha_venc || null,
      medicado:      form.medicado,
      cargo_type_id: form.cargo_type_id || null,
      ubicacion:     form.ubicacion || null,
      seccion:       form.seccion,
      seccion_half:  form.seccion_half,
    })
    setSaving(false)
    if (res.error) return setFormErr(res.error)
    if (res.data)  setProducts(prev => [...prev, res.data!])
    setShowCreate(false)
  }

  async function handleEdit() {
    if (!showEdit) return
    if (!form.nombre.trim()) return setFormErr('El nombre es obligatorio.')
    if (!form.seccion)       return setFormErr('Selecciona una sección.')
    setSaving(true)
    const res = await updateProduct(showEdit.id, {
      nombre:        form.nombre.trim(),
      calibre:       form.calibre,
      fecha_venc:    form.fecha_venc || null,
      medicado:      form.medicado,
      cargo_type_id: form.cargo_type_id || null,
      ubicacion:     form.ubicacion || null,
      seccion:       form.seccion,
      seccion_half:  form.seccion_half,
    }, showEdit)
    setSaving(false)
    if (res.error) return setFormErr(res.error)
    setProducts(prev => prev.map(p => p.id === showEdit.id ? {
      ...p,
      nombre:        form.nombre.trim(),
      calibre:       form.calibre,
      fecha_venc:    form.fecha_venc || null,
      medicado:      form.medicado,
      cargo_type_id: form.cargo_type_id || null,
      ubicacion:     form.ubicacion || null,
      seccion:       form.seccion,
      seccion_half:  form.seccion_half,
      cargo_type:    cargoTypes.find(c => c.id === form.cargo_type_id) ?? null,
    } : p))
    const newHist = await getBodegaHistory()
    setHistory(newHist)
    setShowEdit(null)
  }

  async function handleDelete() {
    if (!showDelete) return
    setSaving(true)
    const res = await deleteProduct(showDelete.id, showDelete.nombre)
    setSaving(false)
    if (res.error) return
    setProducts(prev => prev.filter(p => p.id !== showDelete.id))
    const newHist = await getBodegaHistory()
    setHistory(newHist)
    setShowDelete(null)
  }

  /* ── Drag & drop ─── */
  function onDragStart(id: string) { dragProductId.current = id }
  function onDragEnd()             { dragProductId.current = null; setDragOver(null) }

  async function onDropCell(seccion: string) {
    const id = dragProductId.current
    setDragOver(null)
    if (!id) return
    const product = products.find(p => p.id === id)
    if (!product || product.seccion === seccion) return
    setProducts(prev => prev.map(p => p.id === id ? { ...p, seccion } : p))
    await moveProduct(id, seccion, product)
    const newHist = await getBodegaHistory()
    setHistory(newHist)
  }

  // Touch drag
  const touchStartPos = useRef<{ x: number; y: number } | null>(null)
  const cellRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  function onTouchStart(e: React.TouchEvent, id: string) {
    if (!dragEnabled) return
    dragProductId.current = id
    touchStartPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!dragProductId.current) return
    e.preventDefault()
    const touch = e.touches[0]
    let found: string | null = null
    cellRefs.current.forEach((el, sec) => {
      const r = el.getBoundingClientRect()
      if (touch.clientX >= r.left && touch.clientX <= r.right &&
          touch.clientY >= r.top  && touch.clientY <= r.bottom) {
        found = sec
      }
    })
    if (found) setDragOver(found)
  }

  async function onTouchEnd() {
    if (dragOver && dragProductId.current) await onDropCell(dragOver)
    dragProductId.current = null
    setDragOver(null)
  }

  /* ── Config save ─── */
  async function handleSaveConfig() {
    if (!config) return
    setCfgSaving(true)
    const c = Math.max(1, Math.min(20, parseInt(cfgCols) || 7))
    const r = Math.max(1, Math.min(20, parseInt(cfgRows) || 6))
    await updateBodegaConfig(config.id, c, r)
    setConfig({ ...config, cols: c, rows: r })
    setCfgSaving(false)
  }

  async function handleAddCargo() {
    if (!newCargoName.trim()) return
    const res = await addCargoType(newCargoName.trim(), parseFloat(newCargoSlots) || 1)
    if (res.data) { setCargoTypes(prev => [...prev, res.data!]); setNewCargoName(''); setNewCargoSlots('1.0') }
  }

  async function handleUpdateCargo() {
    if (!editingCargo) return
    await updateCargoType(editingCargo.id, editingCargo.name, editingCargo.slots_used)
    setCargoTypes(prev => prev.map(c => c.id === editingCargo.id ? editingCargo : c))
    setEditingCargo(null)
  }

  async function handleDeleteCargo(id: string) {
    const res = await deleteCargoType(id)
    if (!res.error) setCargoTypes(prev => prev.filter(c => c.id !== id))
  }

  /* ── History CRUD ─── */
  async function handleUpdateHistEntry() {
    if (!editHistEntry) return
    await updateHistoryEntry(editHistEntry.id, editHistEntry.product_name)
    setHistory(prev => prev.map(h => h.id === editHistEntry.id ? { ...h, product_name: editHistEntry.product_name } : h))
    setEditHistEntry(null)
  }

  async function handleDeleteHistEntry() {
    if (!deleteHistEntry) return
    await deleteHistoryEntry(deleteHistEntry.id)
    setHistory(prev => prev.filter(h => h.id !== deleteHistEntry.id))
    setDeleteHistId(null)
  }

  /* ── fieldCls ─── */
  const fieldCls = `w-full px-3.5 py-3 rounded-xl text-[14px] border border-gray-200 bg-white outline-none
    focus:border-blue-400 focus:ring-2 focus:ring-blue-50 text-gray-900 transition-all`

  /* ════════════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════════════ */
  return (
    <div className="min-h-dvh bg-[#F2F2F7] flex flex-col">

      {/* ══ TOPBAR ══ */}
      <header className="topbar-blur border-b border-black/[0.06] px-3 h-14 flex items-center justify-between sticky top-0 z-30 pt-safe">
        <button
          onClick={() => view !== 'main' ? setView('main') : router.push('/dashboard')}
          className="flex items-center gap-1 text-blue-500 text-[14px] font-medium active:opacity-60 transition-opacity">
          <svg width="8" height="13" viewBox="0 0 8 13" fill="none">
            <path d="M7 1L1 6.5L7 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>{view === 'main' ? 'Inicio' : 'Bodega'}</span>
        </button>

        <span className="text-[15px] font-bold text-gray-900">
          {view === 'main' ? 'Bodega' : view === 'history' ? 'Historial' : 'Configuración'}
        </span>

        <div className="flex items-center gap-1.5">
          {view === 'main' && (
            <>
              <button onClick={() => setView('history')}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-gray-100 text-gray-500 active:opacity-60">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
              </button>
              <button onClick={() => { setCfgCols(String(cols)); setCfgRows(String(rows)); setView('config') }}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-gray-100 text-gray-500 active:opacity-60">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
                </svg>
              </button>
            </>
          )}
        </div>
      </header>

      {/* ══ MAIN VIEW ══ */}
      {view === 'main' && (
        <main className="flex-1 px-4 py-4 space-y-3 max-w-lg mx-auto w-full pb-safe">

          {/* ── Search bar ─── */}
          <div className="bg-white rounded-2xl card-shadow px-4 py-3 space-y-2">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por nombre, sección, calibre…"
                className="w-full pl-8 pr-10 py-2.5 rounded-xl text-[14px] bg-gray-50 border border-transparent focus:border-blue-300 focus:bg-white outline-none transition-all"
              />
              <button onClick={() => setShowFilters(f => !f)}
                className={`absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg flex items-center justify-center transition-colors
                  ${showFilters ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="12" y1="18" x2="12" y2="18"/>
                </svg>
              </button>
            </div>

            {showFilters && (
              <div className="space-y-2 pt-1 border-t border-gray-100">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-0.5 block mb-1">Calibre</label>
                    <select value={filterCalibre} onChange={e => setFilterCalibre(e.target.value)}
                      className="w-full px-2.5 py-2 rounded-xl text-[13px] bg-gray-50 border border-transparent focus:border-blue-300 outline-none">
                      <option value="">Todos</option>
                      {CALIBRES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-0.5 block mb-1">Medicado</label>
                    <select value={filterMedicado} onChange={e => setFilterMedicado(e.target.value as '' | 'si' | 'no')}
                      className="w-full px-2.5 py-2 rounded-xl text-[13px] bg-gray-50 border border-transparent focus:border-blue-300 outline-none">
                      <option value="">Todos</option>
                      <option value="si">Sí</option>
                      <option value="no">No</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-0.5 block mb-1">Tipo</label>
                    <select value={filterTipo} onChange={e => setFilterTipo(e.target.value)}
                      className="w-full px-2.5 py-2 rounded-xl text-[13px] bg-gray-50 border border-transparent focus:border-blue-300 outline-none">
                      <option value="">Todos</option>
                      {cargoTypes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-0.5 block mb-1">Sección</label>
                    <input type="text" value={filterSeccion} onChange={e => setFilterSeccion(e.target.value)}
                      placeholder="ej. A1"
                      className="w-full px-2.5 py-2 rounded-xl text-[13px] bg-gray-50 border border-transparent focus:border-blue-300 outline-none"
                    />
                  </div>
                </div>
                {(filterCalibre || filterMedicado || filterTipo || filterSeccion) && (
                  <button onClick={() => { setFilterCalibre(''); setFilterMedicado(''); setFilterTipo(''); setFilterSeccion('') }}
                    className="text-[12px] text-blue-500 font-medium">
                    Limpiar filtros
                  </button>
                )}
              </div>
            )}

            {(search || filterCalibre || filterMedicado || filterTipo || filterSeccion) && (
              <p className="text-[12px] text-gray-400">
                {filteredProducts.length} resultado{filteredProducts.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>

          {/* ── Bodega grid ─── */}
          <div className="bg-white rounded-2xl card-shadow p-3">
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-[12px] font-bold text-gray-500 uppercase tracking-wider">
                Planta — {cols}×{rows}
              </span>
              {/* Drag toggle */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-gray-400">Arrastrar</span>
                <button
                  type="button"
                  onClick={() => !isEmpty && setDragEnabled(d => !d)}
                  disabled={isEmpty}
                  className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors
                    ${dragEnabled ? 'bg-blue-500' : 'bg-gray-200'}
                    ${isEmpty ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                  role="switch" aria-checked={dragEnabled}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform
                    ${dragEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </div>
            </div>

            {/* Column headers */}
            <div className="flex mb-1">
              <div className="w-5 flex-shrink-0" />
              {Array.from({ length: cols }, (_, c) => (
                <div key={c} className="flex-1 text-center text-[10px] font-bold text-gray-400">
                  {COL_LABELS[c]}
                </div>
              ))}
            </div>

            {/* Grid wrapper with doors border */}
            <div className="relative">
              {/* Custom SVG border with door cuts */}
              <GridBorder cols={cols} rows={rows} />

              <div className="p-1.5" style={{ touchAction: dragEnabled ? 'none' : 'auto' }}
                onTouchMove={dragEnabled ? onTouchMove : undefined}
                onTouchEnd={dragEnabled ? onTouchEnd : undefined}>
                {Array.from({ length: rows }, (_, r) => (
                  <div key={r} className="flex items-center mb-1 gap-0.5">
                    <div className="w-5 flex-shrink-0 text-center text-[10px] font-bold text-gray-400">{r + 1}</div>
                    {Array.from({ length: cols }, (_, c) => {
                      const sec  = getSectionLabel(c, r)
                      const cell = cellMap[sec] ?? []
                      const isOver = dragOver === sec

                      // Check filter highlight
                      const isHighlighted = (search || filterCalibre || filterMedicado || filterTipo || filterSeccion)
                        && filteredProducts.some(p => p.seccion === sec)

                      return (
                        <div key={sec}
                          ref={el => { if (el) cellRefs.current.set(sec, el); else cellRefs.current.delete(sec) }}
                          className={`flex-1 aspect-square rounded-lg transition-all relative overflow-hidden
                            ${isOver ? 'ring-2 ring-blue-400 scale-[1.05]' : ''}
                            ${isHighlighted ? 'ring-2 ring-yellow-400' : ''}
                            ${cell.length > 0 ? '' : 'bg-gray-50 border border-gray-100'}`}
                          onDragOver={dragEnabled ? e => { e.preventDefault(); setDragOver(sec) } : undefined}
                          onDragLeave={dragEnabled ? () => setDragOver(null) : undefined}
                          onDrop={dragEnabled ? () => onDropCell(sec) : undefined}
                        >
                          {cell.length === 0 ? (
                            <div className="w-full h-full flex items-center justify-center">
                              <span className="text-[8px] text-gray-300 font-mono">{sec}</span>
                            </div>
                          ) : (
                            <div className="w-full h-full flex flex-col">
                              {cell.map((prod, idx) => {
                                const col = getCalibreColor(prod.calibre)
                                const isHalf = prod.seccion_half
                                return (
                                  <div key={prod.id}
                                    draggable={dragEnabled}
                                    onDragStart={dragEnabled ? () => onDragStart(prod.id) : undefined}
                                    onDragEnd={dragEnabled ? onDragEnd : undefined}
                                    onTouchStart={dragEnabled ? e => onTouchStart(e, prod.id) : undefined}
                                    className={`${col.bg} ${col.text} flex-1 flex flex-col items-center justify-center
                                      cursor-pointer select-none transition-opacity active:opacity-70
                                      ${isHalf ? 'opacity-80' : ''}
                                      ${dragEnabled ? 'cursor-grab active:cursor-grabbing' : ''}`}
                                    style={{ minHeight: 0 }}
                                    title={`${prod.nombre} (${prod.calibre}) — ${sec}`}
                                  >
                                    <span className="text-[7px] font-bold leading-tight px-0.5 text-center truncate w-full text-center">
                                      {prod.calibre}
                                    </span>
                                    {isHalf && (
                                      <span className="text-[6px] opacity-70">½</span>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 px-1">
              {CALIBRES.map(c => {
                const col = getCalibreColor(c)
                const count = products.filter(p => p.calibre === c).length
                if (count === 0) return null
                return (
                  <div key={c} className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: col.dot }} />
                    <span className="text-[10px] text-gray-500">{c}</span>
                  </div>
                )
              })}
              {isEmpty && <span className="text-[11px] text-gray-400 italic">Bodega vacía</span>}
            </div>
          </div>

          {/* ── Products list (filtered) ─── */}
          {filteredProducts.length > 0 && (search || filterCalibre || filterMedicado || filterTipo || filterSeccion) && (
            <div className="bg-white rounded-2xl card-shadow overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100">
                <span className="text-[12px] font-bold text-gray-500 uppercase tracking-wider">Resultados</span>
              </div>
              <div className="divide-y divide-gray-50">
                {filteredProducts.map(p => {
                  const col = getCalibreColor(p.calibre)
                  return (
                    <div key={p.id} className="px-4 py-3 flex items-center gap-3">
                      <span className={`w-8 h-8 rounded-xl ${col.bg} ${col.text} flex items-center justify-center text-[11px] font-bold flex-shrink-0`}>
                        {p.calibre}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-semibold text-gray-900 truncate">{p.nombre}</p>
                        <p className="text-[11px] text-gray-400">
                          {p.seccion} · {p.cargo_type?.name ?? '—'}
                          {p.medicado && <span className="ml-1 text-amber-600 font-semibold">· Medicado</span>}
                          {p.fecha_venc && <span className="ml-1 text-gray-400">· Vence {p.fecha_venc}</span>}
                        </p>
                      </div>
                      <div className="flex gap-1.5 flex-shrink-0">
                        <button onClick={() => openEdit(p)}
                          className="w-7 h-7 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center active:opacity-60">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                        <button onClick={() => setShowDelete(p)}
                          className="w-7 h-7 rounded-lg bg-red-50 text-red-400 flex items-center justify-center active:opacity-60">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                            <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── CRUD Actions ─── */}
          <div className="grid grid-cols-3 gap-2">
            <button onClick={openCreate}
              className="flex flex-col items-center gap-1.5 bg-blue-500 text-white rounded-2xl py-3.5 active:bg-blue-600 transition-colors shadow-sm shadow-blue-200">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              <span className="text-[12px] font-semibold">Agregar</span>
            </button>

            <button onClick={() => { if (products.length > 0) openEdit(products[0]) }}
              disabled={isEmpty}
              className="flex flex-col items-center gap-1.5 bg-white text-gray-700 rounded-2xl py-3.5 active:bg-gray-50 transition-colors card-shadow disabled:opacity-40">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              <span className="text-[12px] font-semibold">Editar</span>
            </button>

            <button onClick={() => { if (products.length > 0) setShowDelete(products[0]) }}
              disabled={isEmpty}
              className="flex flex-col items-center gap-1.5 bg-white text-red-400 rounded-2xl py-3.5 active:bg-gray-50 transition-colors card-shadow disabled:opacity-40">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
              </svg>
              <span className="text-[12px] font-semibold">Eliminar</span>
            </button>
          </div>

          {/* ── All products list ─── */}
          {!search && !filterCalibre && !filterMedicado && !filterTipo && !filterSeccion && products.length > 0 && (
            <div className="bg-white rounded-2xl card-shadow overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100">
                <span className="text-[12px] font-bold text-gray-500 uppercase tracking-wider">
                  Inventario ({products.length})
                </span>
              </div>
              <div className="divide-y divide-gray-50">
                {products.map(p => {
                  const col = getCalibreColor(p.calibre)
                  return (
                    <div key={p.id} className="px-4 py-3 flex items-center gap-3">
                      <span className={`w-8 h-8 rounded-xl ${col.bg} ${col.text} flex items-center justify-center text-[11px] font-bold flex-shrink-0`}>
                        {p.calibre}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-semibold text-gray-900 break-words min-w-0">{p.nombre}</p>
                        <p className="text-[11px] text-gray-400">
                          {p.seccion} · {p.cargo_type?.name ?? '—'}
                          {p.medicado && <span className="ml-1 text-amber-600 font-semibold">· Medicado</span>}
                        </p>
                      </div>
                      <div className="flex gap-1.5 flex-shrink-0">
                        <button onClick={() => openEdit(p)}
                          className="w-7 h-7 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center active:opacity-60">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                        <button onClick={() => setShowDelete(p)}
                          className="w-7 h-7 rounded-lg bg-red-50 text-red-400 flex items-center justify-center active:opacity-60">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                            <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </main>
      )}

      {/* ══ HISTORY VIEW ══ */}
      {view === 'history' && (
        <main className="flex-1 px-4 py-4 space-y-3 max-w-lg mx-auto w-full pb-safe">
          {/* Search */}
          <div className="bg-white rounded-2xl card-shadow px-4 py-3 space-y-2">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input type="text" value={histSearch} onChange={e => setHistSearch(e.target.value)}
                placeholder="Buscar por producto o usuario…"
                className="w-full pl-8 pr-3 py-2.5 rounded-xl text-[14px] bg-gray-50 border border-transparent focus:border-blue-300 focus:bg-white outline-none transition-all"
              />
            </div>
            <div className="flex gap-2">
              <select value={histAction} onChange={e => setHistAction(e.target.value)}
                className="flex-1 px-2.5 py-2 rounded-xl text-[13px] bg-gray-50 border border-transparent focus:border-blue-300 outline-none">
                <option value="">Todas las acciones</option>
                <option value="create">Creado</option>
                <option value="update">Modificado</option>
                <option value="delete">Eliminado</option>
              </select>
              <input type="text" value={histUser} onChange={e => setHistUser(e.target.value)}
                placeholder="Usuario…"
                className="flex-1 px-2.5 py-2 rounded-xl text-[13px] bg-gray-50 border border-transparent focus:border-blue-300 outline-none"
              />
            </div>
            <p className="text-[11px] text-gray-400">{filteredHistory.length} entrada{filteredHistory.length !== 1 ? 's' : ''}</p>
          </div>

          {/* Entries */}
          <div className="bg-white rounded-2xl card-shadow overflow-hidden">
            {filteredHistory.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-400 text-[14px]">Sin movimientos registrados</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {filteredHistory.map(h => (
                  <div key={h.id} className="px-4 py-3 flex items-start gap-3">
                    <span className={`mt-0.5 flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${ACTION_COLORS[h.action]}`}>
                      {ACTION_LABELS[h.action]}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-gray-900 break-words">{h.product_name}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {h.user_name} · {new Date(h.created_at).toLocaleString('es-CL', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}
                      </p>
                      {h.changes && Object.keys(h.changes).length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {Object.entries(h.changes).map(([field, { from, to }]) => (
                            <p key={field} className="text-[10px] text-gray-400">
                              <span className="font-semibold">{field}:</span>{' '}
                              <span className="line-through text-red-400">{String(from)}</span>{' → '}
                              <span className="text-green-600">{String(to)}</span>
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => setEditHistEntry({ ...h })}
                        className="w-7 h-7 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center active:opacity-60">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                      <button onClick={() => setDeleteHistId(h)}
                        className="w-7 h-7 rounded-lg bg-red-50 text-red-400 flex items-center justify-center active:opacity-60">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      )}

      {/* ══ CONFIG VIEW ══ */}
      {view === 'config' && (
        <main className="flex-1 px-4 py-4 space-y-3 max-w-lg mx-auto w-full pb-safe">

          {/* Grid dimensions */}
          <div className="bg-white rounded-2xl card-shadow overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <span className="text-[13px] font-bold text-gray-700">Dimensiones de la bodega</span>
            </div>
            <div className="px-4 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-0.5 block mb-1">Columnas</label>
                  <input type="number" min="1" max="20" value={cfgCols}
                    onChange={e => setCfgCols(e.target.value)} className={fieldCls} />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-0.5 block mb-1">Filas</label>
                  <input type="number" min="1" max="20" value={cfgRows}
                    onChange={e => setCfgRows(e.target.value)} className={fieldCls} />
                </div>
              </div>
              <button onClick={handleSaveConfig} disabled={cfgSaving}
                className="w-full py-3 bg-blue-500 text-white text-[14px] font-semibold rounded-xl active:bg-blue-600 transition-colors disabled:opacity-50">
                {cfgSaving ? 'Guardando…' : 'Guardar dimensiones'}
              </button>
            </div>
          </div>

          {/* Cargo types */}
          <div className="bg-white rounded-2xl card-shadow overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <span className="text-[13px] font-bold text-gray-700">Tipos de carga</span>
            </div>
            <div className="divide-y divide-gray-50">
              {cargoTypes.map(ct => (
                <div key={ct.id} className="px-4 py-3">
                  {editingCargo?.id === ct.id ? (
                    <div className="space-y-2">
                      <input type="text" value={editingCargo.name}
                        onChange={e => setEditingCargo({ ...editingCargo, name: e.target.value })}
                        className={fieldCls} placeholder="Nombre" />
                      <div className="flex gap-2 items-center">
                        <input type="number" step="0.5" min="0.5" value={editingCargo.slots_used}
                          onChange={e => setEditingCargo({ ...editingCargo, slots_used: parseFloat(e.target.value) || 1 })}
                          className={`${fieldCls} flex-1`} placeholder="Casillas" />
                        <span className="text-[12px] text-gray-400 whitespace-nowrap">casillas</span>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={handleUpdateCargo}
                          className="flex-1 py-2.5 bg-blue-500 text-white text-[13px] font-semibold rounded-xl active:bg-blue-600">
                          Guardar
                        </button>
                        <button onClick={() => setEditingCargo(null)}
                          className="px-4 py-2.5 bg-gray-100 text-gray-600 text-[13px] rounded-xl active:bg-gray-200">
                          ✕
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-semibold text-gray-900">{ct.name}</p>
                        <p className="text-[11px] text-gray-400">{ct.slots_used} casilla{ct.slots_used !== 1 ? 's' : ''}</p>
                      </div>
                      <div className="flex gap-1.5">
                        <button onClick={() => setEditingCargo({ ...ct })}
                          className="w-7 h-7 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center active:opacity-60">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                        <button onClick={() => handleDeleteCargo(ct.id)}
                          className="w-7 h-7 rounded-lg bg-red-50 text-red-400 flex items-center justify-center active:opacity-60">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="px-4 py-4 border-t border-gray-100 space-y-2">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Nuevo tipo</p>
              <input type="text" value={newCargoName} onChange={e => setNewCargoName(e.target.value)}
                placeholder="Nombre del tipo…" className={fieldCls} />
              <div className="flex gap-2 items-center">
                <input type="number" step="0.5" min="0.5" value={newCargoSlots}
                  onChange={e => setNewCargoSlots(e.target.value)}
                  className={`${fieldCls} flex-1`} placeholder="Casillas" />
                <span className="text-[12px] text-gray-400 whitespace-nowrap">casillas</span>
              </div>
              <button onClick={handleAddCargo} disabled={!newCargoName.trim()}
                className="w-full py-3 bg-blue-500 text-white text-[14px] font-semibold rounded-xl active:bg-blue-600 disabled:opacity-40">
                Agregar tipo
              </button>
            </div>
          </div>
        </main>
      )}

      {/* ══ MODALS ══ */}

      {/* ── Create / Edit product sheet ─── */}
      {(showCreate || showEdit) && (
        <ProductSheet
          title={showEdit ? 'Editar producto' : 'Agregar producto'}
          form={form} setF={setF} formErr={formErr}
          cargoTypes={cargoTypes} saving={saving}
          cols={cols} rows={rows}
          onSave={showEdit ? handleEdit : handleCreate}
          onClose={() => { setShowCreate(false); setShowEdit(null) }}
          fieldCls={fieldCls}
        />
      )}

      {/* ── Delete product ─── */}
      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40">
          <div className="animate-slide-up bg-white rounded-t-3xl w-full max-w-lg mx-auto px-5 pt-4 pb-safe space-y-4">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto" />
            <div className="w-14 h-14 rounded-2xl bg-red-100 flex items-center justify-center mx-auto">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
              </svg>
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-[18px] font-bold text-gray-900">Eliminar producto</h3>
              <p className="text-[13px] text-gray-500">
                ¿Eliminar <strong>{showDelete.nombre}</strong> de la sección {showDelete.seccion}?
              </p>
            </div>
            <div className="flex gap-3 pb-2">
              <button onClick={() => setShowDelete(null)}
                className="flex-1 py-3.5 rounded-2xl bg-gray-100 text-gray-700 font-semibold text-[15px] active:bg-gray-200">
                Cancelar
              </button>
              <button onClick={handleDelete} disabled={saving}
                className="flex-1 py-3.5 rounded-2xl bg-red-500 text-white font-semibold text-[15px] active:bg-red-600 disabled:opacity-35">
                {saving ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit history entry ─── */}
      {editHistEntry && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40">
          <div className="animate-slide-up bg-white rounded-t-3xl w-full max-w-lg mx-auto px-5 pt-4 pb-safe space-y-4">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto" />
            <h3 className="text-[17px] font-bold text-gray-900 text-center">Editar entrada</h3>
            <div>
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-0.5 block mb-1">Nombre del producto</label>
              <input type="text" value={editHistEntry.product_name}
                onChange={e => setEditHistEntry({ ...editHistEntry, product_name: e.target.value })}
                className={fieldCls} />
            </div>
            <div className="flex gap-3 pb-2">
              <button onClick={() => setEditHistEntry(null)}
                className="flex-1 py-3.5 rounded-2xl bg-gray-100 text-gray-700 font-semibold text-[15px]">
                Cancelar
              </button>
              <button onClick={handleUpdateHistEntry}
                className="flex-1 py-3.5 rounded-2xl bg-blue-500 text-white font-semibold text-[15px]">
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete history entry ─── */}
      {deleteHistEntry && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40">
          <div className="animate-slide-up bg-white rounded-t-3xl w-full max-w-lg mx-auto px-5 pt-4 pb-safe space-y-4">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto" />
            <div className="text-center space-y-1">
              <h3 className="text-[18px] font-bold text-gray-900">Eliminar entrada</h3>
              <p className="text-[13px] text-gray-500">Se eliminará permanentemente del historial.</p>
            </div>
            <div className="flex gap-3 pb-2">
              <button onClick={() => setDeleteHistId(null)}
                className="flex-1 py-3.5 rounded-2xl bg-gray-100 text-gray-700 font-semibold text-[15px]">
                Cancelar
              </button>
              <button onClick={handleDeleteHistEntry}
                className="flex-1 py-3.5 rounded-2xl bg-red-500 text-white font-semibold text-[15px]">
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   GridBorder — SVG border with door cut-outs bottom-right
══════════════════════════════════════════════════════════════ */
function GridBorder({ cols, rows }: { cols: number; rows: number }) {
  // Cell size approx (we use percentage in the parent)
  // Doors: bottom edge cut at 65%-85% and right edge cut at 65%-85%
  const r = 12 // border-radius in px

  return (
    <div className="absolute inset-0 pointer-events-none" aria-hidden>
      <svg width="100%" height="100%" className="absolute inset-0 overflow-visible">
        <defs>
          <style>{`
            .bodega-border {
              fill: none;
              stroke: #d1d5db;
              stroke-width: 2;
            }
          `}</style>
        </defs>
        {/* Top edge full */}
        <line className="bodega-border" x1={r} y1="1" x2="calc(100% - 1px)" y2="1" />
        {/* Right edge top half (to 60%) */}
        <line className="bodega-border" x1="calc(100% - 1px)" y1="1" x2="calc(100% - 1px)" y2="57%" />
        {/* Right edge door gap 60%-80% — skip (door 1) */}
        {/* Right edge 80%-100% */}
        <line className="bodega-border" x1="calc(100% - 1px)" y1="80%" x2="calc(100% - 1px)" y2="calc(100% - 1px)" />
        {/* Bottom edge left portion (0-55%) */}
        <line className="bodega-border" x1={r} y1="calc(100% - 1px)" x2="55%" y2="calc(100% - 1px)" />
        {/* Bottom edge door gap 55%-75% — skip (door 2) */}
        {/* Bottom edge 75%-100% */}
        <line className="bodega-border" x1="75%" y1="calc(100% - 1px)" x2="calc(100% - 1px)" y2="calc(100% - 1px)" />
        {/* Left edge full */}
        <line className="bodega-border" x1="1" y1={r} x2="1" y2="calc(100% - 1px)" />
        {/* Top-left corner arc */}
        <path className="bodega-border" d={`M 1 ${r} Q 1 1 ${r} 1`} />
        {/* Bottom-left corner arc */}
        <path className="bodega-border" d={`M 1 calc(100% - ${r}px) Q 1 calc(100% - 1px) ${r} calc(100% - 1px)`} />
        {/* Door indicators: small arrows */}
        {/* Bottom door arrow */}
        <path className="bodega-border" stroke="#9ca3af" strokeWidth="1.5" d="M 60% calc(100% + 6px) L 63% calc(100% + 2px) L 66% calc(100% + 6px)" />
        {/* Right door arrow */}
        <path className="bodega-border" stroke="#9ca3af" strokeWidth="1.5" d="M calc(100% + 6px) 63% L calc(100% + 2px) 66% L calc(100% + 6px) 69%" />
        {/* Door labels */}
        <text x="62%" y="calc(100% + 14px)" textAnchor="middle" className="text-[8px]" fill="#9ca3af" fontSize="8">Puerta</text>
        <text x="calc(100% + 8px)" y="67%" textAnchor="start" className="text-[8px]" fill="#9ca3af" fontSize="8" transform={`rotate(90, calc(100% + 8px), 67%)`}>Puerta</text>
      </svg>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   ProductSheet — create/edit modal
══════════════════════════════════════════════════════════════ */
interface ProductSheetProps {
  title:      string
  form:       ReturnType<typeof emptyForm>
  setF:       <K extends keyof ReturnType<typeof emptyForm>>(k: K, v: ReturnType<typeof emptyForm>[K]) => void
  formErr:    string
  cargoTypes: CargoType[]
  saving:     boolean
  cols:       number
  rows:       number
  onSave:     () => void
  onClose:    () => void
  fieldCls:   string
}

function ProductSheet({ title, form, setF, formErr, cargoTypes, saving, cols, rows, onSave, onClose, fieldCls }: ProductSheetProps) {
  const [pickingSection, setPickingSection] = useState(false)

  return (
    <div className="fixed inset-0 z-50 bg-[#F2F2F7] flex flex-col animate-slide-up overflow-y-auto">
      {/* Header */}
      <div className="topbar-blur border-b border-black/[0.06] px-4 h-14 flex items-center justify-between sticky top-0 z-10">
        <button onClick={onClose} className="text-blue-500 text-[14px] font-medium active:opacity-60">Cancelar</button>
        <span className="text-[15px] font-bold text-gray-900">{title}</span>
        <button onClick={onSave} disabled={saving}
          className="bg-blue-500 text-white text-[13px] font-semibold px-3.5 py-1.5 rounded-full shadow-sm active:bg-blue-600 disabled:opacity-50">
          {saving ? '…' : 'Guardar'}
        </button>
      </div>

      <div className="flex-1 px-4 py-4 space-y-3 max-w-lg mx-auto w-full pb-safe">
        {formErr && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-[13px] text-red-700 font-medium">
            {formErr}
          </div>
        )}

        <div className="bg-white rounded-2xl card-shadow px-4 py-4 space-y-3">

          <div>
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-0.5 block mb-1">Nombre *</label>
            <input type="text" value={form.nombre} onChange={e => setF('nombre', e.target.value)}
              placeholder="Nombre del alimento" className={fieldCls} />
          </div>

          <div>
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-0.5 block mb-1">Calibre *</label>
            <div className="flex flex-wrap gap-2">
              {CALIBRES.map(c => {
                const col = getCalibreColor(c)
                const active = form.calibre === c
                return (
                  <button key={c} type="button" onClick={() => setF('calibre', c)}
                    className={`px-3 py-1.5 rounded-xl text-[13px] font-bold transition-all
                      ${active ? `${col.bg} ${col.text}` : 'bg-gray-100 text-gray-500'}`}>
                    {c}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-0.5 block mb-1">Tipo de carga</label>
            <select value={form.cargo_type_id} onChange={e => setF('cargo_type_id', e.target.value)} className={fieldCls}>
              <option value="">— Sin tipo —</option>
              {cargoTypes.map(c => <option key={c.id} value={c.id}>{c.name} ({c.slots_used} casilla{c.slots_used !== 1 ? 's' : ''})</option>)}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-0.5 block mb-1">Fecha de vencimiento</label>
            <input type="date" value={form.fecha_venc} onChange={e => setF('fecha_venc', e.target.value)} className={fieldCls} />
          </div>

          <div className="flex items-center gap-3">
            <button type="button"
              onClick={() => setF('medicado', !form.medicado)}
              className={`relative inline-flex h-7 w-12 flex-shrink-0 rounded-full border-2 border-transparent transition-colors
                ${form.medicado ? 'bg-amber-500' : 'bg-gray-200'} cursor-pointer`}
              role="switch" aria-checked={form.medicado}>
              <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform
                ${form.medicado ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
            <span className={`text-[14px] font-semibold ${form.medicado ? 'text-amber-600' : 'text-gray-400'}`}>
              {form.medicado ? 'Medicado' : 'No medicado'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button type="button"
              onClick={() => setF('seccion_half', !form.seccion_half)}
              className={`relative inline-flex h-7 w-12 flex-shrink-0 rounded-full border-2 border-transparent transition-colors
                ${form.seccion_half ? 'bg-blue-500' : 'bg-gray-200'} cursor-pointer`}
              role="switch" aria-checked={form.seccion_half}>
              <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform
                ${form.seccion_half ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
            <span className={`text-[14px] font-semibold ${form.seccion_half ? 'text-blue-600' : 'text-gray-400'}`}>
              Media casilla (½)
            </span>
          </div>

          <div>
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-0.5 block mb-1">Ubicación adicional</label>
            <input type="text" value={form.ubicacion} onChange={e => setF('ubicacion', e.target.value)}
              placeholder="ej. Pasillo norte, Fila 2…" className={fieldCls} />
          </div>

          <div>
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-0.5 block mb-1">Sección *</label>
            {!pickingSection ? (
              <button type="button" onClick={() => setPickingSection(true)}
                className={`w-full px-3.5 py-3 rounded-xl text-[14px] border text-left transition-all
                  ${form.seccion ? 'bg-blue-50 border-blue-200 text-blue-700 font-semibold' : 'bg-white border-gray-200 text-gray-400'}`}>
                {form.seccion || 'Toca para seleccionar en la cuadrícula…'}
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-[12px] text-blue-600 font-medium">Toca la sección deseada:</p>
                {/* Mini grid picker */}
                <div className="flex mb-1">
                  <div className="w-5" />
                  {Array.from({ length: cols }, (_, c) => (
                    <div key={c} className="flex-1 text-center text-[9px] font-bold text-gray-400">{COL_LABELS[c]}</div>
                  ))}
                </div>
                {Array.from({ length: rows }, (_, r) => (
                  <div key={r} className="flex gap-0.5 mb-0.5">
                    <div className="w-5 text-center text-[9px] font-bold text-gray-400 flex items-center">{r + 1}</div>
                    {Array.from({ length: cols }, (_, c) => {
                      const sec = getSectionLabel(c, r)
                      const sel = form.seccion === sec
                      return (
                        <button key={sec} type="button"
                          onClick={() => { setF('seccion', sec); setPickingSection(false) }}
                          className={`flex-1 aspect-square rounded text-[9px] font-bold transition-all
                            ${sel ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500 active:bg-blue-100'}`}>
                          {sec}
                        </button>
                      )
                    })}
                  </div>
                ))}
                <button type="button" onClick={() => setPickingSection(false)}
                  className="text-[12px] text-gray-400 mt-1">
                  Cancelar selección
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}