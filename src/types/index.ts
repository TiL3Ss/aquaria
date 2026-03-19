// src/index.ts

export type Shift = 'noche' | 'dia' | 'tarde'

export type WellLevel = 'alto' | 'rebase'

export type FeedingType = 'manual' | 'automatica'

export interface Profile {
  id: string
  rut: string
  full_name: string
  email: string
  role: string
  created_at: string
}

export interface Module {
  id: string
  name: string
  slug: string
  active: boolean
}

export interface Log {
  id: string
  user_id: string
  module_id: string
  log_date: string
  shift: Shift
  operator_name: string
  notes: string | null
  created_at: string
  updated_at: string
  // joined
  profiles?: Profile
  modules?: Module
}

export interface LogParameters {
  id: string
  log_id: string
  pump_main_bar: number | null
  pump_biofilter_bar: number | null
  flowmeter_lpm: number | null
  buffer_tank_bar: number | null
  water_intake: number | null
  well_level: WellLevel | null
  intake_value: number | null
  chemical_b_kg: number | null
  chemical_cc: number | null
  bicarbonate_kg: number | null
  chloride_kg: number | null
  metabisulfite: number | null
  feeding_type: FeedingType | null
  feeding_amount: number | null
  ozone_pct: number | null
}

export interface ChecklistResponse {
  id: string
  log_id: string
  item_key: string
  checked: boolean
}

export interface Fisicoquimico {
  id: string
  log_id: string
  identifier: string
  time_slot: '00:00' | '04:00'
  o2_saturation: number | null
  dissolved_o2: number | null
  temperature: number | null
  ph: number | null
  orp: number | null
  salinity: number | null
}

export interface LogFull {
  log: Log
  parameters: LogParameters | null
  checklist: ChecklistResponse[]
  fisicoquimicos: Fisicoquimico[]
}

export const MODULES = ['HAT', 'FF', 'FRY1', 'FRY2', 'TERRAZA', 'Ongrowing'] as const
export type ModuleName = typeof MODULES[number]

export const SHIFT_LABELS: Record<Shift, string> = {
  noche: 'Noche',
  dia: 'Día',
  tarde: 'Tarde',
}

export const SHIFT_TIMES: Record<Shift, string> = {
  noche: '20:00 – 08:00',
  dia: '08:00 – 16:00',
  tarde: '16:00 – 20:00',
}

export const CHECKLIST_ITEMS = {
  generales: [
    { key: 'recepcion_turno',   label: 'Recepción de turno' },
    { key: 'toma_parametros',   label: 'Toma de parámetros' },
    { key: 'checklist_general', label: 'Check-list general' },
  ],
  mantenimiento: [
    { key: 'lavado_salas',       label: 'Lavado de salas' },
    { key: 'limpieza_tanques',   label: 'Limpieza de tanques' },
    { key: 'manejo_mortalidad',  label: 'Manejo de mortalidad' },
    { key: 'limpieza_filtros',   label: 'Limpieza de filtros' },
    { key: 'desinfeccion',       label: 'Desinfección' },
  ],
  equipos: [
    { key: 'uv_funcionando',        label: 'UV funcionando' },
    { key: 'chiller_operativo',     label: 'Chiller operativo' },
    { key: 'bomba_intercambiadora', label: 'Bomba intercambiadora' },
    { key: 'osmosis_funcionando',   label: 'Osmosis funcionando' },
  ],
} as const

export const FQ_IDENTIFIERS = [
  'C1','C2','C3','C4','C5','C6','C7','C8','C9','C10',
  'TK1','TK2','TK3','TK4','TK5',
] as const