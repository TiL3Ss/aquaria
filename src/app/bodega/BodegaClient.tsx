// src/app/bodega/BodegaClient.tsx
'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
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
import {toRoman} from './utils'

/* ── Types ─────────────────────────────────────────────────── */
interface DbModule { id: string; name: string; slug: string }

interface Props {
  profile:           { id: string; full_name: string; role: string }
  initialConfig:     BodegaConfig | null
  initialCargoTypes: CargoType[]
  initialProducts:   BodegaProduct[]
  initialHistory:    BodegaHistoryEntry[]
  dbModules?:        DbModule[]
}

/* ── Constants ──────────────────────────────────────────────── */
const MAX_NIVELES = 5
const CALIBRES = ['0.3','0.5','0.7','1.0','1.5','3.0','6.0'] as const
type Calibre = typeof CALIBRES[number]

const CALIBRE_COLORS: Record<Calibre, { bg: string; text: string; dot: string; hex: string }> = {
  '0.3': { bg:'bg-violet-500', text:'text-white',    dot:'#8b5cf6', hex:'#8b5cf6' },
  '0.5': { bg:'bg-blue-500',   text:'text-white',    dot:'#3b82f6', hex:'#3b82f6' },
  '0.7': { bg:'bg-cyan-500',   text:'text-white',    dot:'#06b6d4', hex:'#06b6d4' },
  '1.0': { bg:'bg-green-500',  text:'text-white',    dot:'#22c55e', hex:'#22c55e' },
  '1.5': { bg:'bg-yellow-400', text:'text-gray-900', dot:'#eab308', hex:'#eab308' },
  '3.0': { bg:'bg-orange-500', text:'text-white',    dot:'#f97316', hex:'#f97316' },
  '6.0': { bg:'bg-red-500',    text:'text-white',    dot:'#ef4444', hex:'#ef4444' },
}
function getCalibreColor(c: string) {
  return CALIBRE_COLORS[c as Calibre] ?? { bg:'bg-gray-400', text:'text-white', dot:'#9ca3af', hex:'#9ca3af' }
}

const COL_LABELS = ['A','B','C','D','E','F','G','H','I','J']
function getSectionLabel(col: number, row: number) { return `${COL_LABELS[col]}${row + 1}` }

const ACTION_LABELS: Record<string, string> = { create:'Creado', update:'Modificado', delete:'Eliminado' }
const ACTION_COLORS: Record<string, string> = {
  create:'bg-green-100 text-green-700',
  update:'bg-blue-100 text-blue-700',
  delete:'bg-red-100 text-red-700',
}

function emptyForm() {
  return {
    nombre:'', calibre:'1.0', fecha_venc:'',
    medicado:false, cargo_type_id:'', ubicacion:'', seccion:'', nivel:1, seccion_half:false,
  }
}

