// src/app/dashboard/DashboardClient.tsx

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { Shift, Profile } from '@/types'
import { SHIFT_LABELS, SHIFT_TIMES } from '@/types'
import { logout } from '@/app/auth/actions'
import { getLogsForMonth } from './actions'

const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]
const MONTHS_SHORT = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC']
const WEEK_DAYS    = ['L','M','X','J','V','S','D']

interface ShiftStyle {
  headerBg: string; dotBg: string; labelColor: string; emptyDot: string
}
const SHIFT_STYLE: Record<Shift, ShiftStyle> = {
  noche: { headerBg:'bg-indigo-50', dotBg:'bg-indigo-400', labelColor:'text-indigo-700', emptyDot:'bg-indigo-200' },
  dia:   { headerBg:'bg-amber-50',  dotBg:'bg-amber-400',  labelColor:'text-amber-700',  emptyDot:'bg-amber-200'  },
  tarde: { headerBg:'bg-orange-50', dotBg:'bg-orange-400', labelColor:'text-orange-700', emptyDot:'bg-orange-200' },
}

interface DbModule { id: string; name: string; slug: string }
interface Props     { profile: Profile; dbModules: DbModule[] }

export default function DashboardClient({ profile, dbModules }: Props) {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const today        = new Date()

  /* ── Restore state from URL params (back navigation from bitácora) ── */
  const backDate   = searchParams.get('date')    // e.g. "2025-03-15"
  const backModule = searchParams.get('module')  // e.g. "hat"

  const initialModule = backModule
    ? (dbModules.find(m => m.slug === backModule) ?? dbModules[0])
    : (dbModules[0] ?? { id:'', name:'HAT', slug:'hat' })

  const initialDay = backDate
    ? parseInt(backDate.split('-')[2], 10)
    : null

  const initialYear = backDate
    ? parseInt(backDate.split('-')[0], 10)
    : today.getFullYear()

  const initialMonth = backDate
    ? parseInt(backDate.split('-')[1], 10) - 1   // 0-indexed
    : today.getMonth()

  const [selectedModule, setSelectedModule] = useState<DbModule>(initialModule)
  const [year,           setYear]           = useState(initialYear)
  const [month,          setMonth]          = useState(initialMonth)
  const [selectedDay,    setSelectedDay]    = useState<number | null>(initialDay)
  const [logsMap,        setLogsMap]        = useState<Record<string, Record<Shift, boolean>>>({})
  const [loadingLogs,    setLoadingLogs]    = useState(false)
  const [clock,          setClock]          = useState('')
  const [drawerOpen,     setDrawerOpen]     = useState(false)

  /* ── Clock ─── */
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('es-CL', { hour:'2-digit', minute:'2-digit' }))
    tick()
    const id = setInterval(tick, 30_000)
    return () => clearInterval(id)
  }, [])

  /* ── Load logs map ─── */
  const loadLogs = useCallback(() => {
    setLoadingLogs(true)
    getLogsForMonth(selectedModule.slug, year, month + 1)
      .then(setLogsMap)
      .finally(() => setLoadingLogs(false))
  }, [selectedModule, year, month])

  useEffect(() => { loadLogs() }, [loadLogs])

  /* ── Calendar helpers ─── */
  const daysInMonth    = new Date(year, month + 1, 0).getDate()
  const firstDayOffset = (new Date(year, month, 1).getDay() + 6) % 7
  const todayStr       = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`

  function dateStr(day: number) {
    return `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
  }

  function openLog(shift: Shift, mode: 'view' | 'create') {
    const ds = dateStr(selectedDay!)
    // Incluye date y module en la URL para poder restaurar estado al volver
    router.push(`/bitacora?module=${selectedModule.slug}&date=${ds}&shift=${shift}&mode=${mode}`)
  }

  function selectModule(mod: DbModule) {
    setSelectedModule(mod)
    setSelectedDay(null)
    setDrawerOpen(false)
  }

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else             { setMonth(m => m - 1) }
    setSelectedDay(null)
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else              { setMonth(m => m + 1) }
    setSelectedDay(null)
  }

  const initials = profile.full_name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase()

  /* ── Render ─── */
  return (
    <div className="min-h-dvh bg-[#F2F2F7] flex flex-col select-none">

      {/* ══ TOPBAR ══ */}
      <header className="topbar-blur border-b border-black/[0.06] px-4 h-14 flex items-center justify-between sticky top-0 z-30 pt-safe">
        <button onClick={() => setDrawerOpen(true)}
          className="flex items-center gap-2.5 active:opacity-60 transition-opacity">
          <div className="w-8 h-8 bg-blue-500 rounded-[10px] flex items-center justify-center shadow-sm">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
              <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/>
            </svg>
          </div>
          <div className="text-left leading-tight">
            <div className="text-[14px] font-semibold text-gray-900">{selectedModule.name}</div>
            <div className="text-[11px] text-gray-400 tabular-nums">{clock}</div>
          </div>
        </button>

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-[12px] font-bold">
            {initials}
          </div>
          <form action={logout}>
            <button type="submit" className="text-[13px] text-gray-400 font-medium px-1 py-1 active:text-gray-700 transition-colors">
              Salir
            </button>
          </form>
        </div>
      </header>

      {/* ══ SIDEBAR DRAWER ══ */}
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
              {dbModules.map(mod => {
                const active = selectedModule.id === mod.id
                return (
                  <button key={mod.id} onClick={() => selectModule(mod)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl mb-0.5 transition-all active:scale-[0.98]
                      ${active ? 'bg-blue-50' : 'active:bg-gray-100'}`}>
                    <span className={`w-8 h-8 rounded-[10px] flex items-center justify-center text-[10px] font-bold tracking-wide flex-shrink-0
                      ${active ? 'bg-blue-500 text-white shadow-sm shadow-blue-300' : 'bg-gray-100 text-gray-500'}`}>
                      {mod.slug.slice(0,3).toUpperCase()}
                    </span>
                    <span className={`text-[15px] font-medium ${active ? 'text-blue-600 font-semibold' : 'text-gray-700'}`}>
                      {mod.name}
                    </span>
                    {active && (
                      <span className="ml-auto w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center">
                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                          <polyline points="2,6 5,9 10,3" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </span>
                    )}
                  </button>
                )
              })}
            </nav>
            <div className="px-4 py-4 border-t border-gray-100 pb-safe">
              <form action={logout}>
                <button type="submit" className="w-full py-3 rounded-2xl bg-gray-100 text-gray-600 text-[14px] font-semibold active:bg-gray-200 transition-colors">
                  Cerrar sesión
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ══ MAIN CONTENT ══ */}
      <main className="flex-1 px-4 py-4 space-y-3 max-w-lg mx-auto w-full pb-safe">

        {selectedDay === null ? (
          /* ── CALENDAR VIEW ─── */
          <div className="animate-fade-in space-y-3">
            <div className="bg-white rounded-3xl card-shadow overflow-hidden">
              <div className="px-5 pt-4 pb-3 flex items-center justify-between">
                <div>
                  <div className="text-[22px] font-bold text-gray-900 leading-tight">{MONTHS[month]}</div>
                  <div className="text-[14px] text-gray-400 font-medium">{year}</div>
                </div>
                <div className="flex items-center gap-1">
                  {loadingLogs && (
                    <div className="w-4 h-4 rounded-full border-2 border-gray-200 border-t-blue-500 animate-spin mr-2" />
                  )}
                  <button onClick={prevMonth}
                    className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center active:bg-gray-200 transition-colors">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
                  </button>
                  <button onClick={nextMonth}
                    className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center active:bg-gray-200 transition-colors">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                  </button>
                </div>
              </div>

              <div className="flex gap-1.5 overflow-x-auto scrollbar-none px-4 pb-3">
                {MONTHS_SHORT.map((m, i) => (
                  <button key={m} onClick={() => { setMonth(i); setSelectedDay(null) }}
                    className={`flex-shrink-0 px-3.5 py-1.5 rounded-xl text-[11px] font-bold tracking-wide transition-all active:scale-95
                      ${month === i ? 'bg-blue-500 text-white shadow-sm shadow-blue-200' : 'bg-gray-100 text-gray-500'}`}>
                    {m}
                  </button>
                ))}
              </div>

              <div className="h-px bg-gray-100 mx-4" />

              <div className="grid grid-cols-7 px-3 pt-3 pb-1">
                {WEEK_DAYS.map((d, i) => (
                  <div key={i} className="text-center text-[11px] font-semibold text-gray-400">{d}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-y-0.5 px-3 pb-4">
                {Array.from({ length: firstDayOffset }).map((_, i) => <div key={`gap-${i}`} />)}
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                  const ds       = dateStr(day)
                  const dayLogs  = logsMap[ds]
                  const isToday  = ds === todayStr
                  const logCount = dayLogs ? Object.values(dayLogs).filter(Boolean).length : 0
                  const shifts   = dayLogs ? (['noche','dia','tarde'] as Shift[]).filter(s => dayLogs[s]) : []

                  return (
                    <button key={day} onClick={() => setSelectedDay(day)}
                      className={`relative flex flex-col items-center justify-center rounded-2xl py-1 transition-all active:scale-90
                        ${isToday ? 'bg-blue-500' : 'active:bg-gray-100'}`}>
                      <span className={`text-[15px] font-semibold tabular-nums leading-tight
                        ${isToday ? 'text-white' : 'text-gray-800'}`}>{day}</span>
                      <div className="flex gap-0.5 h-2 items-center mt-0.5">
                        {logCount > 0
                          ? shifts.map(s => (
                              <span key={s} className={`w-1.5 h-1.5 rounded-full ${isToday ? 'bg-white/80' : SHIFT_STYLE[s].dotBg}`} />
                            ))
                          : <span className="w-1.5 h-1.5 rounded-full opacity-0" />
                        }
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex items-center justify-between bg-white rounded-2xl card-shadow px-5 py-3">
              <span className="text-[13px] font-semibold text-gray-500">Año</span>
              <div className="flex items-center gap-3">
                <button onClick={() => { setYear(y => Math.max(2020, y - 1)); setSelectedDay(null) }}
                  className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center active:bg-gray-200 transition-colors">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <span className="text-[17px] font-bold text-gray-900 tabular-nums w-10 text-center">{year}</span>
                <button onClick={() => { setYear(y => Math.min(today.getFullYear() + 1, y + 1)); setSelectedDay(null) }}
                  className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center active:bg-gray-200 transition-colors">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-center gap-4 py-1">
              {(['noche','dia','tarde'] as Shift[]).map(s => (
                <div key={s} className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${SHIFT_STYLE[s].dotBg}`} />
                  <span className="text-[11px] text-gray-400 font-medium">{SHIFT_LABELS[s]}</span>
                </div>
              ))}
            </div>
          </div>

        ) : (
          /* ── SHIFTS VIEW ─── */
          <div className="animate-fade-in space-y-3">
            <div className="flex items-center gap-2.5">
              <button onClick={() => setSelectedDay(null)}
                className="flex items-center gap-1 text-blue-500 text-[15px] font-medium active:opacity-60 transition-opacity">
                <svg width="8" height="13" viewBox="0 0 8 13" fill="none">
                  <path d="M7 1L1 6.5L7 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {MONTHS_SHORT[month]}
              </button>
              <span className="text-gray-300">|</span>
              <h2 className="text-[17px] font-bold text-gray-900">
                {selectedDay} de {MONTHS[month]} <span className="text-gray-400 font-medium">{year}</span>
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[12px] font-semibold bg-blue-50 text-blue-600 px-3 py-1.5 rounded-full">
                {selectedModule.name}
              </span>
            </div>

            {(['noche','dia','tarde'] as Shift[]).map((shift, idx) => {
              const ds     = dateStr(selectedDay)
              const exists = logsMap[ds]?.[shift] ?? false
              const style  = SHIFT_STYLE[shift]

              return (
                <div key={shift}
                  className={`animate-fade-in bg-white rounded-2xl card-shadow overflow-hidden stagger-${idx + 1}`}>
                  <div className={`${style.headerBg} px-4 py-2.5 flex items-center justify-between`}>
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${style.dotBg}`} />
                      <span className={`text-[13px] font-bold ${style.labelColor}`}>Turno {SHIFT_LABELS[shift]}</span>
                    </div>
                    <span className="text-[11px] text-gray-400 font-medium tabular-nums">{SHIFT_TIMES[shift]}</span>
                  </div>

                  <div className="px-4 py-3.5 flex items-center justify-between gap-3">
                    {exists ? (
                      <>
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                              <polyline points="3,8 6,11 13,4" stroke="#16a34a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </div>
                          <div className="min-w-0">
                            <div className="text-[14px] font-semibold text-gray-900">Registrada</div>
                            <div className="text-[12px] text-gray-400 truncate">Toca el ojo para ver el detalle</div>
                          </div>
                        </div>
                        <button onClick={() => openLog(shift, 'view')}
                          className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 active:bg-gray-200 transition-colors">
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                            <circle cx="12" cy="12" r="3"/>
                          </svg>
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${style.emptyDot} opacity-60`}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                              <line x1="12" y1="5" x2="12" y2="19"/>
                              <line x1="5"  y1="12" x2="19" y2="12"/>
                            </svg>
                          </div>
                          <div>
                            <div className="text-[14px] font-medium text-gray-500">Sin registro</div>
                            <div className="text-[12px] text-gray-300">Toca + para agregar</div>
                          </div>
                        </div>
                        <button onClick={() => openLog(shift, 'create')}
                          className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0 shadow-md shadow-blue-200 active:scale-90 transition-transform">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                            <line x1="12" y1="5" x2="12" y2="19"/>
                            <line x1="5"  y1="12" x2="19" y2="12"/>
                          </svg>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}