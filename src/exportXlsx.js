// Eksport til Excel (.xlsx). Biblioteket lastes først når du trykker på knappen, så appen starter raskt.
import { SECTIONS } from './tables.js'
import { ACCOUNT_TYPES, DEBT_MODES, HOME_KINDS, INCOME_KINDS } from './state.js'

const lab = (list, v) => list.find((x) => x.value === v)?.label || v
const pctS = (v) => `${(Number(v) * 100).toFixed(2).replace('.', ',')} %`

function sheetName(name, used) {
  let n = String(name).replace(/[\[\]:*?/\\]/g, ' ').trim().slice(0, 28) || 'Ark'
  let k = n, i = 2
  while (used.has(k.toLowerCase())) k = `${n.slice(0, 25)} ${i++}`
  used.add(k.toLowerCase())
  return k
}

function inputRows(g) {
  const r = []
  r.push(['Grunnlag'], ['Fødselsdato', g.birth], ['Startdato for sparekapital', g.start], ['Planløp (år)', g.years], ['Felles ligning', g.joint ? 'Ja' : 'Nei'], ['Inflasjon', pctS(g.inflation)], [])
  r.push(['Sparekapital'], ['Navn', 'Type', 'Institusjon', 'Verdi per start', 'Rente/avkastning', 'Hovedkonto'])
  g.accounts.forEach((a) => r.push([a.name, lab(ACCOUNT_TYPES, a.type), a.institution, Math.round(a.value), pctS(a.rate), a.main ? 'Ja' : '']))
  r.push([], ['Gjeld'], ['Navn', 'Konto', 'Pant', 'Gjeld per start', 'Rente', 'Nedbetaling', 'Beløp per måned', 'Innfris'])
  g.debts.forEach((d) => r.push([d.name, d.account, d.collateral, Math.round(d.amount), pctS(d.rate), lab(DEBT_MODES, d.mode), Math.round(d.monthly), d.settleDate]))
  r.push([], ['Bolig'], ['Beskrivelse', 'Type', 'Dato', 'Pris/verdi', 'Omkostninger'])
  g.homes.forEach((h) => r.push([h.label, lab(HOME_KINDS, h.kind), h.date, Math.round(h.kind === 'owned' ? h.marketValue : h.price), Math.round(h.costs)]))
  r.push([], ['Inntekter'], ['Navn', 'Type', 'Utbetaler', 'Brutto per måned', 'Starter', 'Slutter', 'Økning per år'])
  g.incomes.forEach((p) => r.push([p.name, lab(INCOME_KINDS, p.kind), p.payer, Math.round(p.monthly), p.start, p.end, pctS(p.growth)]))
  r.push([], ['Utbetalinger'], ['Beskrivelse', 'Dato', 'Beløp'])
  g.payouts.forEach((p) => r.push([p.label, p.date, Math.round(p.amount)]))
  return r
}

export async function exportExcel(store, plans) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const used = new Set()
  const fmt = (ws) => {
    Object.keys(ws).forEach((k) => { if (k[0] !== '!' && ws[k].t === 'n') ws[k].z = '#,##0' })
  }

  // Sammenligning
  const cmp = [['Papp: sammenligning av scenarioene', ...store.scenarios.map(() => '')], ['', ...store.scenarios.map((s) => (store.chosen === s.id ? '★ ' : '') + s.name)]]
  const metrics = [
    ['Planløp (år)', (p) => p.summary.years],
    ['Sparekapital ved start', (p) => p.summary.initial],
    ['Gjeld ved start', (p) => p.summary.debtStart],
    ['Netto avkastning per måned (snitt)', (p) => p.summary.avgNetReturnPerMonth],
    ['Uttak fra kapital per måned (snitt)', (p) => p.summary.avgWithdrawalPerMonth],
    ['Disponibelt per måned (snitt)', (p) => p.summary.avgDisposablePerMonth],
    ['Sparekapital etter skatt ved slutt', (p) => p.summary.closingAfterTax],
    ['Gjeld ved slutt', (p) => p.summary.debtEnd],
    ['Netto formue ved slutt', (p) => p.summary.netWorthEnd],
    ['Skatt på kapital totalt', (p) => p.summary.totalInterestTax + p.summary.totalWealthTax + p.summary.totalGainTax],
  ]
  metrics.forEach(([l, f]) => cmp.push([l, ...plans.map((p) => Math.round(f(p)))]))
  const ws0 = XLSX.utils.aoa_to_sheet(cmp)
  ws0['!cols'] = [{ wch: 42 }, { wch: 18 }, { wch: 18 }, { wch: 18 }]
  fmt(ws0)
  XLSX.utils.book_append_sheet(wb, ws0, sheetName('Sammenligning', used))

  store.scenarios.forEach((sc, i) => {
    const plan = plans[i]
    const head = ['', ...plan.years.map((y) => y.year)]
    const rows = [[sc.name], head, ['Alder 31.12', ...plan.years.map((y) => y.age ?? '')], ['Rente hovedkonto', ...plan.years.map((y) => pctS(y.rate))]]
    SECTIONS.forEach((s) => {
      rows.push([s.title])
      s.rows.filter((r) => !r.hide || plan.years.some((y) => Math.abs(r.f(y)) > 0.5)).forEach((r) => rows.push([r.l.trim(), ...plan.years.map((y) => Math.round(r.f(y)))]))
    })
    if (plan.warnings.length) { rows.push([], ['Advarsler']); plan.warnings.forEach((w) => rows.push([w])) }
    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [{ wch: 52 }, ...plan.years.map(() => ({ wch: 13 }))]
    fmt(ws)
    XLSX.utils.book_append_sheet(wb, ws, sheetName(`År ${sc.name}`, used))
    const wi = XLSX.utils.aoa_to_sheet([[sc.name + ': inndata'], [], ...inputRows(sc.data)])
    wi['!cols'] = [{ wch: 34 }, { wch: 30 }, { wch: 22 }, { wch: 18 }, { wch: 16 }, { wch: 36 }, { wch: 16 }, { wch: 14 }]
    fmt(wi)
    XLSX.utils.book_append_sheet(wb, wi, sheetName(`Inndata ${sc.name}`, used))
  })
  XLSX.writeFile(wb, 'Papp.xlsx')
}

// Lagrer tekst som fil i nettleseren (fungerer også i Safari på Mac og iPhone).
export function downloadText(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
