// src/lib/generateBitacoraPdf.ts

import type { LogFull, Shift } from '@/types'
import {
  SHIFT_LABELS, SHIFT_TIMES, SHIFT_SLOTS,
  FQ_IDENTIFIERS_HAT, FQ_IDENTIFIERS_FF,
  FQ_IDENTIFIERS_FRY1, FQ_IDENTIFIERS_FRY2,
  isHAT, isFF, isFRY, isFRY1, isFRY2,
} from '@/types'
import type { ChecklistConfigItem } from '@/app/dashboard/actions'

/* ── Helpers ──────────────────────────────────────────────── */

function toNum(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return isNaN(n) ? '—' : String(n)
}

function fmt(v: unknown, unit = ''): string {
  const s = toNum(v)
  return s === '—' ? '—' : `${s}${unit ? '\u00a0' + unit : ''}`
}

function dateLabel(date: string): string {
  return new Date(date + 'T12:00:00').toLocaleDateString('es-CL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function resolveLabel(itemKey: string, config: ChecklistConfigItem[]): string {
  const found = config.find(c => c.item_key === itemKey)
  if (found) return found.label
  return itemKey.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim()
}

/* ── HTML builders ────────────────────────────────────────── */

function row(label: string, value: string): string {
  return `<div class="row"><span class="label">${label}</span><span class="value">${value}</span></div>`
}

function grid2(pairs: [string, string][]): string {
  return `<div class="grid2">${pairs.map(([l, v]) => `
    <div class="grid-item"><div class="grid-label">${l}</div><div class="grid-value">${v}</div></div>`
  ).join('')}</div>`
}

function grid3(pairs: [string, string][]): string {
  return `<div class="grid3">${pairs.map(([l, v]) => `
    <div class="grid-item"><div class="grid-label">${l}</div><div class="grid-value">${v}</div></div>`
  ).join('')}</div>`
}

/* HAT — tabla fisicoquímica con pH en encabezado de slot */
function fqTable(
  slot:           string,
  fqIds:          readonly string[],
  fisicoquimicos: LogFull['fisicoquimicos'],
): string {
  const firstRow = fisicoquimicos.find(r => r.time_slot === slot)
  const phValue  = firstRow?.ph ?? null
  return `
    <div class="fq-slot">
      <div class="fq-slot-title">
        ${slot}
        <span style="font-weight:400;color:#6b7280;margin-left:6px">
          Temp:\u00a0${fmt(firstRow?.temperature, '°C')}
          &nbsp;·&nbsp;
          pH:\u00a0${fmt(phValue)}
        </span>
      </div>
      <table class="fq-table">
        <thead><tr><th>ID</th><th>Sat%</th><th>Mg/L</th></tr></thead>
        <tbody>
          ${fqIds.map(id => {
            const r = fisicoquimicos.find(f => f.identifier === id && f.time_slot === slot)
            return `<tr>
              <td class="fq-id">${id}</td>
              <td>${fmt(r?.o2_saturation)}</td>
              <td>${fmt(r?.dissolved_o2)}</td>
            </tr>`
          }).join('')}
        </tbody>
      </table>
    </div>`
}

/* FRY — badge de estado según rangos */
type Status = 'bajo' | 'okey' | 'alto'
function statusBadge(val: number | null | undefined, low: number, highOk: number): string {
  if (val === null || val === undefined) return ''
  let s: Status
  if      (val < low)     s = 'bajo'
  else if (val <= highOk) s = 'okey'
  else                    s = 'alto'
  const colors: Record<Status, string> = {
    bajo: 'background:#fef9c3;color:#854d0e;border:1px solid #fde047',
    okey: 'background:#dcfce7;color:#166534;border:1px solid #86efac',
    alto: 'background:#fee2e2;color:#991b1b;border:1px solid #fca5a5',
  }
  const labels: Record<Status, string> = { bajo: 'Bajo', okey: 'Okey', alto: 'Alto' }
  return `<span style="font-size:7px;font-weight:700;padding:1px 4px;border-radius:99px;margin-left:3px;${colors[s]}">${labels[s]}</span>`
}

function rated(val: number | null | undefined, unit: string, low: number, highOk: number): string {
  if (val === null || val === undefined) return '—'
  return `${val}\u00a0${unit}${statusBadge(val, low, highOk)}`
}

/* FRY — celda con hint de rango */
function mrCell(label: string, hint: string, value: string): string {
  return `<div class="mr-cell">
    <div class="mr-label">${label}</div>
    <div class="mr-hint">${hint}</div>
    <div class="mr-value">${value}</div>
  </div>`
}

/* FRY — celda simple sin hint */
function mrSimple(label: string, value: string): string {
  return `<div class="mr-cell">
    <div class="mr-label">${label}</div>
    <div class="mr-value" style="margin-top:3px">${value}</div>
  </div>`
}

/* ── Main export ──────────────────────────────────────────── */

export function generateBitacoraPdf(
  logFull:         LogFull,
  module:          string,
  date:            string,
  shift:           Shift,
  checklistConfig: ChecklistConfigItem[],
) {
  const { log, parameters: p, checklist, fisicoquimicos, pozo } = logFull
  const [slotA, slotB] = SHIFT_SLOTS[shift]

  const fqIds = isHAT(module)  ? [...FQ_IDENTIFIERS_HAT]
              : isFF(module)   ? [...FQ_IDENTIFIERS_FF]
              : isFRY1(module) ? [...FQ_IDENTIFIERS_FRY1]
              : isFRY2(module) ? [...FQ_IDENTIFIERS_FRY2]
              : []

  // Checklist ordenado según sort_order de config
  const completadas = checklist
    .filter(c => c.checked)
    .sort((a, b) => {
      const idxA = checklistConfig.findIndex(cfg => cfg.item_key === a.item_key)
      const idxB = checklistConfig.findIndex(cfg => cfg.item_key === b.item_key)
      const oA   = idxA === -1 ? 9999 : (checklistConfig[idxA].sort_order ?? idxA)
      const oB   = idxB === -1 ? 9999 : (checklistConfig[idxB].sort_order ?? idxB)
      return oA - oB
    })

  /* ── HAT / FF — Parámetros numéricos ── */
  let paramPairs: [string, string][] = []
  if (isHAT(module)) {
    paramPairs = [
      ['Bomba principal',     fmt(p?.pump_main_bar,      'Bar')],
      ['Bomba biofiltros',    fmt(p?.pump_biofilter_bar, 'Bar')],
      ['Flujómetro Sala',     fmt(p?.flowmeter_room_lpm, 'L/min')],
      ['Flujómetro Bandejas', fmt(p?.flowmeter_lpm,      'L/min')],
      ['Buffer tank',         fmt(p?.buffer_tank_bar,    'Bar')],
      ['Ingreso agua',        fmt(p?.water_intake,       'dientes')],
    ]
  } else if (isFF(module)) {
    paramPairs = [
      ['Ozono',     fmt(p?.ozone_pct,   '%')],
      ['Intake',    fmt(p?.intake_value)],
      ['Osmosis',   String(p?.osmosis_value ?? '—')],
      ['pH',        fmt(p?.ph_ff)],
      ['Salinidad', fmt(p?.salinity_ff, 'ppt')],
      ['ORP',       fmt(p?.orp_ff,      'mV')],
    ]
  }

  /* ── Pozo (HAT only) ── */
  const pozoHtml = (isHAT(module) && pozo && pozo.length > 0) ? `
    <div class="block full-width">
      <div class="block-title">Parámetros de Pozo</div>
      <div class="fq-wrapper">
        ${[slotA, slotB].map(slot => {
          const r = pozo.find(pr => pr.time_slot === slot)
          return `<div class="fq-slot">
            <div class="fq-slot-title">${slot}</div>
            <table class="fq-table">
              <thead><tr><th>Temp</th><th>Sat%</th><th>Mg/L</th></tr></thead>
              <tbody><tr>
                <td>${fmt(r?.temperature, '°C')}</td>
                <td>${fmt(r?.o2_saturation)}</td>
                <td>${fmt(r?.dissolved_o2)}</td>
              </tr></tbody>
            </table>
          </div>`
        }).join('')}
      </div>
    </div>` : ''

  /* ════════════════════════════════════════════
     FRY — bloques de contenido
  ════════════════════════════════════════════ */

  /* Parámetros numéricos: tabla compacta solo con slots con datos */
  const fryNumericHtml = isFRY(module) ? (() => {
    const slots    = logFull.fryNumericParams ?? []
    const withData = [1,2,3,4,5].filter(n => {
      const s = slots.find(x => x.slot_number === n)
      return s && (s.temperature !== null || s.ph !== null ||
                   s.salinity    !== null || s.ozone_pct !== null || s.orp !== null)
    })
    if (withData.length === 0) return '<span class="empty">Sin datos.</span>'
    return `<table class="fq-table" style="width:100%">
      <thead>
        <tr>
          <th style="text-align:left;width:22px">#</th>
          <th style="width:36px">Hora</th>
          <th>°C</th><th>pH</th><th>Sal</th><th>O₃%</th><th>ORP</th>
        </tr>
      </thead>
      <tbody>
        ${withData.map(n => {
          const s = slots.find(x => x.slot_number === n)!
          return `<tr>
            <td class="fq-id">${n}</td>
            <td style="font-family:monospace;font-size:8px">${s.time_taken ?? '—'}</td>
            <td>${fmt(s.temperature)}</td>
            <td>${fmt(s.ph)}</td>
            <td>${fmt(s.salinity)}</td>
            <td>${fmt(s.ozone_pct)}</td>
            <td>${fmt(s.orp)}</td>
          </tr>`
        }).join('')}
      </tbody>
    </table>`
  })() : ''

  /* Fisicoquímicos TK — dos slots lado a lado */
  const fryTankHtml = isFRY(module) ? (() => {
    const tankReadings = logFull.fryTankReadings ?? []
    const headers      = logFull.frySlotHeaders  ?? []
    const behaviorMap: Record<string, string> = { activo: 'A', letargico: 'L', revisar: 'R' }
    const feedMap:     Record<string, string> = { si: 'Sí', no: 'No', ayuno: 'Ay' }

    const slotTable = (slot: string) => {
      const header  = headers.find(h => h.time_slot === slot)
      const o2Press = header?.o2_pressure_bar != null ? `${header.o2_pressure_bar}\u00a0bar` : '—'
      const rows    = fqIds.map(id => {
        const r = tankReadings.find(t => t.time_slot === slot && t.identifier === id)
        return `<tr>
          <td class="fq-id">${id}</td>
          <td>${fmt(r?.o2_saturation)}</td>
          <td>${fmt(r?.dissolved_o2)}</td>
          <td>${fmt(r?.tank_intake_m3h)}</td>
          <td>${r?.base_ml  != null ? String(r.base_ml)  : '—'}</td>
          <td>${r?.dose_ml  != null ? String(r.dose_ml)  : '—'}</td>
          <td>${r?.fish_behavior ? (behaviorMap[r.fish_behavior] ?? '—') : '—'}</td>
          <td>${r?.feed_loss     ? (feedMap[r.feed_loss]         ?? '—') : '—'}</td>
        </tr>`
      }).join('')
      return `<div>
        <div class="fq-slot-title" style="margin-bottom:2px">
          ${slot}
          <span style="font-weight:400;color:#6b7280;margin-left:4px;font-size:8px">
            O₂: ${o2Press}
          </span>
        </div>
        <table class="fq-table tk-table">
          <thead>
            <tr>
              <th style="text-align:left">TK</th>
              <th>Sat%</th><th>Mg/L</th><th>m³/h</th>
              <th>Base</th><th>Dosis</th><th>C</th><th>A</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="fry-legend">C=Comp.(A/L/R) · A=Alim.(Sí/No/Ay)</div>
      </div>`
    }
    return `<div class="tk-pair">${slotTable(slotA)}${slotTable(slotB)}</div>`
  })() : ''

  /* Sala de Máquinas */
  const fryMachineHtml = isFRY(module) ? (() => {
    const mr = logFull.fryMachineRoom
    if (!mr) return '<span class="empty">Sin datos.</span>'
    const blowerMap: Record<string, string> = { '1': 'Blower 1', '2': 'Blower 2', 'ambos': 'Ambos' }
    const levelMap:  Record<string, string> = { bajo: 'Bajo', medio: 'Medio', alto: 'Alto' }
    return `<div class="mr-grid">
      ${mrCell('Rotofiltro aspersores',  '[5 – 7 bar]',       rated(mr.rotofilter_pressure_bar, 'bar', 6.0,  7.0))}
      ${mrCell('Presión línea — antes',  '[1,5 bar aprox]',   rated(mr.pump_line_before,        'bar', 1.50, 1.59))}
      ${mrCell('Manómetro de Ozono',     '[1,7 – 1,98 bar]',  rated(mr.ozone_manometer_bar,     'bar', 1.70, 1.98))}
      ${mrCell('Presión línea — después','[1 bar aprox]',     rated(mr.pump_line_after,         'bar', 0.79, 1.29))}
      ${mrCell('Presión manifold',       '[±0,6 bar]',        rated(mr.manifold_pressure,       'bar', 0.60, 0.69))}
      ${mrSimple('Ingreso de agua',      fmt(mr.water_intake))}
      ${mrSimple('Flujómetro',           fmt(mr.flowmeter_lpm, 'L/min'))}
      ${mrSimple('Blower operativo',     mr.blower_active ? (blowerMap[mr.blower_active] ?? '—') : '—')}
      ${mrSimple('Bombas operativas',    mr.active_pumps != null ? String(mr.active_pumps) : '—')}
      ${mrSimple('Nivel agua bombas',    mr.pump_sector_water_level ? (levelMap[mr.pump_sector_water_level] ?? '—') : '—')}
      ${mrSimple('Bombas sector op.',    mr.pump_sector_operational === true ? 'Sí' : mr.pump_sector_operational === false ? 'No' : '—')}
      ${mrSimple('Vaciado cámara 12',    mr.camera12_drain != null ? String(mr.camera12_drain) : '—')}
      ${mrSimple('Nivel cámara 12',      fmt(mr.camera12_water_level))}
    </div>`
  })() : ''

  /* Químicos FRY (con SAL Manual) */
  const fryQuimicosHtml = isFRY(module) ? (() => {
    const mr  = logFull.fryMachineRoom
    const sal = mr?.sal_manual === true
    return grid3([
      ['Bicarbonato de sodio', fmt(p?.bicarbonate_kg, 'kg')],
      ['Cloruro de calcio',    fmt(p?.chloride_kg,    'kg')],
      ['SAL Manual', sal ? `Sí${mr?.sal_manual_kg != null ? ` — ${mr.sal_manual_kg}\u00a0kg` : ''}` : 'No'],
    ])
  })() : ''

  /* ── CSS ──────────────────────────────────────────────────── */
  const css = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 9px; color: #1a1a1a; background: #fff; padding: 12px 16px;
    }

    /* Header */
    .header {
      display: flex; align-items: center; justify-content: space-between;
      border-bottom: 2px solid #1a1a1a; padding-bottom: 6px; margin-bottom: 8px;
    }
    .header h1 { font-size: 14px; font-weight: 700; }
    .header p  { font-size: 9px; color: #555; margin-top: 1px; text-transform: capitalize; }
    .header-right { text-align: right; }
    .shift-badge {
      display: inline-block; font-size: 8.5px; font-weight: 700;
      padding: 2px 7px; border-radius: 99px;
    }
    .shift-noche { background: #e0e7ff; color: #3730a3; }
    .shift-dia   { background: #fef3c7; color: #92400e; }
    .shift-tarde { background: #ffedd5; color: #9a3412; }
    .print-date  { font-size: 7.5px; color: #aaa; margin-top: 2px; }

    /* Layout principal — FRY usa 3 columnas en la primera fila */
    .main-grid     { display: grid; grid-template-columns: 1fr 1fr; gap: 7px 12px; }
    .main-grid-fry { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 7px 12px; }
    .full-width    { grid-column: 1 / -1; }
    .full-width-3  { grid-column: 1 / -1; }

    /* Bloques */
    .block { }
    .block-title {
      font-size: 7.5px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.06em; color: #888;
      border-bottom: 1px solid #e5e7eb; padding-bottom: 2px; margin-bottom: 4px;
    }

    /* Rows */
    .row { display: flex; gap: 4px; padding: 1.5px 0; border-bottom: 1px solid #f3f4f6; }
    .row:last-child { border-bottom: none; }
    .label { color: #666; min-width: 100px; flex-shrink: 0; font-size: 8.5px; }
    .value { font-weight: 500; color: #111; font-size: 8.5px; }

    /* Grids */
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 3px; }
    .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 3px; }
    .grid-item  { background: #f9fafb; border-radius: 4px; padding: 3px 5px; }
    .grid-label { font-size: 7.5px; color: #888; margin-bottom: 1px; }
    .grid-value { font-size: 10px; font-weight: 600; color: #111; }

    /* Checklist */
    .checklist { columns: 2; gap: 6px; margin-bottom: 2px; }
    .check-item { display: flex; align-items: center; gap: 4px; padding: 1px 0; break-inside: avoid; }
    .check-box {
      width: 10px; height: 10px; flex-shrink: 0;
      border: 1.5px solid #22c55e; border-radius: 50%; background: #22c55e;
      display: flex; align-items: center; justify-content: center;
      font-size: 6.5px; font-weight: 700; color: #fff;
    }
    .check-label   { font-size: 8.5px; color: #374151; }
    .check-summary { font-size: 8.5px; font-weight: 600; color: #6b7280; margin-top: 2px; }
    .empty { color: #9ca3af; font-style: italic; font-size: 8.5px; }

    /* FQ Tables */
    .fq-wrapper    { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
    .fq-slot-title { font-size: 9px; font-weight: 600; color: #3b82f6; margin-bottom: 2px; }
    .fq-table      { width: 100%; border-collapse: collapse; font-size: 8.5px; }
    .fq-table th {
      background: #f3f4f6; font-weight: 600; color: #6b7280;
      text-align: center; padding: 2px 3px; border: 1px solid #e5e7eb;
    }
    .fq-table td   { text-align: center; padding: 1.5px 3px; border: 1px solid #e5e7eb; }
    .fq-table .fq-id { font-weight: 700; color: #3b82f6; text-align: left; }
    .fq-table tr:nth-child(even) td { background: #f9fafb; }

    /* TK pair */
    .tk-pair  { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; align-items: start; }
    .tk-table { font-size: 8px; }
    .tk-table th { padding: 1.5px 2.5px; font-size: 7.5px; }
    .tk-table td { padding: 1px 2.5px; }
    .fry-legend { font-size: 7px; color: #9ca3af; margin-top: 2px; }

    /* Sala de Máquinas */
    .mr-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px 6px; }
    .mr-cell { background: #f9fafb; border-radius: 4px; padding: 3px 5px; }
    .mr-label {
      font-size: 7px; color: #9ca3af; font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.03em; line-height: 1.2; margin-bottom: 1px;
    }
    .mr-hint  { font-size: 6.5px; color: #c0c4cc; margin-bottom: 2px; line-height: 1.2; }
    .mr-value {
      font-size: 9.5px; font-weight: 700; color: #111;
      display: flex; align-items: center; flex-wrap: wrap; gap: 2px;
    }

    /* Notes */
    .notes {
      background: #f9fafb; border-radius: 4px; padding: 4px 6px;
      font-size: 8.5px; line-height: 1.4; color: #374151; white-space: pre-wrap;
    }

    /* Footer */
    .footer {
      margin-top: 6px; padding-top: 5px; border-top: 1px solid #e5e7eb;
      display: flex; justify-content: space-between; font-size: 7.5px; color: #aaa;
    }

    .no-print { margin-bottom: 10px; display: flex; gap: 8px; }

    @media print {
      body { padding: 8px 12px; font-size: 8.5px; }
      .no-print { display: none !important; }
      @page { margin: 0.7cm; size: A4 landscape; }
    }
  `

  /* ── Contenido FRY — layout en 3 zonas ───────────────────────
     Zona 1 (3 cols): Metadatos | Params numéricos | Químicos+Obs
     Zona 2 (full):  TKs A y B lado a lado
     Zona 3 (full):  Sala de Máquinas
  ─────────────────────────────────────────────────────────────── */
  const fryContent = `
    <div class="main-grid-fry">

      <!-- Col 1: Metadatos -->
      <div class="block">
        <div class="block-title">Metadatos</div>
        ${row('Operador', log.operator_name ?? '—')}
        ${log.additional_operators ? row('Responsables', log.additional_operators) : ''}
        ${row('Módulo', module.toUpperCase())}
        ${row('Fecha', new Date(date + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }))}
        ${row('Turno', `${SHIFT_LABELS[shift]}\u00a0·\u00a0${SHIFT_TIMES[shift]}`)}
        <div style="margin-top:5px">
          <div class="block-title">Check-list</div>
          ${completadas.length === 0
            ? '<span class="empty">Sin tareas completadas</span>'
            : `<div class="checklist" style="columns:1">
                ${completadas.map(c => `
                  <div class="check-item">
                    <span class="check-box">✓</span>
                    <span class="check-label">${resolveLabel(c.item_key, checklistConfig)}</span>
                  </div>`).join('')}
              </div>
              <div class="check-summary">${completadas.length} / ${checklist.length} completados</div>`
          }
        </div>
      </div>

      <!-- Col 2: Parámetros numéricos -->
      <div class="block">
        <div class="block-title">Parámetros numéricos — tomas del turno</div>
        ${fryNumericHtml}
      </div>

      <!-- Col 3: Químicos + Observaciones -->
      <div class="block">
        <div class="block-title">Químicos</div>
        ${fryQuimicosHtml}
        <div style="margin-top:6px">
          <div class="block-title">Observaciones</div>
          ${log.notes
            ? `<div class="notes">${log.notes.replace(/\n/g, '<br>')}</div>`
            : '<span class="empty">Sin observaciones.</span>'}
        </div>
      </div>

      <!-- Fila 2: TKs — full width -->
      <div class="block full-width-3">
        <div class="block-title">Parámetros fisicoquímicos por tanque</div>
        ${fryTankHtml}
      </div>

      <!-- Fila 3: Sala de Máquinas — full width -->
      <div class="block full-width-3">
        <div class="block-title">Sala de Máquinas</div>
        ${fryMachineHtml}
      </div>

    </div>`

  /* ── Contenido HAT / FF ── */
  const defaultContent = `
    <div class="main-grid">

      <!-- Col 1: Metadatos -->
      <div class="block">
        <div class="block-title">Metadatos</div>
        ${row('Operador', log.operator_name ?? '—')}
        ${log.additional_operators ? row('Responsables', log.additional_operators) : ''}
        ${row('Módulo', module.toUpperCase())}
        ${row('Fecha', new Date(date + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }))}
        ${row('Turno', `${SHIFT_LABELS[shift]}\u00a0·\u00a0${SHIFT_TIMES[shift]}`)}
      </div>

      <!-- Col 2: Checklist -->
      <div class="block">
        <div class="block-title">Check-list operacional</div>
        ${completadas.length === 0
          ? '<span class="empty">Sin tareas completadas</span>'
          : `<div class="checklist">
              ${completadas.map(c => `
                <div class="check-item">
                  <span class="check-box">✓</span>
                  <span class="check-label">${resolveLabel(c.item_key, checklistConfig)}</span>
                </div>`).join('')}
            </div>
            <div class="check-summary">${completadas.length} / ${checklist.length} completados</div>`
        }
      </div>

      <!-- Col 1: Parámetros numéricos -->
      <div class="block">
        <div class="block-title">Parámetros numéricos</div>
        ${grid2(paramPairs)}
      </div>

      <!-- Col 2: Químicos + Observaciones -->
      <div class="block">
        <div class="block-title">Químicos</div>
        ${grid2([
          ['Bicarbonato de sodio', fmt(p?.bicarbonate_kg, 'kg')],
          ['Cloruro de calcio',    fmt(p?.chloride_kg,    'kg')],
        ])}
        <div style="margin-top:6px">
          <div class="block-title">Observaciones</div>
          ${log.notes
            ? `<div class="notes">${log.notes.replace(/\n/g, '<br>')}</div>`
            : '<span class="empty">Sin observaciones.</span>'}
        </div>
      </div>

      <!-- Full width: Fisicoquímicos -->
      ${fqIds.length > 0 ? `
      <div class="block full-width">
        <div class="block-title">Parámetros fisicoquímicos</div>
        <div class="fq-wrapper">
          ${fqTable(slotA, fqIds, fisicoquimicos)}
          ${fqTable(slotB, fqIds, fisicoquimicos)}
        </div>
      </div>` : ''}

      ${pozoHtml}

    </div>`

  /* ── HTML completo ─────────────────────────────────────────── */
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <title>Bitácora ${module.toUpperCase()} — ${date} — ${SHIFT_LABELS[shift]}</title>
  <style>${css}</style>
</head>
<body>

  <div class="header">
    <div>
      <h1>Bitácora ${module.toUpperCase()}</h1>
      <p>${dateLabel(date)}</p>
    </div>
    <div class="header-right">
      <span class="shift-badge shift-${shift}">${SHIFT_LABELS[shift]} — ${SHIFT_TIMES[shift]}</span>
      <div class="print-date">Impreso: ${new Date().toLocaleString('es-CL')}</div>
    </div>
  </div>

  <div class="no-print">
    <button onclick="window.print()"
      style="padding:7px 18px;background:#3b82f6;color:#fff;border:none;border-radius:99px;font-size:12px;font-weight:600;cursor:pointer;">
      Guardar como PDF / Imprimir
    </button>
    <button onclick="window.close()"
      style="padding:7px 14px;background:#f3f4f6;color:#374151;border:none;border-radius:99px;font-size:12px;font-weight:600;cursor:pointer;">
      Cerrar
    </button>
  </div>

  ${isFRY(module) ? fryContent : defaultContent}

  <div class="footer">
    <span>Aquaria — Sistema de Bitácoras</span>
    <span>${module.toUpperCase()} · ${date} · ${SHIFT_LABELS[shift]}</span>
  </div>

</body>
</html>`

  const win = window.open('', '_blank', 'width=1100,height=780')
  if (!win) {
    alert('El navegador bloqueó la ventana emergente. Permite ventanas emergentes para este sitio.')
    return
  }
  win.document.write(html)
  win.document.close()
}