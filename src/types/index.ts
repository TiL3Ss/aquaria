// src/types/index.ts

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
  additional_operators: string | null
  notes: string | null
  created_at: string
  updated_at: string
  profiles?: Profile
  modules?: Module
}

export interface LogParameters {
  id: string
  log_id: string
  // HAT
  pump_main_bar: number | null
  pump_biofilter_bar: number | null
  flowmeter_lpm: number | null
  flowmeter_room_lpm: number | null
  buffer_tank_bar: number | null
  water_intake: number | null
  // FF
  ozone_pct: number | null
  intake_value: number | null
  osmosis_value: number | null
  temperature_ff: number | null
  ph_ff: number | null
  salinity_ff: number | null
  orp_ff: number | null
  // Químicos (ambos)
  bicarbonate_kg: number | null
  chloride_kg: number | null
  // Legacy (mantener compatibilidad)
  well_level: WellLevel | null
  chemical_b_kg: number | null
  chemical_cc: number | null
  metabisulfite: number | null
  feeding_type: FeedingType | null
  feeding_amount: number | null
}

export interface ChecklistResponse {
  id: string
  log_id: string
  item_key: string
  checked: boolean
}

// Tarea personalizada global (guardada en Supabase, tabla checklist_custom_tasks)
export interface CustomChecklistTask {
  id: string
  key: string
  label: string
  created_at: string
}

export interface Fisicoquimico {
  id: string
  log_id: string
  identifier: string
  time_slot: string   // e.g. '00:00' | '04:00' | '08:00' | '12:00' | '14:00' | '20:00'
  o2_saturation: number | null
  dissolved_o2: number | null
  temperature: number | null
  ph: number | null
  orp: number | null
  salinity: number | null
}

// Parámetros de Pozo (solo HAT)
export interface PozoReading {
  id: string
  log_id: string
  time_slot: string
  temperature: number | null
  o2_saturation: number | null
  dissolved_o2: number | null
}

export interface LogFull {
  log: Log
  parameters: LogParameters | null
  checklist: ChecklistResponse[]
  fisicoquimicos: Fisicoquimico[]
  pozo?: PozoReading[]
}

/* ── Module constants ──────────────────────────────── */
export const MODULES = ['HAT', 'FF', 'FRY1', 'FRY2', 'TERRAZA', 'Ongrowing'] as const
export type ModuleName = typeof MODULES[number]

/* ── Shift labels & times ──────────────────────────── */
export const SHIFT_LABELS: Record<Shift, string> = {
  noche: 'Noche',
  dia:   'Día',
  tarde: 'Tarde',
}

export const SHIFT_TIMES: Record<Shift, string> = {
  noche: '23:30 – 10:30',
  dia:   '08:00 – 19:00',
  tarde: '13:30 – 23:30',
}

// Slots horarios por turno para fisicoquímicos
export const SHIFT_SLOTS: Record<Shift, [string, string]> = {
  noche: ['00:00', '04:00'],
  dia:   ['08:00', '12:00'],
  tarde: ['14:00', '20:00'],
}

/* ── FQ identifiers por módulo ─────────────────────── */
export const FQ_IDENTIFIERS_HAT = [
  'C1','C2','C3','C4','C5','C6','C7','C8','C9','C10',
] as const

export const FQ_IDENTIFIERS_FF = [
  'TK1','TK2','TK3','TK4','TK5','TK6',
] as const

// Legacy (mantiene compatibilidad con código existente)
export const FQ_IDENTIFIERS = [
  ...FQ_IDENTIFIERS_HAT,
  ...FQ_IDENTIFIERS_FF,
] as const

/* ── Checklist base (común a todos los módulos) ────── */
export const CHECKLIST_ITEMS = {
  generales: [
    { key: 'recepcion_turno',   label: 'Recepción de turno'  },
    { key: 'toma_parametros',   label: 'Toma de parámetros'  },
    { key: 'checklist_general', label: 'Check-list general'  },
  ],
  mantenimiento: [
    { key: 'lavado_salas',      label: 'Lavado de salas'      },
    { key: 'limpieza_tanques',  label: 'Limpieza de tanques'  },
    { key: 'manejo_mortalidad', label: 'Manejo de mortalidad' },
    { key: 'limpieza_filtros',  label: 'Limpieza de filtros'  },
    { key: 'desinfeccion',      label: 'Desinfección'         },
  ],
  equipos: [
    { key: 'uv_funcionando',        label: 'UV funcionando'         },
    { key: 'chiller_operativo',     label: 'Chiller operativo'      },
    { key: 'bomba_intercambiadora', label: 'Bomba intercambiadora'  },
    { key: 'osmosis_funcionando',   label: 'Osmosis funcionando'    },
  ],
} as const