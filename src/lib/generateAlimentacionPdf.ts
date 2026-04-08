// src/lib/generateAlimentacionPdf.ts

import type { SobranteVariant, DietaVariant, FfTkId, PlanRowCell } from '@/types/index'
import { FF_TK_IDS } from '@/types/index'

// ── Helpers ───────────────────────────────────────────────

function toN(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return isNaN(n) ? null : n
}

function r3(n: number): number { return Math.round(n * 1000) / 1000 }

function fmt(v: number | null): string {
  if (v === null) return '—'
  return v % 1 === 0 ? String(v) : v.toFixed(3).replace(/\.?0+$/, '')
}

function fmtSigned(v: number | null): string {
  if (v === null) return '—'
  const s = fmt(v)
  return s === '—' ? '—' : s
}

function dateLabel(date: string): string {
  return new Date(date + 'T12:00:00').toLocaleDateString('es-CL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function majorCalIdx(c1: string | null, c2: string | null): 1 | 2 {
  const p1 = toN(c1) ?? 0
  const p2 = toN(c2) ?? 0
  return p1 >= p2 ? 1 : 2
}

// ── Cálculos ──────────────────────────────────────────────

function computeReal(
  cell: PlanRowCell,
  sobVar: SobranteVariant,
  dietVar: DietaVariant,
  cal1Pct: string,
  cal2Pct: string,
) {
  const dTolva = toN(cell.dieta_tolva_kg)
  const dBal1  = toN(cell.dieta_balde_cal1_kg)
  const dBal2  = toN(cell.dieta_balde_cal2_kg)
  const sBalde = toN(cell.sobrante_balde_kg) ?? 0
  const sTolva = sobVar === 'balde_tolva' ? (toN(cell.sobrante_tolva_kg) ?? 0) : 0

  const realTolva = dTolva !== null ? r3(dTolva - sTolva) : null

  let realBal1: number | null = null
  let realBal2: number | null = null

  if (dietVar === '1_calibre') {
    realBal1 = dBal1 !== null ? r3(dBal1 - sBalde) : null
  } else {
    const maj = majorCalIdx(cal1Pct, cal2Pct)
    if (maj === 1) {
      realBal1 = dBal1 !== null ? r3(dBal1 - sBalde) : null
      realBal2 = dBal2
    } else {
      realBal1 = dBal1
      realBal2 = dBal2 !== null ? r3(dBal2 - sBalde) : null
    }
  }

  const parts = [realTolva, realBal1, realBal2].filter(v => v !== null) as number[]
  const realTotal = parts.length > 0 ? r3(parts.reduce((a, b) => a + b, 0)) : null

  return { realTolva, realBal1, realBal2, realTotal }
}

function sobranteTotal(cell: PlanRowCell, sobVar: SobranteVariant): number | null {
  const t = toN(cell.sobrante_tolva_kg)
  const b = toN(cell.sobrante_balde_kg)
  if (sobVar === 'balde') return b
  if (b === null && t === null) return null
  return r3((t ?? 0) + (b ?? 0))
}

function dietaTotal(cell: PlanRowCell, dietVar: DietaVariant): number | null {
  const tolva = toN(cell.dieta_tolva_kg)
  const bal1  = toN(cell.dieta_balde_cal1_kg)
  const bal2  = dietVar === '2_calibres' ? toN(cell.dieta_balde_cal2_kg) : null
  const parts = [tolva, bal1, bal2].filter(v => v !== null) as number[]
  return parts.length > 0 ? r3(parts.reduce((a, b) => a + b, 0)) : null
}

function dietaTotalMajor(cell: PlanRowCell, majorIdx: 1 | 2): number | null {
  const tolva  = toN(cell.dieta_tolva_kg)
  const balMaj = majorIdx === 1 ? toN(cell.dieta_balde_cal1_kg) : toN(cell.dieta_balde_cal2_kg)
  if (tolva === null && balMaj === null) return null
  return r3((tolva ?? 0) + (balMaj ?? 0))
}

function sumCol(rows: Record<FfTkId, PlanRowCell>, fn: (cell: PlanRowCell) => number | null): number | null {
  let total: number | null = null
  FF_TK_IDS.forEach(tk => {
    const v = fn(rows[tk] ?? {})
    if (v !== null) total = r3((total ?? 0) + v)
  })
  return total
}

// ── Colores condicionales para celda Real ─────────────────

function realColor(v: number | null): string {
  if (v === null) return '#9ca3af'
  if (v < 0)     return '#ef4444'
  return '#059669'
}

// ── HTML builders ─────────────────────────────────────────

function th(label: string, extra = ''): string {
  return `<th ${extra}>${label}</th>`
}

function td(content: string, extra = ''): string {
  return `<td ${extra}>${content}</td>`
}

function tdVal(v: number | null, colored = false): string {
  const s = fmt(v)
  const color = colored ? `color:${realColor(v)};font-weight:600` : ''
  return `<td style="text-align:center;${color}">${s}</td>`
}

function tdCalc(v: number | null): string {
  return `<td style="text-align:center;color:#3b82f6;font-weight:600">${fmt(v)}</td>`
}

function tdMajor(v: number | null): string {
  return `<td style="text-align:center;color:#6366f1;font-weight:600;background:#eef2ff">${fmt(v)}</td>`
}

// ── Tipos del payload ─────────────────────────────────────

export interface AlimentacionPdfPayload {
  date:           string
  sobVar:         SobranteVariant
  dietVar:        DietaVariant
  cal1:           string
  cal2:           string
  cal1Pct:        string
  cal2Pct:        string
  majorIdx:       1 | 2
  calMajorLabel:  string
  calMinorLabel:  string
  calMajorPct:    string
  rows:           Record<FfTkId, PlanRowCell>
}

// ── Main export ───────────────────────────────────────────

export function generateAlimentacionPdf(payload: AlimentacionPdfPayload) {
  const {
    date, sobVar, dietVar,
    cal1, cal2, cal1Pct, cal2Pct,
    majorIdx, calMajorLabel, calMinorLabel, calMajorPct,
    rows,
  } = payload

  const is2Cal = dietVar === '2_calibres'
  const isBT   = sobVar === 'balde_tolva'

  // ── Totales ───────────────────────────────────────────
  const totSobTolva = isBT ? sumCol(rows, c => toN(c.sobrante_tolva_kg)) : null
  const totSobBalde = sumCol(rows, c => toN(c.sobrante_balde_kg))
  const totSobTotal = sobVar === 'balde' ? totSobBalde
    : (totSobTolva !== null || totSobBalde !== null
        ? r3((totSobTolva ?? 0) + (totSobBalde ?? 0)) : null)

  const totDietTolva = sumCol(rows, c => toN(c.dieta_tolva_kg))
  const totDietBal1  = sumCol(rows, c => toN(c.dieta_balde_cal1_kg))
  const totDietBal2  = is2Cal ? sumCol(rows, c => toN(c.dieta_balde_cal2_kg)) : null
  const totDietMaj   = is2Cal ? sumCol(rows, c => dietaTotalMajor(c, majorIdx)) : null
  const totDietTotal = [totDietTolva, totDietBal1, totDietBal2].filter(v => v !== null).length > 0
    ? r3([totDietTolva ?? 0, totDietBal1 ?? 0, totDietBal2 ?? 0].reduce((a, b) => a + b, 0)) : null

  const totRealTolva = sumCol(rows, c => computeReal(c, sobVar, dietVar, cal1Pct, cal2Pct).realTolva)
  const totRealBal1  = sumCol(rows, c => computeReal(c, sobVar, dietVar, cal1Pct, cal2Pct).realBal1)
  const totRealBal2  = is2Cal ? sumCol(rows, c => computeReal(c, sobVar, dietVar, cal1Pct, cal2Pct).realBal2) : null
  const totRealTotal = sumCol(rows, c => computeReal(c, sobVar, dietVar, cal1Pct, cal2Pct).realTotal)

  // ── Encabezados de columna ────────────────────────────
  // Sobrante: Tolva / Balde / [Total]
  const sobHeaders = isBT
    ? `${th('Tolva')}${th('Balde')}${th('Total', 'class="col-total"')}`
    : th('Balde')

  // Dieta: Tolva / Balde maj / [Balde min] / [Total maj] / Total
  const dietHeaders = is2Cal
    ? `${th(`Tolva<br>${calMajorLabel}`)}${th(`Balde<br>${calMajorLabel}`)}${th(`Balde<br>${calMinorLabel}`)}${th(`Total<br>${calMajorLabel}`, 'class="col-major"')}${th('Total', 'class="col-total"')}`
    : `${th(`Tolva<br>${calMajorLabel}`)}${th(`Balde<br>${calMajorLabel}`)}${th('Total', 'class="col-total"')}`

  // Real: Tolva / Balde maj / [Balde min] / Total
  const realHeaders = is2Cal
    ? `${th(`Tolva<br>${calMajorLabel}`)}${th(`Balde<br>${calMajorLabel}`)}${th(`Balde<br>${calMinorLabel}`)}${th('Total', 'class="col-total"')}`
    : `${th(`Tolva<br>${calMajorLabel}`)}${th(`Balde<br>${calMajorLabel}`)}${th('Total', 'class="col-total"')}`

  const sobColSpan  = isBT ? 3 : 1
  const dietColSpan = is2Cal ? 5 : 3
  const realColSpan = is2Cal ? 4 : 3

  // ── Filas de datos ────────────────────────────────────
  const dataRows = FF_TK_IDS.map((tk, idx) => {
    const cell       = rows[tk] ?? {}
    const sobTot     = sobranteTotal(cell, sobVar)
    const dietTot    = dietaTotal(cell, dietVar)
    const dietMajTot = is2Cal ? dietaTotalMajor(cell, majorIdx) : null
    const { realTolva, realBal1, realBal2, realTotal } = computeReal(cell, sobVar, dietVar, cal1Pct, cal2Pct)
    const bg = idx % 2 === 1 ? 'background:#f9fafb' : ''

    const sobCells = isBT
      ? `${td(fmt(toN(cell.sobrante_tolva_kg)))}${td(fmt(toN(cell.sobrante_balde_kg)))}${td(fmt(sobTot), 'class="col-total"')}`
      : td(fmt(toN(cell.sobrante_balde_kg)))

    const dietCells = is2Cal
      ? `${td(fmt(toN(cell.dieta_tolva_kg)))}${td(fmt(toN(cell.dieta_balde_cal1_kg)))}${td(fmt(toN(cell.dieta_balde_cal2_kg)))}${tdMajor(dietMajTot)}${tdCalc(dietTot)}`
      : `${td(fmt(toN(cell.dieta_tolva_kg)))}${td(fmt(toN(cell.dieta_balde_cal1_kg)))}${tdCalc(dietTot)}`

    const realCells = is2Cal
      ? `${tdVal(realTolva, true)}${tdVal(realBal1, true)}${tdVal(realBal2, true)}${tdVal(realTotal, true)}`
      : `${tdVal(realTolva, true)}${tdVal(realBal1, true)}${tdVal(realTotal, true)}`

    return `<tr style="${bg}">
      <td class="tk-id">${tk}</td>
      ${sobCells}
      <td class="sep"></td>
      ${dietCells}
      <td class="sep"></td>
      ${realCells}
    </tr>`
  }).join('')

  // ── Fila de totales ───────────────────────────────────
  const totSobCells = isBT
    ? `${td(fmt(totSobTolva), 'class="tot-cell"')}${td(fmt(totSobBalde), 'class="tot-cell"')}${td(fmt(totSobTotal), 'class="tot-cell col-total"')}`
    : td(fmt(totSobBalde), 'class="tot-cell"')

  const totDietCells = is2Cal
    ? `${td(fmt(totDietTolva), 'class="tot-cell"')}${td(fmt(totDietBal1), 'class="tot-cell"')}${td(fmt(totDietBal2), 'class="tot-cell"')}${td(fmt(totDietMaj), 'class="tot-cell col-major"')}${td(fmt(totDietTotal), 'class="tot-cell col-total"')}`
    : `${td(fmt(totDietTolva), 'class="tot-cell"')}${td(fmt(totDietBal1), 'class="tot-cell"')}${td(fmt(totDietTotal), 'class="tot-cell col-total"')}`

  function tdRealTot(v: number | null): string {
    return `<td class="tot-cell" style="color:${realColor(v)}">${fmtSigned(v)}</td>`
  }
  const totRealCells = is2Cal
    ? `${tdRealTot(totRealTolva)}${tdRealTot(totRealBal1)}${tdRealTot(totRealBal2)}${tdRealTot(totRealTotal)}`
    : `${tdRealTot(totRealTolva)}${tdRealTot(totRealBal1)}${tdRealTot(totRealTotal)}`

  // ── Info de calibres para el resumen ──────────────────
  const calibreInfo = is2Cal
    ? `${cal1 || '—'} (${cal1Pct || '?'}%) · ${cal2 || '—'} (${cal2Pct || '?'}%) — Tolva: ${calMajorLabel} (${calMajorPct}%)`
    : (cal1 || '—')

  // ── CSS ───────────────────────────────────────────────
  const css = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 9px; color: #1a1a1a; background: #fff; padding: 12px 16px;
    }

    /* Header */
    .header {
      display: flex; align-items: flex-start; justify-content: space-between;
      border-bottom: 2px solid #1a1a1a; padding-bottom: 6px; margin-bottom: 10px;
    }
    .header h1   { font-size: 14px; font-weight: 700; }
    .header p    { font-size: 9px; color: #555; margin-top: 1px; text-transform: capitalize; }
    .header-right { text-align: right; }
    .badge {
      display: inline-block; font-size: 8.5px; font-weight: 700;
      padding: 2px 7px; border-radius: 99px;
      background: #d1fae5; color: #065f46;
    }
    .print-date { font-size: 7.5px; color: #aaa; margin-top: 2px; }

    /* Info panel */
    .info-grid {
      display: grid; grid-template-columns: repeat(3, 1fr);
      gap: 4px; margin-bottom: 10px;
    }
    .info-cell {
      background: #f9fafb; border-radius: 4px; padding: 4px 6px;
    }
    .info-label { font-size: 7.5px; color: #9ca3af; font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 1px; }
    .info-value { font-size: 10px; font-weight: 600; color: #111; }

    /* Tabla principal */
    table    { width: 100%; border-collapse: collapse; font-size: 8px; }
    th, td   { padding: 2.5px 4px; border: 1px solid #e5e7eb; text-align: center; }
    th       { font-weight: 700; font-size: 7.5px; color: #6b7280; background: #f3f4f6; }

    /* Separador entre grupos */
    .sep     { width: 4px; background: #f3f4f6; border-color: #d1d5db; padding: 0; }

    /* Columna TK */
    .tk-id   { font-weight: 700; color: #3b82f6; text-align: left; padding-left: 6px; }

    /* Cabecera de grupo de categoría */
    .group-sob  { background: #fef3c7; color: #92400e; }
    .group-diet { background: #dbeafe; color: #1e40af; }
    .group-real { background: #d1fae5; color: #065f46; }

    /* Columnas especiales */
    .col-total  { background: #f3f4f6; color: #374151; font-style: italic; }
    .col-major  { background: #eef2ff; color: #4338ca; }

    /* Fila de totales */
    .tot-row td { font-weight: 700; background: #f1f5f9; border-top: 2px solid #94a3b8; }
    .tot-label  { text-align: left !important; padding-left: 6px !important;
      font-size: 8px; text-transform: uppercase; letter-spacing: 0.07em; color: #6b7280; }
    .tot-cell   { text-align: center; }

    /* Leyenda */
    .legend {
      display: flex; gap: 14px; flex-wrap: wrap;
      margin-top: 8px; padding-top: 6px; border-top: 1px solid #e5e7eb;
    }
    .legend-item { display: flex; align-items: center; gap: 4px; }
    .legend-dot  { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
    .legend-text { font-size: 7.5px; color: #6b7280; }

    /* Footer */
    .footer {
      margin-top: 8px; padding-top: 5px; border-top: 1px solid #e5e7eb;
      display: flex; justify-content: space-between; font-size: 7.5px; color: #aaa;
    }

    /* Notas de color real */
    .nota-neg { color: #ef4444; }
    .nota-pos { color: #059669; }

    .no-print { margin-bottom: 10px; display: flex; gap: 8px; }
    @media print {
      body { padding: 8px 12px; font-size: 8px; }
      .no-print { display: none !important; }
      @page { margin: 0.7cm; size: A4 landscape; }
    }
  `

  // ── HTML completo ─────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <title>Plan de Alimentación FF — ${date}</title>
  <style>${css}</style>
</head>
<body>

  <div class="header">
    <div>
      <h1>Plan de Alimentación — FF</h1>
      <p>${dateLabel(date)}</p>
    </div>
    <div class="header-right">
      <span class="badge">FF · Turno Noche</span>
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

  <!-- Info panel -->
  <div class="info-grid">
    <div class="info-cell">
      <div class="info-label">Sobrante</div>
      <div class="info-value">${sobVar === 'balde' ? 'Solo balde' : 'Balde y Tolva'}</div>
    </div>
    <div class="info-cell">
      <div class="info-label">Dieta</div>
      <div class="info-value">${dietVar === '1_calibre' ? '1 Calibre' : '2 Calibres / Mezcla'}</div>
    </div>
    <div class="info-cell">
      <div class="info-label">Calibre(s)</div>
      <div class="info-value">${calibreInfo}</div>
    </div>
  </div>

  <!-- Tabla principal -->
  <table>
    <thead>
      <!-- Fila 1: grupos -->
      <tr>
        <th rowspan="2" style="text-align:left;padding-left:6px;width:36px">TK</th>
        <th colspan="${sobColSpan}" class="group-sob">Sobrante</th>
        <th class="sep" rowspan="2"></th>
        <th colspan="${dietColSpan}" class="group-diet">Dieta</th>
        <th class="sep" rowspan="2"></th>
        <th colspan="${realColSpan}" class="group-real">Real</th>
      </tr>
      <!-- Fila 2: sub-columnas -->
      <tr>
        ${sobHeaders}
        ${dietHeaders}
        ${realHeaders}
      </tr>
    </thead>
    <tbody>
      ${dataRows}
    </tbody>
    <tfoot>
      <tr class="tot-row">
        <td class="tot-label">Total</td>
        ${totSobCells}
        <td class="sep"></td>
        ${totDietCells}
        <td class="sep"></td>
        ${totRealCells}
      </tr>
    </tfoot>
  </table>

  <!-- Leyenda -->
  <div class="legend">
    <div class="legend-item">
      <span class="legend-dot" style="background:#f59e0b"></span>
      <span class="legend-text">Sobrante — Alimento restante</span>
    </div>
    <div class="legend-item">
      <span class="legend-dot" style="background:#3b82f6"></span>
      <span class="legend-text">Dieta — pauta del turno</span>
    </div>
    ${is2Cal ? `<div class="legend-item">
      <span class="legend-dot" style="background:#6366f1"></span>
      <span class="legend-text">Total ${calMajorLabel} — tolva + balde del calibre de mayor %</span>
    </div>` : ''}
    <div class="legend-item">
      <span class="legend-dot" style="background:#059669"></span>
      <span class="legend-text">Real positivo — se agregó alimento</span>
    </div>
    <div class="legend-item">
      <span class="legend-dot" style="background:#ef4444"></span>
      <span class="legend-text">Real negativo — se retiró alimento</span>
    </div>
  </div>

  <div class="footer">
    <span>Aquaria — Sistema de Bitácoras</span>
    <span>FF · Alimentación · ${date}</span>
  </div>

</body>
</html>`

  const win = window.open('', '_blank', 'width=1200,height=800')
  if (!win) {
    alert('El navegador bloqueó la ventana emergente. Permite ventanas emergentes para este sitio.')
    return
  }
  win.document.write(html)
  win.document.close()
}