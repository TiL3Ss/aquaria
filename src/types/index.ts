// src/types/index.ts

export type Shift = 'noche' | 'dia' | 'tarde'
export type WellLevel = 'alto' | 'rebase'
export type FeedingType = 'manual' | 'automatica'
export type FishBehavior = 'activo' | 'letargico' | 'revisar'
export type FeedLoss     = 'si' | 'no' | 'ayuno'
export type BlowerActive = '1' | '2' | 'ambos'
export type WaterLevel   = 'bajo' | 'medio' | 'alto'

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
  osmosis_value: string | null
  temperature_ff: number | null
  ph_ff: number | null
  salinity_ff: number | null
  orp_ff: number | null
  pozo_intake_m3h?: number | null
  // Químicos (ambos)
  bicarbonate_kg: number | null
  chloride_kg: number | null
  // Legacy
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
  time_slot: string
  o2_saturation: number | null
  dissolved_o2: number | null
  temperature: number | null
  ph: number | null
  orp: number | null
  salinity: number | null
}

export interface PozoReading {
  id: string
  log_id: string
  time_slot: string
  temperature: number | null
  o2_saturation: number | null
  dissolved_o2: number | null
}

// Alimentación FF

export type SobranteVariant = 'balde' | 'balde_tolva'
export type DietaVariant    = '1_calibre' | '2_calibres'

export const FF_TK_IDS = ['TK1','TK2','TK3','TK4','TK5','TK6'] as const
export type FfTkId = typeof FF_TK_IDS[number]

export interface FfFeedingPlan {
  id:               string
  log_id:           string
  sobrante_variant: SobranteVariant
  dieta_variant:    DietaVariant
  calibre_1:        string | null
  calibre_2:        string | null
  calibre_1_pct:    number | null
  calibre_2_pct:    number | null
  created_at:       string
  updated_at:       string
}

export interface FfFeedingPlanRow {
  id:                 string
  plan_id:            string
  tk_id:              FfTkId
  sobrante_balde_kg:  number | null
  sobrante_tolva_kg:  number | null
  dieta_tolva_kg:     number | null
  dieta_balde_cal1_kg: number | null
  dieta_balde_cal2_kg: number | null
  real_tolva_kg:       number | null
  real_balde_cal1_kg:  number | null
  real_balde_cal2_kg:  number | null
  real_total_kg:       number | null
}

export interface FfFeedingPlanFull {
  plan: FfFeedingPlan
  rows: FfFeedingPlanRow[]
}

// ── Cell state para el formulario ──────────────────────────
export interface PlanRowCell {
  sobrante_balde_kg?:   number
  sobrante_tolva_kg?:   number
  dieta_tolva_kg?:      number
  dieta_balde_cal1_kg?: number
  dieta_balde_cal2_kg?: number
}

// ── Cálculos derivados (no se editan) ─────────────────────
export interface PlanRowComputed {
  sobrante_total_kg:  number | null
  dieta_total_kg:     number | null
  real_tolva_kg:      number | null
  real_balde_cal1_kg: number | null
  real_balde_cal2_kg: number | null
  real_total_kg:      number | null
}

/* ── FRY — nuevas interfaces ─────────────────────────────── */

/** Una de las hasta 5 tomas de parámetros numéricos por turno */
export interface FryNumericParam {
  id:          string
  log_id:      string
  slot_number: 1 | 2 | 3 | 4 | 5
  temperature: number | null
  ph:          number | null
  salinity:    number | null
  ozone_pct:   number | null
  orp:         number | null
  time_taken:  string | null
}

/** Presión manómetro O₂ — un valor por slot A/B, compartido por todos los TKs */
export interface FrySlotHeader {
  id:              string
  log_id:          string
  time_slot:       string
  o2_pressure_bar: number | null
}

/** Lectura de un tanque individual en un slot A/B */
export interface FryTankReading {
  id:              string
  log_id:          string
  time_slot:       string
  identifier:      string          // 'TK101'–'TK110' | 'TK201'–'TK210'
  o2_saturation:   number | null
  dissolved_o2:    number | null
  tank_intake_m3h: number | null
  base_ml:         number | null
  dose_ml:         number | null
  fish_behavior:   FishBehavior | null
  feed_loss:       FeedLoss | null
}

/** Sala de máquinas — 1 registro por turno */
export interface FryMachineRoom {
  id:                       string
  log_id:                   string
  water_intake:             number | null
  rotofilter_pressure_bar:  number | null
  blower_active:            BlowerActive | null
  pump_line_before:         number | null
  pump_line_after:          number | null
  flowmeter_lpm:            number | null
  ozone_manometer_bar:      number | null
  active_pumps:             number | null
  manifold_pressure:        number | null
  pump_sector_water_level:  WaterLevel | null
  pump_sector_operational:  boolean | null
  camera12_drain:           number | null
  camera12_water_level:     number | null
  sal_manual:               boolean | null
  sal_manual_kg:            number | null
}

export interface LogFull {
  log: Log
  parameters: LogParameters | null
  checklist: ChecklistResponse[]
  fisicoquimicos: Fisicoquimico[]
  pozo?: PozoReading[]
  // FRY — opcionales, solo presentes cuando module es fry1 o fry2
  fryNumericParams?: FryNumericParam[]
  frySlotHeaders?:   FrySlotHeader[]
  fryTankReadings?:  FryTankReading[]
  fryMachineRoom?:   FryMachineRoom | null
}

/* ── Module constants ──────────────────────────────────────── */
export const MODULES = ['HAT', 'FF', 'FRY1', 'FRY2', 'TERRAZA', 'Ongrowing'] as const
export type ModuleName = typeof MODULES[number]

/* ── Module type guards ────────────────────────────────────── */
export const isHAT  = (m: string) => m.toLowerCase() === 'hat'
export const isFF   = (m: string) => m.toLowerCase() === 'ff'
export const isFRY1 = (m: string) => m.toLowerCase() === 'fry1'
export const isFRY2 = (m: string) => m.toLowerCase() === 'fry2'
export const isFRY  = (m: string) => isFRY1(m) || isFRY2(m)

/* ── Shift labels & times ──────────────────────────────────── */
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

export const SHIFT_SLOTS: Record<Shift, [string, string]> = {
  noche: ['00:00', '04:00'],
  dia:   ['08:00', '12:00'],
  tarde: ['14:00', '20:00'],
}

/* ── FQ identifiers por módulo ─────────────────────────────── */
export const FQ_IDENTIFIERS_HAT = [
  'C1','C2','C3','C4','C5','C6','C7','C8','C9','C10',
] as const

export const FQ_IDENTIFIERS_FF = [
  'TK1','TK2','TK3','TK4','TK5','TK6',
] as const

export const FQ_IDENTIFIERS_FRY1 = [
  'TK101','TK102','TK103','TK104','TK105',
  'TK106','TK107','TK108','TK109','TK110',
] as const

export const FQ_IDENTIFIERS_FRY2 = [
  'TK201','TK202','TK203','TK204','TK205',
  'TK206','TK207','TK208','TK209','TK210',
] as const

export const FQ_IDENTIFIERS = [
  ...FQ_IDENTIFIERS_HAT,
  ...FQ_IDENTIFIERS_FF,
] as const

/* ── FRY slot numbers ──────────────────────────────────────── */
export const FRY_NUMERIC_SLOTS = [1, 2, 3, 4, 5] as const
export type FrySlotNumber = typeof FRY_NUMERIC_SLOTS[number]

/* ── Checklist base ────────────────────────────────────────── */
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