/* ══════════════════════════════════════════════════════════════
   COMPONENT
══════════════════════════════════════════════════════════════ */
export default function BodegaClient({
  profile, initialConfig, initialCargoTypes, initialProducts, initialHistory, dbModules = [],
}: Props) {
  const router = useRouter()

  const [config,     setConfig]     = useState<BodegaConfig | null>(initialConfig)
  const [cargoTypes, setCargoTypes] = useState<CargoType[]>(initialCargoTypes)
  const [products,   setProducts]   = useState<BodegaProduct[]>(initialProducts)
  const [history,    setHistory]    = useState<BodegaHistoryEntry[]>(initialHistory)

  const cols = config?.cols ?? 7
  const rows = config?.rows ?? 6

  const [view,        setView]        = useState<'main'|'history'|'config'>('main')
  const [drawerOpen,  setDrawerOpen]  = useState(false)
  const [dragEnabled, setDragEnabled] = useState(false)
  const [saving,      setSaving]      = useState(false)

  // Search / filter
  const [search,         setSearch]         = useState('')
  const [filterCalibre,  setFilterCalibre]  = useState('')
  const [filterMedicado, setFilterMedicado] = useState<''|'si'|'no'>('')
  const [filterTipo,     setFilterTipo]     = useState('')
  const [filterSeccion,  setFilterSeccion]  = useState('')
  const [showFilters,    setShowFilters]    = useState(false)

  // History search
  const [histSearch, setHistSearch] = useState('')
  const [histAction, setHistAction] = useState('')
  const [histUser,   setHistUser]   = useState('')

  // CRUD
  const [showCreate,      setShowCreate]      = useState(false)
  const [showEdit,        setShowEdit]        = useState<BodegaProduct | null>(null)
  const [showDelete,      setShowDelete]      = useState<BodegaProduct | null>(null)
  const [editHistEntry,   setEditHistEntry]   = useState<BodegaHistoryEntry | null>(null)
  const [deleteHistEntry, setDeleteHistId]    = useState<BodegaHistoryEntry | null>(null)

  // Drag level picker
  const [dragLevelPicker, setDragLevelPicker] = useState<{
    productId: string
    targetSeccion: string
    freeNiveles: number[]
  } | null>(null)

  // Form
  const [form,    setForm]    = useState(emptyForm())
  const [formErr, setFormErr] = useState('')

  // Config
  const [cfgCols,       setCfgCols]       = useState(String(cols))
  const [cfgRows,       setCfgRows]       = useState(String(rows))
  const [newCargoName,  setNewCargoName]  = useState('')
  const [newCargoSlots, setNewCargoSlots] = useState('1.0')
  const [editingCargo,  setEditingCargo]  = useState<CargoType | null>(null)
  const [cfgSaving,     setCfgSaving]     = useState(false)

  // Drag
  const dragProductId = useRef<string | null>(null)
  const [dragOver,    setDragOver]    = useState<string | null>(null)
  const cellRefs      = useRef<Map<string, HTMLDivElement>>(new Map())

  const isEmpty = products.length === 0
  useEffect(() => { if (isEmpty) setDragEnabled(false) }, [isEmpty])

  /* ── Cell map: seccion → productos[] ordenados por nivel ── */
  const cellMap = useMemo(() => {
    const map: Record<string, BodegaProduct[]> = {}
    for (const p of products) {
      if (!map[p.seccion]) map[p.seccion] = []
      map[p.seccion].push(p)
    }
    // Ordenar por nivel dentro de cada celda
    for (const sec of Object.keys(map)) {
      map[sec].sort((a, b) => a.nivel - b.nivel)
    }
    return map
  }, [products])

  /* ── Filtered products ── */
  const filteredProducts = useMemo(() => products.filter(p => {
    const q = search.toLowerCase()
    const matchQ   = !q || p.nombre.toLowerCase().includes(q) || p.seccion.toLowerCase().includes(q) || p.calibre.includes(q)
    const matchCal = !filterCalibre  || p.calibre === filterCalibre
    const matchMed = !filterMedicado || (filterMedicado === 'si' ? p.medicado : !p.medicado)
    const matchTip = !filterTipo     || p.cargo_type_id === filterTipo
    const matchSec = !filterSeccion  || p.seccion.toLowerCase().includes(filterSeccion.toLowerCase())
    return matchQ && matchCal && matchMed && matchTip && matchSec
  }), [products, search, filterCalibre, filterMedicado, filterTipo, filterSeccion])

  /* ── Filtered history ── */
  const filteredHistory = useMemo(() => history.filter(h => {
    const q = histSearch.toLowerCase()
    const matchQ = !q || h.product_name.toLowerCase().includes(q) || h.user_name.toLowerCase().includes(q)
    const matchA = !histAction || h.action === histAction
    const matchU = !histUser   || h.user_name.toLowerCase().includes(histUser.toLowerCase())
    return matchQ && matchA && matchU
  }), [history, histSearch, histAction, histUser])

  /* ── Helper: niveles libres de una sección (excluyendo un id) ── */
  function freeNivelesInSeccion(seccion: string, excludeId?: string): number[] {
    const ocupados = (cellMap[seccion] ?? [])
      .filter(p => p.id !== excludeId)
      .map(p => p.nivel)
    return [1,2,3,4,5].filter(n => !ocupados.includes(n))
  }

  function setF<K extends keyof ReturnType<typeof emptyForm>>(k: K, v: ReturnType<typeof emptyForm>[K]) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  function openCreate() { setForm(emptyForm()); setFormErr(''); setShowCreate(true) }

  function openEdit(p: BodegaProduct) {
    setForm({
      nombre: p.nombre, calibre: p.calibre,
      fecha_venc: p.fecha_venc ?? '', medicado: p.medicado,
      cargo_type_id: p.cargo_type_id ?? '', ubicacion: p.ubicacion ?? '',
      seccion: p.seccion, nivel: p.nivel, seccion_half: p.seccion_half,
    })
    setFormErr('')
    setShowEdit(p)
  }

  async function handleCreate() {
    if (!form.nombre.trim()) return setFormErr('El nombre es obligatorio.')
    if (!form.seccion)       return setFormErr('Selecciona una sección.')
    setSaving(true)
    const res = await createProduct({
      nombre: form.nombre.trim(), calibre: form.calibre,
      fecha_venc: form.fecha_venc || null, medicado: form.medicado,
      cargo_type_id: form.cargo_type_id || null, ubicacion: form.ubicacion || null,
      seccion: form.seccion, nivel: form.nivel, seccion_half: form.seccion_half,
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
      nombre: form.nombre.trim(), calibre: form.calibre,
      fecha_venc: form.fecha_venc || null, medicado: form.medicado,
      cargo_type_id: form.cargo_type_id || null, ubicacion: form.ubicacion || null,
      seccion: form.seccion, nivel: form.nivel, seccion_half: form.seccion_half,
    }, showEdit)
    setSaving(false)
    if (res.error) return setFormErr(res.error)
    setProducts(prev => prev.map(p => p.id === showEdit.id ? {
      ...p, nombre: form.nombre.trim(), calibre: form.calibre,
      fecha_venc: form.fecha_venc || null, medicado: form.medicado,
      cargo_type_id: form.cargo_type_id || null, ubicacion: form.ubicacion || null,
      seccion: form.seccion, nivel: form.nivel, seccion_half: form.seccion_half,
      cargo_type: cargoTypes.find(c => c.id === form.cargo_type_id) ?? null,
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

  /* ── Drag desktop ── */
  function onDragStart(id: string) { dragProductId.current = id }
  function onDragEnd()             { dragProductId.current = null; setDragOver(null) }

  async function onDropCell(seccion: string) {
    setDragOver(null)
    const id = dragProductId.current
    dragProductId.current = null
    if (!id) return
    const product = products.find(p => p.id === id)
    if (!product) return
    // Mismo slot: no hacer nada
    if (product.seccion === seccion) return

    const free = freeNivelesInSeccion(seccion, id)
    if (free.length === 0) return // Celda llena

    if (free.length === 1) {
      // Solo un nivel libre: mover directamente
      await doMove(id, seccion, free[0], product)
    } else {
      // Pedir nivel
      setDragLevelPicker({ productId: id, targetSeccion: seccion, freeNiveles: free })
    }
  }

  async function doMove(id: string, seccion: string, nivel: number, product: BodegaProduct) {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, seccion, nivel } : p))
    const res = await moveProduct(id, seccion, nivel, product)
    if (res.error) {
      // Revertir
      setProducts(prev => prev.map(p => p.id === id ? { ...p, seccion: product.seccion, nivel: product.nivel } : p))
    }
    const newHist = await getBodegaHistory()
    setHistory(newHist)
  }

  async function handleDragLevelPick(nivel: number) {
    if (!dragLevelPicker) return
    const { productId, targetSeccion } = dragLevelPicker
    setDragLevelPicker(null)
    const product = products.find(p => p.id === productId)
    if (!product) return
    await doMove(productId, targetSeccion, nivel, product)
  }

  /* ── Touch drag ── */
  function onTouchStart(e: React.TouchEvent, id: string) {
    if (!dragEnabled) return
    dragProductId.current = id
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!dragProductId.current) return
    e.preventDefault()
    const touch = e.touches[0]
    let found: string | null = null
    cellRefs.current.forEach((el, sec) => {
      const r = el.getBoundingClientRect()
      if (touch.clientX >= r.left && touch.clientX <= r.right &&
          touch.clientY >= r.top  && touch.clientY <= r.bottom) found = sec
    })
    if (found) setDragOver(found)
  }

  async function onTouchEnd() {
    if (dragOver && dragProductId.current) await onDropCell(dragOver)
    dragProductId.current = null
    setDragOver(null)
  }

  /* ── Config ── */
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

  const fieldCls = `w-full px-3.5 py-3 rounded-xl text-[14px] border border-gray-200 bg-white outline-none
    focus:border-blue-400 focus:ring-2 focus:ring-blue-50 text-gray-900 transition-all`

  /* ════════════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════════════ */
  return (
    <div className="min-h-dvh bg-[#F2F2F7] flex flex-col">

      {/* ══ TOPBAR ══ */}
      <header className="topbar-blur border-b border-black/[0.06] px-3 h-14 flex items-center justify-between sticky top-0 z-30 pt-safe">
        {view !== 'main' ? (
          <button onClick={() => setView('main')}
            className="flex items-center gap-1 text-blue-500 text-[14px] font-medium active:opacity-60 transition-opacity">
            <svg width="8" height="13" viewBox="0 0 8 13" fill="none">
              <path d="M7 1L1 6.5L7 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>Bodega</span>
          </button>
        ) : (
          <button onClick={() => setDrawerOpen(true)}
            className="flex items-center gap-2 active:opacity-60 transition-opacity">
            <div className="w-8 h-8 bg-blue-500 rounded-[10px] flex items-center justify-center shadow-sm">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/>
              </svg>
            </div>
          </button>
        )}

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

      {/* ══ DRAWER ══ */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-[3px]" onClick={() => setDrawerOpen(false)} />
          <div className="animate-drawer-in relative bg-white w-72 h-full flex flex-col shadow-2xl pt-safe">
            <div className="px-5 pt-5 pb-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-500 rounded-2xl flex items-center justify-center shadow-md shadow-blue-200">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                  </svg>
                </div>
                <div>
                  <div className="text-[16px] font-bold text-gray-900">Aquaria</div>
                  <div className="text-[12px] text-gray-400 truncate max-w-[140px]">{profile.full_name}</div>
                </div>
              </div>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 py-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.12em] px-2 mb-2">Módulos</p>
              <div className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl mb-0.5 bg-blue-50">
                <span className="w-8 h-8 rounded-[10px] flex items-center justify-center text-[10px] font-bold flex-shrink-0 bg-blue-500 text-white shadow-sm shadow-blue-300">BOD</span>
                <span className="text-[15px] font-semibold text-blue-600">Bodega</span>
                <span className="ml-auto w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center">
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </span>
              </div>
              {dbModules.filter(m => m.slug !== 'bodega').map(mod => (
                <button key={mod.id} onClick={() => { setDrawerOpen(false); router.push(`/dashboard?module=${mod.slug}`) }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl mb-0.5 active:bg-gray-100 transition-all active:scale-[0.98]">
                  <span className="w-8 h-8 rounded-[10px] flex items-center justify-center text-[10px] font-bold flex-shrink-0 bg-gray-100 text-gray-500">
                    {mod.slug.slice(0, 3).toUpperCase()}
                  </span>
                  <span className="text-[15px] font-medium text-gray-700">{mod.name}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>
      )}

      {/* ══ MAIN VIEW ══ */}
      {view === 'main' && (
        <main className="flex-1 px-4 py-4 space-y-3 max-w-lg mx-auto w-full pb-safe">

          {/* ── Buscador ── */}
          <div className="bg-white rounded-2xl card-shadow px-4 py-3 space-y-2">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
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
                    <select value={filterMedicado} onChange={e => setFilterMedicado(e.target.value as ''|'si'|'no')}
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
                      className="w-full px-2.5 py-2 rounded-xl text-[13px] bg-gray-50 border border-transparent focus:border-blue-300 outline-none" />
                  </div>
                </div>
                {(filterCalibre || filterMedicado || filterTipo || filterSeccion) && (
                  <button onClick={() => { setFilterCalibre(''); setFilterMedicado(''); setFilterTipo(''); setFilterSeccion('') }}
                    className="text-[12px] text-blue-500 font-medium">Limpiar filtros</button>
                )}
              </div>
            )}
            {(search || filterCalibre || filterMedicado || filterTipo || filterSeccion) && (
              <p className="text-[12px] text-gray-400">{filteredProducts.length} resultado{filteredProducts.length !== 1 ? 's' : ''}</p>
            )}
          </div>

          {/* ── Grid ── */}
          <div className="bg-white rounded-2xl card-shadow p-3">
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-[12px] font-bold text-gray-500 uppercase tracking-wider">Planta — {cols}×{rows}</span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-gray-400">Arrastrar</span>
                <button type="button" onClick={() => !isEmpty && setDragEnabled(d => !d)} disabled={isEmpty}
                  className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors
                    ${dragEnabled ? 'bg-blue-500' : 'bg-gray-200'} ${isEmpty ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                  role="switch" aria-checked={dragEnabled}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${dragEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </div>
            </div>

            {/* Column headers */}
            <div className="flex mb-1 ml-5">
              {Array.from({ length: cols }, (_, c) => (
                <div key={c} className="flex-1 text-center text-[10px] font-bold text-gray-400">{COL_LABELS[c]}</div>
              ))}
            </div>

            {/* Grid con borde y etiquetas S en el contorno */}
            <div className="relative" style={{ padding: '8px 12px 14px 8px' }}>

              {/* Borde azul con cortes para puertas */}
              <GridBorderMobile cols={cols} rows={rows} />

              {/* Grid interior */}
              <div style={{ touchAction: dragEnabled ? 'none' : 'auto' }}
                onTouchMove={dragEnabled ? onTouchMove : undefined}
                onTouchEnd={dragEnabled ? onTouchEnd : undefined}>
                {Array.from({ length: rows }, (_, r) => (
                  <div key={r} className="flex items-stretch gap-0.5 mb-0.5">
                    <div className="w-4 flex-shrink-0 flex items-center justify-center text-[9px] font-bold text-gray-400">{r + 1}</div>
                    {Array.from({ length: cols }, (_, c) => {
                      const sec   = getSectionLabel(c, r)
                      const cell  = cellMap[sec] ?? []
                      const isOver = dragOver === sec
                      const isHighlighted = (search || filterCalibre || filterMedicado || filterTipo || filterSeccion)
                        && filteredProducts.some(p => p.seccion === sec)

                      return (
                        <div key={sec}
                          ref={el => { if (el) cellRefs.current.set(sec, el); else cellRefs.current.delete(sec) }}
                          className={`flex-1 aspect-square rounded-md transition-all relative overflow-hidden
                            ${isOver ? 'ring-2 ring-blue-400 scale-[1.04]' : ''}
                            ${isHighlighted ? 'ring-2 ring-yellow-400' : ''}
                            ${cell.length > 0 ? '' : 'bg-gray-50 border border-gray-100'}`}
                          onDragOver={dragEnabled ? e => { e.preventDefault(); setDragOver(sec) } : undefined}
                          onDragLeave={dragEnabled ? () => setDragOver(null) : undefined}
                          onDrop={dragEnabled ? () => onDropCell(sec) : undefined}
                        >
                          {cell.length === 0 ? (
                            <div className="w-full h-full flex items-center justify-center">
                              <span className="text-[7px] text-gray-300 font-mono">{sec}</span>
                            </div>
                          ) : (
                            /* Stack de niveles — columnas horizontales apiladas */
                            <div className="w-full h-full flex flex-col">
                              {cell.map((prod) => {
                                const col = getCalibreColor(prod.calibre)
                                return (
                                  <div key={prod.id}
                                    draggable={dragEnabled}
                                    onDragStart={dragEnabled ? () => onDragStart(prod.id) : undefined}
                                    onDragEnd={dragEnabled ? onDragEnd : undefined}
                                    onTouchStart={dragEnabled ? e => onTouchStart(e, prod.id) : undefined}
                                    className={`${col.bg} ${col.text} flex-1 flex items-center justify-center gap-px
                                      select-none transition-opacity active:opacity-70 min-h-0
                                      ${dragEnabled ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}
                                      ${prod.seccion_half ? 'opacity-75' : ''}`}
                                    style={{ minHeight: 0 }}
                                    title={`${prod.nombre} — ${sec}-${toRoman(prod.nivel)}`}
                                  >
                                    {/* Número romano del nivel */}
                                    <span className="text-[5px] font-black opacity-70 leading-none flex-shrink-0">
                                      {toRoman(prod.nivel)}
                                    </span>
                                    {/* Dot de calibre */}
                                    <span className="text-[5px] font-bold leading-none truncate">
                                      {prod.calibre}
                                    </span>
                                    {prod.medicado && (
                                      <span className="text-[5px] font-black leading-none opacity-80">✚</span>
                                    )}
                                  </div>
                                )
                              })}
                              {/* Slots vacíos en gris muy suave para mostrar capacidad */}
                              {cell.length < MAX_NIVELES && Array.from({ length: MAX_NIVELES - cell.length }, (_, i) => (
                                <div key={`empty-${i}`} className="flex-1 bg-gray-100 min-h-0" style={{ minHeight: 0 }} />
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* Leyenda calibres */}
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 px-1">
              {CALIBRES.map(c => {
                const col   = getCalibreColor(c)
                const count = products.filter(p => p.calibre === c).length
                if (count === 0) return null
                return (
                  <div key={c} className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: col.dot }} />
                    <span className="text-[10px] text-gray-500">{c}</span>
                  </div>
                )
              })}
              {isEmpty && <span className="text-[11px] text-gray-400 italic">Bodega vacía</span>}
              {!isEmpty && (
                <span className="text-[10px] text-gray-400 ml-auto">I–V = nivel de apilamiento</span>
              )}
            </div>
          </div>

          {/* ── Resultados filtrados ── */}
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
                          {p.seccion}-{toRoman(p.nivel)} · {p.cargo_type?.name ?? '—'}
                          {p.medicado && <span className="ml-1 text-amber-600 font-semibold">· Medicado</span>}
                          {p.fecha_venc && <span className="ml-1">· Vence {p.fecha_venc}</span>}
                        </p>
                      </div>
                      <div className="flex gap-1.5 flex-shrink-0">
                        <button onClick={() => openEdit(p)} className="w-7 h-7 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center active:opacity-60">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                        <button onClick={() => setShowDelete(p)} className="w-7 h-7 rounded-lg bg-red-50 text-red-400 flex items-center justify-center active:opacity-60">
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

          {/* ── CRUD Actions ── */}
          <div className="grid grid-cols-3 gap-2">
            <button onClick={openCreate}
              className="flex flex-col items-center gap-1.5 bg-blue-500 text-white rounded-2xl py-3.5 active:bg-blue-600 shadow-sm shadow-blue-200">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              <span className="text-[12px] font-semibold">Agregar</span>
            </button>
            <button onClick={() => products.length > 0 && openEdit(products[0])} disabled={isEmpty}
              className="flex flex-col items-center gap-1.5 bg-white text-gray-700 rounded-2xl py-3.5 active:bg-gray-50 card-shadow disabled:opacity-40">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              <span className="text-[12px] font-semibold">Editar</span>
            </button>
            <button onClick={() => products.length > 0 && setShowDelete(products[0])} disabled={isEmpty}
              className="flex flex-col items-center gap-1.5 bg-white text-red-400 rounded-2xl py-3.5 active:bg-gray-50 card-shadow disabled:opacity-40">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
              </svg>
              <span className="text-[12px] font-semibold">Eliminar</span>
            </button>
          </div>

          {/* ── Inventario completo ── */}
          {!search && !filterCalibre && !filterMedicado && !filterTipo && !filterSeccion && products.length > 0 && (
            <div className="bg-white rounded-2xl card-shadow overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100">
                <span className="text-[12px] font-bold text-gray-500 uppercase tracking-wider">Inventario ({products.length})</span>
              </div>
              <div className="divide-y divide-gray-50">
                {products.map(p => {
                  const col = getCalibreColor(p.calibre)
                  return (
                    <div key={p.id} className="px-4 py-3 flex items-center gap-3">
                      <div className="flex flex-col items-center flex-shrink-0 gap-0.5">
                        <span className={`w-8 h-8 rounded-xl ${col.bg} ${col.text} flex items-center justify-center text-[11px] font-bold`}>
                          {p.calibre}
                        </span>
                        <span className="text-[9px] font-bold text-blue-400">{p.seccion}-{toRoman(p.nivel)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-semibold text-gray-900 break-words min-w-0">{p.nombre}</p>
                        <p className="text-[11px] text-gray-400">
                          {p.cargo_type?.name ?? '—'}
                          {p.medicado && <span className="ml-1 text-amber-600 font-semibold">· Medicado</span>}
                        </p>
                      </div>
                      <div className="flex gap-1.5 flex-shrink-0">
                        <button onClick={() => openEdit(p)} className="w-7 h-7 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center active:opacity-60">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                        <button onClick={() => setShowDelete(p)} className="w-7 h-7 rounded-lg bg-red-50 text-red-400 flex items-center justify-center active:opacity-60">
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
          <div className="bg-white rounded-2xl card-shadow px-4 py-3 space-y-2">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input type="text" value={histSearch} onChange={e => setHistSearch(e.target.value)}
                placeholder="Buscar por producto o usuario…"
                className="w-full pl-8 pr-3 py-2.5 rounded-xl text-[14px] bg-gray-50 border border-transparent focus:border-blue-300 focus:bg-white outline-none transition-all" />
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
                className="flex-1 px-2.5 py-2 rounded-xl text-[13px] bg-gray-50 border border-transparent focus:border-blue-300 outline-none" />
            </div>
            <p className="text-[11px] text-gray-400">{filteredHistory.length} entrada{filteredHistory.length !== 1 ? 's' : ''}</p>
          </div>
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
                      <button onClick={() => setEditHistEntry({ ...h })} className="w-7 h-7 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center active:opacity-60">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                      <button onClick={() => setDeleteHistId(h)} className="w-7 h-7 rounded-lg bg-red-50 text-red-400 flex items-center justify-center active:opacity-60">
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
          <div className="bg-white rounded-2xl card-shadow overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <span className="text-[13px] font-bold text-gray-700">Dimensiones de la bodega</span>
            </div>
            <div className="px-4 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-0.5 block mb-1">Columnas</label>
                  <input type="number" min="1" max="20" value={cfgCols} onChange={e => setCfgCols(e.target.value)} className={fieldCls} />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-0.5 block mb-1">Filas</label>
                  <input type="number" min="1" max="20" value={cfgRows} onChange={e => setCfgRows(e.target.value)} className={fieldCls} />
                </div>
              </div>
              <button onClick={handleSaveConfig} disabled={cfgSaving}
                className="w-full py-3 bg-blue-500 text-white text-[14px] font-semibold rounded-xl active:bg-blue-600 disabled:opacity-50">
                {cfgSaving ? 'Guardando…' : 'Guardar dimensiones'}
              </button>
            </div>
          </div>
          <div className="bg-white rounded-2xl card-shadow overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <span className="text-[13px] font-bold text-gray-700">Tipos de carga</span>
            </div>
            <div className="divide-y divide-gray-50">
              {cargoTypes.map(ct => (
                <div key={ct.id} className="px-4 py-3">
                  {editingCargo?.id === ct.id ? (
                    <div className="space-y-2">
                      <input type="text" value={editingCargo.name} onChange={e => setEditingCargo({ ...editingCargo, name: e.target.value })} className={fieldCls} placeholder="Nombre" />
                      <div className="flex gap-2 items-center">
                        <input type="number" step="0.5" min="0.5" value={editingCargo.slots_used}
                          onChange={e => setEditingCargo({ ...editingCargo, slots_used: parseFloat(e.target.value) || 1 })}
                          className={`${fieldCls} flex-1`} placeholder="Casillas" />
                        <span className="text-[12px] text-gray-400 whitespace-nowrap">casillas</span>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={handleUpdateCargo} className="flex-1 py-2.5 bg-blue-500 text-white text-[13px] font-semibold rounded-xl active:bg-blue-600">Guardar</button>
                        <button onClick={() => setEditingCargo(null)} className="px-4 py-2.5 bg-gray-100 text-gray-600 text-[13px] rounded-xl">✕</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-semibold text-gray-900">{ct.name}</p>
                        <p className="text-[11px] text-gray-400">{ct.slots_used} casilla{ct.slots_used !== 1 ? 's' : ''}</p>
                      </div>
                      <div className="flex gap-1.5">
                        <button onClick={() => setEditingCargo({ ...ct })} className="w-7 h-7 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center active:opacity-60">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                        <button onClick={() => handleDeleteCargo(ct.id)} className="w-7 h-7 rounded-lg bg-red-50 text-red-400 flex items-center justify-center active:opacity-60">
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
              <input type="text" value={newCargoName} onChange={e => setNewCargoName(e.target.value)} placeholder="Nombre del tipo…" className={fieldCls} />
              <div className="flex gap-2 items-center">
                <input type="number" step="0.5" min="0.5" value={newCargoSlots} onChange={e => setNewCargoSlots(e.target.value)} className={`${fieldCls} flex-1`} placeholder="Casillas" />
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

      {(showCreate || showEdit) && (
        <ProductSheet
          title={showEdit ? 'Editar producto' : 'Agregar producto'}
          form={form} setF={setF} formErr={formErr}
          cargoTypes={cargoTypes} saving={saving}
          cols={cols} rows={rows}
          cellMap={cellMap}
          editingId={showEdit?.id}
          onSave={showEdit ? handleEdit : handleCreate}
          onClose={() => { setShowCreate(false); setShowEdit(null) }}
          fieldCls={fieldCls}
        />
      )}

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
                ¿Eliminar <strong>{showDelete.nombre}</strong> de {showDelete.seccion}-{toRoman(showDelete.nivel)}?
              </p>
            </div>
            <div className="flex gap-3 pb-2">
              <button onClick={() => setShowDelete(null)} className="flex-1 py-3.5 rounded-2xl bg-gray-100 text-gray-700 font-semibold text-[15px]">Cancelar</button>
              <button onClick={handleDelete} disabled={saving} className="flex-1 py-3.5 rounded-2xl bg-red-500 text-white font-semibold text-[15px] disabled:opacity-35">
                {saving ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drag level picker */}
      {dragLevelPicker && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40">
          <div className="animate-slide-up bg-white rounded-t-3xl w-full max-w-lg mx-auto px-5 pt-4 pb-safe space-y-4">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto" />
            <div className="text-center">
              <h3 className="text-[17px] font-bold text-gray-900">¿En qué nivel?</h3>
              <p className="text-[13px] text-gray-400 mt-1">
                Sección <strong className="text-blue-500">{dragLevelPicker.targetSeccion}</strong> — elige el nivel de apilamiento
              </p>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {[1,2,3,4,5].map(n => {
                const isFree = dragLevelPicker.freeNiveles.includes(n)
                return (
                  <button key={n}
                    onClick={() => isFree && handleDragLevelPick(n)}
                    disabled={!isFree}
                    className={`py-4 rounded-2xl flex flex-col items-center gap-1 transition-all
                      ${isFree
                        ? 'bg-blue-500 text-white active:bg-blue-600 active:scale-95'
                        : 'bg-gray-100 text-gray-300 cursor-not-allowed'}`}>
                    <span className="text-[18px] font-black">{toRoman(n)}</span>
                    <span className="text-[9px] font-semibold opacity-70">{isFree ? 'Libre' : 'Ocupado'}</span>
                  </button>
                )
              })}
            </div>
            <button onClick={() => setDragLevelPicker(null)}
              className="w-full py-3 rounded-2xl bg-gray-100 text-gray-600 text-[14px] font-semibold active:bg-gray-200">
              Cancelar
            </button>
          </div>
        </div>
      )}

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
              <button onClick={() => setEditHistEntry(null)} className="flex-1 py-3.5 rounded-2xl bg-gray-100 text-gray-700 font-semibold text-[15px]">Cancelar</button>
              <button onClick={handleUpdateHistEntry} className="flex-1 py-3.5 rounded-2xl bg-blue-500 text-white font-semibold text-[15px]">Guardar</button>
            </div>
          </div>
        </div>
      )}

      {deleteHistEntry && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40">
          <div className="animate-slide-up bg-white rounded-t-3xl w-full max-w-lg mx-auto px-5 pt-4 pb-safe space-y-4">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto" />
            <div className="text-center space-y-1">
              <h3 className="text-[18px] font-bold text-gray-900">Eliminar entrada</h3>
              <p className="text-[13px] text-gray-500">Se eliminará permanentemente del historial.</p>
            </div>
            <div className="flex gap-3 pb-2">
              <button onClick={() => setDeleteHistId(null)} className="flex-1 py-3.5 rounded-2xl bg-gray-100 text-gray-700 font-semibold text-[15px]">Cancelar</button>
              <button onClick={handleDeleteHistEntry} className="flex-1 py-3.5 rounded-2xl bg-red-500 text-white font-semibold text-[15px]">Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   GridBorderMobile — borde con contorno y etiquetas S azules
   El contenedor padre tiene padding: 8px top, 12px right, 14px bottom, 8px left
   Las S se posicionan en ese margen
══════════════════════════════════════════════════════════════ */
function GridBorderMobile({ cols, rows }: { cols: number; rows: number }) {
  return (
    <div className="absolute inset-0 pointer-events-none" aria-hidden>
      {/* Borde redondeado con cortes para puertas en esquina inferior-derecha */}
      <svg width="100%" height="100%" className="absolute inset-0 overflow-visible" style={{ zIndex: 0 }}>
        <defs>
          <style>{`
            .gb { fill:none; stroke:#93c5fd; stroke-width:1.5; }
          `}</style>
        </defs>
        {/* top */}
        <line className="gb" x1="10" y1="4" x2="calc(100% - 4px)" y2="4" />
        {/* right — hasta 60%, corte, 80%–100% */}
        <line className="gb" x1="calc(100% - 4px)" y1="4" x2="calc(100% - 4px)" y2="58%" />
        <line className="gb" x1="calc(100% - 4px)" y1="80%" x2="calc(100% - 4px)" y2="calc(100% - 4px)" />
        {/* bottom — 0–55%, corte, 75%–100% */}
        <line className="gb" x1="10" y1="calc(100% - 4px)" x2="54%" y2="calc(100% - 4px)" />
        <line className="gb" x1="74%" y1="calc(100% - 4px)" x2="calc(100% - 4px)" y2="calc(100% - 4px)" />
        {/* left */}
        <line className="gb" x1="4" y1="10" x2="4" y2="calc(100% - 4px)" />
        {/* corners */}
        <path className="gb" d="M 4 10 Q 4 4 10 4" />
        <path className="gb" d="M 4 calc(100% - 10px) Q 4 calc(100% - 4px) 10 calc(100% - 4px)" />
      </svg>

      {/* S lateral derecha — en el gap del borde lateral (entre 58% y 80%) */}
      <div className="absolute sm:hidden flex items-center justify-center"
        style={{ right: 0, top: '64%', width: 12, height: 14, transform: 'translateY(-50%)' }}>
        <span style={{
          fontSize: '9px', fontWeight: 900, color: '#3b82f6',
          writingMode: 'vertical-rl', textOrientation: 'mixed',
          transform: 'rotate(180deg)', lineHeight: 1,
        }}>S</span>
      </div>

      {/* S inferior — en el gap del borde inferior (entre 54% y 74%) */}
      <div className="absolute sm:hidden flex items-center justify-center"
        style={{ bottom: 0, left: '60%', width: 14, height: 14, transform: 'translateX(-50%)' }}>
        <span style={{ fontSize: '9px', fontWeight: 900, color: '#3b82f6', lineHeight: 1 }}>S</span>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   ProductSheet — crear/editar con selector de nivel
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
  cellMap:    Record<string, BodegaProduct[]>
  editingId?: string
  onSave:     () => void
  onClose:    () => void
  fieldCls:   string
}

function ProductSheet({ title, form, setF, formErr, cargoTypes, saving, cols, rows, cellMap, editingId, onSave, onClose, fieldCls }: ProductSheetProps) {
  const [pickingSection, setPickingSection] = useState(false)

  // Niveles ocupados en la sección seleccionada (excluyendo el producto que se está editando)
  const ocupados = form.seccion
    ? (cellMap[form.seccion] ?? []).filter(p => p.id !== editingId).map(p => p.nivel)
    : []
  const libres = [1,2,3,4,5].filter(n => !ocupados.includes(n))

  // Si el nivel actual no está disponible al cambiar de sección, ajustar al primero libre
  useEffect(() => {
    if (form.seccion && !libres.includes(form.nivel) && libres.length > 0) {
      setF('nivel', libres[0])
    }
  }, [form.seccion])

  return (
    <div className="fixed inset-0 z-50 bg-[#F2F2F7] flex flex-col animate-slide-up overflow-y-auto">
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
          <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-[13px] text-red-700 font-medium">{formErr}</div>
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
                const col    = getCalibreColor(c)
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
            <button type="button" onClick={() => setF('medicado', !form.medicado)}
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
            <button type="button" onClick={() => setF('seccion_half', !form.seccion_half)}
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

          {/* Sección picker */}
          <div>
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-0.5 block mb-1">Sección *</label>
            {!pickingSection ? (
              <button type="button" onClick={() => setPickingSection(true)}
                className={`w-full px-3.5 py-3 rounded-xl text-[14px] border text-left transition-all
                  ${form.seccion ? 'bg-blue-50 border-blue-200 text-blue-700 font-semibold' : 'bg-white border-gray-200 text-gray-400'}`}>
                {form.seccion
                  ? `${form.seccion} — Nivel ${toRoman(form.nivel)}`
                  : 'Toca para seleccionar en la cuadrícula…'}
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-[12px] text-blue-600 font-medium">Toca la sección deseada:</p>
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
                      const sec  = getSectionLabel(c, r)
                      const sel  = form.seccion === sec
                      const cnt  = (cellMap[sec] ?? []).filter(p => p.id !== editingId).length
                      const full = cnt >= MAX_NIVELES
                      return (
                        <button key={sec} type="button"
                          onClick={() => { if (!full) { setF('seccion', sec); setPickingSection(false) } }}
                          disabled={full}
                          className={`flex-1 aspect-square rounded text-[8px] font-bold transition-all relative
                            ${sel ? 'bg-blue-500 text-white' : full ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-gray-100 text-gray-500 active:bg-blue-100'}`}>
                          {sec}
                          {cnt > 0 && !full && (
                            <span className="absolute bottom-0 right-0 text-[6px] font-black text-blue-400 leading-none pr-px">{cnt}</span>
                          )}
                          {full && (
                            <span className="absolute bottom-0 right-0 text-[6px] font-black text-gray-400 leading-none pr-px">✕</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                ))}
                <button type="button" onClick={() => setPickingSection(false)} className="text-[12px] text-gray-400 mt-1">
                  Cancelar selección
                </button>
              </div>
            )}
          </div>

          {/* Selector de nivel — solo cuando hay sección elegida */}
          {form.seccion && (
            <div>
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-0.5 block mb-2">
                Nivel de apilamiento *
              </label>
              <div className="grid grid-cols-5 gap-1.5">
                {[1,2,3,4,5].map(n => {
                  const isFree = libres.includes(n)
                  const isSel  = form.nivel === n
                  return (
                    <button key={n} type="button"
                      onClick={() => isFree && setF('nivel', n)}
                      disabled={!isFree}
                      className={`py-3 rounded-xl flex flex-col items-center gap-0.5 transition-all text-center
                        ${isSel && isFree ? 'bg-blue-500 text-white shadow-sm shadow-blue-200'
                          : isFree ? 'bg-gray-100 text-gray-600 active:bg-blue-50'
                          : 'bg-gray-100 text-gray-300 cursor-not-allowed'}`}>
                      <span className="text-[15px] font-black leading-none">{toRoman(n)}</span>
                      <span className="text-[8px] font-semibold opacity-70">{isFree ? 'Libre' : 'Ocupado'}</span>
                    </button>
                  )
                })}
              </div>
              <p className="text-[11px] text-gray-400 mt-1.5">
                Sección <span className="font-semibold text-blue-500">{form.seccion}</span> — {ocupados.length} de 5 niveles ocupados
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}