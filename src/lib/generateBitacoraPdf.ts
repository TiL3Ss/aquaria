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
  return s === '—' ? '—' : `${s}${unit ? ' ' + unit : ''}`
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

function fqTable(slot: string, fqIds: readonly string[], fisicoquimicos: LogFull['fisicoquimicos']): string {
  const tempRow = fisicoquimicos.find(r => r.time_slot === slot)
  return `
    <div class="fq-slot">
      <div class="fq-slot-title">${slot} — Temp: ${fmt(tempRow?.temperature, '°C')}</div>
      <table class="fq-table">
        <thead><tr><th>ID</th><th>Sat%</th><th>Mg/L</th></tr></thead>
        <tbody>
          ${fqIds.map(id => {
            const r = fisicoquimicos.find(f => f.identifier === id && f.time_slot === slot)
            return `<tr><td class="fq-id">${id}</td><td>${fmt(r?.o2_saturation)}</td><td>${fmt(r?.dissolved_o2)}</td></tr>`
          }).join('')}
        </tbody>
      </table>
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

  const completadas = checklist.filter(c => c.checked)

  /* ── Parámetros numéricos — HAT / FF ── */
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
          return `
            <div class="fq-slot">
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

  /* ── FRY — Parámetros numéricos (5 slots) ── */
  const fryNumericHtml = isFRY(module) ? (() => {
    const slots = logFull.fryNumericParams ?? []
    if (slots.length === 0) return '<span class="empty">Sin datos registrados.</span>'

    return `<table class="fq-table" style="width:100%">
      <thead>
        <tr>
          <th style="text-align:left">Slot</th>
          <th>Hora</th>
          <th>Temp °C</th>
          <th>pH</th>
          <th>Sal ppt</th>
          <th>Ozono %</th>
          <th>ORP mV</th>
        </tr>
      </thead>
      <tbody>
        ${[1,2,3,4,5].map(n => {
          const s = slots.find(x => x.slot_number === n)
          const hasData = s && (
            s.temperature !== null || s.ph !== null ||
            s.salinity !== null    || s.ozone_pct !== null || s.orp !== null
          )
          if (!hasData) return `
            <tr class="empty-slot">
              <td class="fq-id">${n}</td>
              <td colspan="6" style="color:#ccc;font-style:italic;text-align:center">—</td>
            </tr>`
          return `
            <tr>
              <td class="fq-id">${n}</td>
              <td style="font-family:monospace">${s?.time_taken ?? '—'}</td>
              <td>${fmt(s?.temperature)}</td>
              <td>${fmt(s?.ph)}</td>
              <td>${fmt(s?.salinity)}</td>
              <td>${fmt(s?.ozone_pct)}</td>
              <td>${fmt(s?.orp)}</td>
            </tr>`
        }).join('')}
      </tbody>
    </table>`
  })() : ''

  /* ── FRY — Fisicoquímicos por TK ── */
  const fryTankHtml = isFRY(module) ? (() => {
    const tankReadings = logFull.fryTankReadings ?? []
    const headers      = logFull.frySlotHeaders  ?? []

    return [slotA, slotB].map(slot => {
      const header   = headers.find(h => h.time_slot === slot)
      const o2Press  = header?.o2_pressure_bar !== null && header?.o2_pressure_bar !== undefined
        ? `${header.o2_pressure_bar} bar` : '—'

      const rows = fqIds.map(id => {
        const r = tankReadings.find(t => t.time_slot === slot && t.identifier === id)
        const behaviorMap: Record<string, string> = { activo: 'A', letargico: 'L', revisar: 'R' }
        const feedMap:     Record<string, string> = { si: 'Sí', no: 'No', ayuno: 'Ayuno' }
        return `
          <tr>
            <td class="fq-id">${id}</td>
            <td>${fmt(r?.o2_saturation)}</td>
            <td>${fmt(r?.dissolved_o2)}</td>
            <td>${fmt(r?.tank_intake_m3h)}</td>
            <td>${r?.base_ml !== null && r?.base_ml !== undefined ? String(r.base_ml) : '—'}</td>
            <td>${r?.dose_ml !== null && r?.dose_ml !== undefined ? String(r.dose_ml) : '—'}</td>
            <td>${r?.fish_behavior ? behaviorMap[r.fish_behavior] ?? '—' : '—'}</td>
            <td>${r?.feed_loss ? feedMap[r.feed_loss] ?? '—' : '—'}</td>
          </tr>`
      }).join('')

      return `
        <div class="fry-tk-slot">
          <div class="fq-slot-title">
            ${slot}
            <span style="font-weight:400;color:#6b7280;margin-left:8px">
              Presión O₂: ${o2Press}
            </span>
          </div>
          <div class="table-scroll">
            <table class="fq-table" style="min-width:520px">
              <thead>
                <tr>
                  <th style="text-align:left">TK</th>
                  <th>Sat%</th>
                  <th>Mg/L</th>
                  <th>m³/h</th>
                  <th>Base ml</th>
                  <th>Dosis ml</th>
                  <th>Comp.</th>
                  <th>Alim.</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
          <div class="fry-legend">Comp.: A = Activo · L = Letárgico · R = Revisar &nbsp;|&nbsp; Alim.: pérdida de alimento</div>
        </div>`
    }).join('')
  })() : ''

  /* ── FRY — Sala de Máquinas ── */
  const fryMachineHtml = isFRY(module) ? (() => {
    const mr = logFull.fryMachineRoom
    if (!mr) return '<span class="empty">Sin datos registrados.</span>'
    const blowerMap: Record<string, string> = { '1': 'Blower 1', '2': 'Blower 2', 'ambos': 'Ambos' }
    const levelMap:  Record<string, string> = { bajo: 'Bajo', medio: 'Medio', alto: 'Alto' }
    return grid2([
      ['Ingreso de agua',          fmt(mr.water_intake)],
      ['Rotofiltro — aspersores',  fmt(mr.rotofilter_pressure_bar, 'bar')],
      ['Blower operativo',         mr.blower_active ? blowerMap[mr.blower_active] ?? '—' : '—'],
      ['Bombas operativas',        mr.active_pumps !== null ? String(mr.active_pumps) : '—'],
      ['Presión línea — antes',    fmt(mr.pump_line_before, 'bar')],
      ['Presión línea — después',  fmt(mr.pump_line_after,  'bar')],
      ['Flujómetro',               fmt(mr.flowmeter_lpm,    'L/min')],
      ['Manómetro ozono',          fmt(mr.ozone_manometer_bar, 'bar')],
      ['Presión manifold',         fmt(mr.manifold_pressure,   'bar')],
      ['Nivel agua — sector bombas', mr.pump_sector_water_level ? levelMap[mr.pump_sector_water_level] ?? '—' : '—'],
      ['Bombas sector operativas', mr.pump_sector_operational === true ? 'Sí' : mr.pump_sector_operational === false ? 'No' : '—'],
      ['Vaciado cámara 12',        mr.camera12_drain !== null ? String(mr.camera12_drain) : '—'],
      ['Nivel agua cámara 12',     fmt(mr.camera12_water_level)],
    ])
  })() : ''

  /* ── HTML ─────────────────────────────────────────────────── */
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <title>Bitácora ${module.toUpperCase()} — ${date} — ${SHIFT_LABELS[shift]}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 10.5px;
      color: #1a1a1a;
      background: #fff;
      padding: 24px 32px;
      max-width: 860px;
      margin: 0 auto;
    }

    /* ── Header ── */
    .header {
      display: flex; align-items: center; justify-content: space-between;
      border-bottom: 2px solid #1a1a1a; padding-bottom: 10px; margin-bottom: 14px;
    }
    .header h1   { font-size: 17px; font-weight: 700; }
    .header p    { font-size: 11px; color: #555; margin-top: 2px; text-transform: capitalize; }
    .header-right { text-align: right; }
    .shift-badge {
      display: inline-block; font-size: 10px; font-weight: 700;
      padding: 3px 10px; border-radius: 99px;
    }
    .shift-noche { background: #e0e7ff; color: #3730a3; }
    .shift-dia   { background: #fef3c7; color: #92400e; }
    .shift-tarde { background: #ffedd5; color: #9a3412; }
    .print-date  { font-size: 9px; color: #aaa; margin-top: 4px; }

    /* ── Layout ── */
    .main-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px 16px;
    }
    .full-width { grid-column: 1 / -1; }

    /* ── Bloques ── */
    .block { margin-bottom: 0; }
    .block-title {
      font-size: 9px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.08em; color: #888;
      border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; margin-bottom: 7px;
    }

    /* ── Rows ── */
    .row { display: flex; gap: 6px; padding: 2.5px 0; border-bottom: 1px solid #f3f4f6; }
    .row:last-child { border-bottom: none; }
    .label { color: #666; min-width: 130px; flex-shrink: 0; font-size: 10px; }
    .value { font-weight: 500; color: #111; font-size: 10px; }

    /* ── Grid 2 ── */
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
    .grid-item { background: #f9fafb; border-radius: 6px; padding: 5px 8px; }
    .grid-label { font-size: 9px; color: #888; margin-bottom: 1px; }
    .grid-value { font-size: 12px; font-weight: 600; color: #111; }

    /* ── Checklist ── */
    .checklist { columns: 2; gap: 10px; margin-bottom: 5px; }
    .check-item { display: flex; align-items: center; gap: 6px; padding: 2px 0; break-inside: avoid; }
    .check-box {
      width: 13px; height: 13px; flex-shrink: 0;
      border: 1.5px solid #22c55e; border-radius: 50%;
      background: #22c55e; display: flex; align-items: center; justify-content: center;
      font-size: 8px; font-weight: 700; color: #fff;
    }
    .check-label { font-size: 10px; color: #374151; }
    .check-summary { font-size: 10px; font-weight: 600; color: #6b7280; margin-top: 3px; }
    .empty { color: #9ca3af; font-style: italic; font-size: 10px; }
    .empty-slot td { opacity: 0.35; }

    /* ── FQ / TK Tables ── */
    .fq-wrapper { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .fq-slot-title { font-size: 10px; font-weight: 600; color: #3b82f6; margin-bottom: 4px; }
    .fq-table { width: 100%; border-collapse: collapse; font-size: 10px; }
    .fq-table th {
      background: #f3f4f6; font-weight: 600; color: #6b7280;
      text-align: center; padding: 3px 5px; border: 1px solid #e5e7eb;
    }
    .fq-table td { text-align: center; padding: 2.5px 5px; border: 1px solid #e5e7eb; }
    .fq-table .fq-id { font-weight: 700; color: #3b82f6; text-align: left; }
    .fq-table tr:nth-child(even) td { background: #f9fafb; }

    /* ── FRY TK slot ── */
    .fry-tk-slot { margin-bottom: 10px; }
    .fry-legend { font-size: 9px; color: #9ca3af; margin-top: 3px; }
    .table-scroll { overflow-x: auto; }

    /* ── Notes ── */
    .notes {
      background: #f9fafb; border-radius: 6px; padding: 8px 10px;
      font-size: 10px; line-height: 1.5; color: #374151; white-space: pre-wrap;
    }

    /* ── Footer ── */
    .footer {
      margin-top: 12px; padding-top: 8px; border-top: 1px solid #e5e7eb;
      display: flex; justify-content: space-between; font-size: 9px; color: #aaa;
    }

    /* ── Print buttons ── */
    .no-print { margin-bottom: 16px; display: flex; gap: 8px; }

    @media print {
      body { padding: 14px 18px; font-size: 10px; }
      .no-print { display: none !important; }
      .table-scroll { overflow-x: visible; }
      @page { margin: 1cm; size: A4 landscape; }
    }
  </style>
</head>
<body>

  <!-- Header -->
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

  <!-- Botones (solo pantalla) -->
  <div class="no-print">
    <button onclick="window.print()"
      style="padding:9px 22px;background:#3b82f6;color:#fff;border:none;border-radius:99px;font-size:13px;font-weight:600;cursor:pointer;">
      Guardar como PDF / Imprimir
    </button>
    <button onclick="window.close()"
      style="padding:9px 18px;background:#f3f4f6;color:#374151;border:none;border-radius:99px;font-size:13px;font-weight:600;cursor:pointer;">
      Cerrar
    </button>
  </div>

  <div class="main-grid">

    <!-- Metadatos -->
    <div class="block">
      <div class="block-title">Metadatos</div>
      ${row('Operador', log.operator_name ?? '—')}
      ${log.additional_operators ? row('Responsables', log.additional_operators) : ''}
      ${row('Módulo', module.toUpperCase())}
      ${row('Fecha', new Date(date + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }))}
      ${row('Turno', `${SHIFT_LABELS[shift]} · ${SHIFT_TIMES[shift]}`)}
    </div>

    <!-- Checklist -->
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

    ${!isFRY(module) ? `
    <!-- Parámetros numéricos HAT / FF -->
    <div class="block">
      <div class="block-title">Parámetros numéricos</div>
      ${grid2(paramPairs)}
    </div>

    <!-- Químicos + Observaciones (HAT / FF) -->
    <div class="block">
      <div class="block-title">Químicos</div>
      ${grid2([
        ['Bicarbonato de sodio', fmt(p?.bicarbonate_kg, 'kg')],
        ['Cloruro de calcio',    fmt(p?.chloride_kg,    'kg')],
      ])}
      <div style="margin-top:8px;">
        <div class="block-title">Observaciones</div>
        ${log.notes
          ? `<div class="notes">${log.notes.replace(/\n/g, '<br>')}</div>`
          : '<span class="empty">Sin observaciones.</span>'}
      </div>
    </div>

    <!-- Fisicoquímicos HAT / FF -->
    ${fqIds.length > 0 ? `
    <div class="block full-width">
      <div class="block-title">Parámetros fisicoquímicos</div>
      <div class="fq-wrapper">
        ${fqTable(slotA, fqIds, fisicoquimicos)}
        ${fqTable(slotB, fqIds, fisicoquimicos)}
      </div>
    </div>` : ''}

    <!-- Pozo HAT -->
    ${pozoHtml}
    ` : `

    <!-- ═══ FRY ═══ -->

    <!-- Parámetros numéricos FRY (5 slots) -->
    <div class="block full-width">
      <div class="block-title">Parámetros numéricos — tomas del turno</div>
      ${fryNumericHtml}
    </div>

    <!-- Químicos FRY -->
    <div class="block">
      <div class="block-title">Químicos</div>
      ${grid2([
        ['Bicarbonato de sodio', fmt(p?.bicarbonate_kg, 'kg')],
        ['Cloruro de calcio',    fmt(p?.chloride_kg,    'kg')],
      ])}
    </div>

    <!-- Observaciones FRY -->
    <div class="block">
      <div class="block-title">Observaciones</div>
      ${log.notes
        ? `<div class="notes">${log.notes.replace(/\n/g, '<br>')}</div>`
        : '<span class="empty">Sin observaciones.</span>'}
    </div>

    <!-- Fisicoquímicos FRY por TK -->
    <div class="block full-width">
      <div class="block-title">Parámetros fisicoquímicos por tanque</div>
      ${fryTankHtml}
    </div>

    <!-- Sala de máquinas FRY -->
    <div class="block full-width">
      <div class="block-title">Sala de Máquinas</div>
      ${fryMachineHtml}
    </div>

    `}

  </div>

  <div class="footer">
    <span>Aquaria — Sistema de Bitácoras</span>
    <span>${module.toUpperCase()} · ${date} · ${SHIFT_LABELS[shift]}</span>
  </div>

</body>
</html>`

  const win = window.open('', '_blank', 'width=1000,height=750')
  if (!win) {
    alert('El navegador bloqueó la ventana emergente. Permite ventanas emergentes para este sitio.')
    return
  }
  win.document.write(html)
  win.document.close()
}