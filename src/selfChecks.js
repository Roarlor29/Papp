// Selvtester som kjøres hver gang appen åpnes. Resultatet står i nettleserens konsoll (F12).
import { tax2027 } from './engineV2.js'
import { runPlan, planSpan } from './engine.js'
import {
  DEFAULTS, sanitize, sanitizeStore, freshStore, encodeStore, decodeAny, backupText, parseBackup, fromLegacyData, clampField,
} from './state.js'
import { DEFAULTS as OLD, freshStore as oldFreshStore, encodeStore as oldEncode } from './legacy/oldState.js'

const plan = (over = {}) => runPlan(sanitize({ ...DEFAULTS, ...over }))
const noNaN = (o) => JSON.stringify(o, (k, v) => (typeof v === 'number' && !Number.isFinite(v) ? 'NaN' : v)).indexOf('"NaN"') < 0

export function runSelfChecks() {
  const cases = [
    { name: 'skatt: ingen inntekt gir ingen skatt', run: () => tax2027({}).total, expect: 0 },
    { name: 'skatt: lønn 75 000 gir 7,6 % trygdeavgift', run: () => Math.round(tax2027({ salary: 75000 }).total), expect: 5700 },
    { name: 'grenser: negative beløp blir 0', run: () => clampField('x', -5), expect: 0 },
    { name: 'standardplan: ingen NaN og 10 år', run: () => { const p = plan(); return noNaN(p) && p.years.length === 10 }, expect: true },
    { name: 'rente: 1 mill i 4 % uten uttak gir 40 000 i første år', run: () => Math.round(plan({ accounts: [{ id: 1, type: 'konto', name: 'K', value: 1000000, rate: 0.04, main: true }], incomes: [], advanceShare: 0, yr: { 2027: { withdrawal: 0 } } }).years[0].interest), expect: 40000 },
    { name: 'fond: 1 mill med 5 % vokser til 1 050 000 uten salg', run: () => Math.round(plan({ accounts: [{ id: 1, type: 'konto', name: 'K', value: 0, rate: 0, main: true }, { id: 2, type: 'fond', name: 'F', value: 1000000, rate: 0.05 }], incomes: [] }).years[0].fondClose), expect: 1050000 },
    {
      name: 'fond: salg 1. juli gir gevinstskatt på gevinsten',
      run: () => {
        const p = plan({ accounts: [{ id: 1, type: 'konto', name: 'K', value: 0, rate: 0, main: true }, { id: 2, type: 'fond', name: 'F', value: 1000000, rate: 0.05, cost: 800000, sellDate: '2027-07-01' }], incomes: [] })
        const proceeds = 1000000 * (1 + 0.05 * 181 / 365)
        return Math.round(p.years[0].gainTax) === Math.round(0.3784 * (proceeds - 800000)) && Math.round(p.years[0].fundSaleIn) === Math.round(proceeds)
      }, expect: true,
    },
    { name: 'gjeld: avdrag 10 000 per måned uten rente gir 1 080 000 etter første år', run: () => Math.round(plan({ debts: [{ id: 1, name: 'L', amount: 1200000, rate: 0, mode: 'avdrag', monthly: 10000, settleDate: '' }], accounts: [{ id: 1, type: 'konto', name: 'K', value: 5000000, rate: 0, main: true }], incomes: [] }).years[0].debtClose), expect: 1080000 },
    { name: 'gjeld: avdragsfritt lån står uendret', run: () => Math.round(plan({ debts: [{ id: 1, name: 'L', amount: 1200000, rate: 0.05, mode: 'avdragsfritt', monthly: 0, settleDate: '' }], incomes: [] }).years[3].debtClose), expect: 1200000 },
    {
      name: 'gjeld: boligsalg innfrir valgt gjeld og setter netto på konto',
      run: () => {
        const p = plan({
          accounts: [{ id: 1, type: 'konto', name: 'K', value: 0, rate: 0, main: true }], incomes: [], advanceShare: 0, yr: { 2027: { withdrawal: 0 }, 2028: { withdrawal: 0 } },
          debts: [{ id: 1, name: 'Boliglån', amount: 3000000, rate: 0, mode: 'avdragsfritt', monthly: 0, settleDate: '' }],
          homes: [{ id: 1, kind: 'sale', label: 'Salg', date: '2027-03-01', buffer: 0, price: 8000000, costs: 100000, settleDebtIds: [1], gainTaxFree: true, landTaxable: false }],
        })
        return Math.round(p.years[0].closeMain) === 4900000 && Math.round(p.years[0].debtClose) === 0
      }, expect: true,
    },
    { name: 'inntekt: 10 000 i tre måneder gir 30 000 brutto', run: () => Math.round(plan({ incomes: [{ id: 1, kind: 'lønn', name: 'L', payer: '', monthly: 10000, start: '2027-01-01', end: '2027-04-01', growth: 0 }] }).years[0].salary), expect: 30000 },
    { name: 'inntekt: to arbeidsgivere summeres', run: () => Math.round(plan({ incomes: [{ id: 1, kind: 'lønn', name: 'A', payer: '', monthly: 10000, start: '2027-01-01', end: '', growth: 0 }, { id: 2, kind: 'lønn', name: 'B', payer: '', monthly: 5000, start: '2027-01-01', end: '', growth: 0 }] }).years[0].salary), expect: 180000 },
    { name: 'trekk: tabell gir ingen restskatt på lønn', run: () => Math.round(plan({ incomes: [{ id: 1, kind: 'lønn', name: 'A', payer: '', monthly: 40000, start: '2027-01-01', end: '', growth: 0, wMethod: 'tabell' }] }).years[0].labourRest), expect: 0 },
    { name: 'trekk: 20 % på 480 000 brutto trekker 96 000', run: () => Math.round(plan({ incomes: [{ id: 1, kind: 'lønn', name: 'A', payer: '', monthly: 40000, start: '2027-01-01', end: '', growth: 0, wMethod: 'prosent', wPct: 0.2 }] }).years[0].trekk), expect: 96000 },
    { name: 'trekk: for lavt trekk gir restskatt som betales året etter', run: () => { const p = plan({ incomes: [{ id: 1, kind: 'lønn', name: 'A', payer: '', monthly: 40000, start: '2027-01-01', end: '', growth: 0, wMethod: 'prosent', wPct: 0.1 }] }); return p.years[0].labourRest > 0 && p.years[1].restPaid > 0 }, expect: true },
    { name: 'trekk: år 1 tabell og år 2 prosent kan kombineres', run: () => { const p = plan({ incomes: [{ id: 1, kind: 'lønn', name: 'A', payer: '', monthly: 40000, start: '2027-01-01', end: '', growth: 0, wMethod: 'tabell' }], yr: { 2028: { wm: { 1: 'prosent' }, wp: { 1: 0.25 } } } }); return Math.round(p.years[1].trekk) === 120000 && Math.round(p.years[0].labourRest) === 0 }, expect: true },
    { name: 'planløp: født 1930 gir maks 3 år fra 2027 (aldri forbi 99 år)', run: () => { const s = planSpan(sanitize({ birth: '1930-01-01', start: '2027-01-01', years: 30 })); return s.years === 3 && s.capped }, expect: true },
    { name: 'planløp: 1 år er laveste verdi', run: () => plan({ years: 0 }).years.length, expect: 1 },
    { name: 'planløp: 25 år gir 25 årsrader', run: () => plan({ years: 25, birth: '1960-01-01' }).years.length, expect: 25 },
    { name: 'sparemål: 1 mill igjen gir nøyaktig det målet etter skatt', run: () => Math.round(plan({ targetEnabled: true, targetClosing: 1000000 }).summary.closingAfterTax), expect: 1000000 },
    { name: 'Eiendomsalg-overføring: standardscenario gir samme sluttkapital (4 812 500)', run: () => Math.round(runPlan(fromLegacyData(OLD)).summary.closingAfterTax), expect: 4812500 },
    {
      name: 'opprydding: søppeldata krasjer ikke og gir gyldig plan',
      run: () => {
        const bad = sanitize({ accounts: [{ id: 'x', value: 'abc', rate: -5, type: 'ugyldig' }, null, 7], debts: [{ amount: 1e300, mode: 5 }], homes: 'nei', incomes: [{ monthly: NaN, start: 'i går' }], years: 9999, birth: 'feil', yr: { 2030: { rate: 'a', inc: { 1: 'x' } } } })
        return noNaN(runPlan(bad))
      }, expect: true,
    },
    { name: 'lagring: kode → tilbake gir samme scenarioer', run: () => { const st = freshStore(); st.scenarios[1].data.years = 15; st.scenarios[1].data.accounts[0].name = 'Æ Ø Å'; st.chosen = 2; const b = decodeAny('https://x.no/Papp/#d=' + encodeStore(st)); return !!b && !b.legacy && b.store.scenarios[1].data.years === 15 && b.store.scenarios[1].data.accounts[0].name === 'Æ Ø Å' && b.store.chosen === 2 && b.store.scenarios[0].data.years === 10 }, expect: true },
    { name: 'lagring: sikkerhetskopifil → tilbake gir samme scenarioer', run: () => { const st = freshStore(); st.scenarios[2].name = 'Plan C'; st.scenarios[2].data.debts = [{ id: 1, name: 'Lån', account: '', collateral: '', amount: 500000, rate: 0.05, mode: 'fast', monthly: 6000, settleDate: '' }]; const b = parseBackup(backupText(st)); return !!b && b.scenarios[2].name === 'Plan C' && b.scenarios[2].data.debts[0].monthly === 6000 }, expect: true },
    { name: 'lagring: ugyldig kode og fil avvises', run: () => decodeAny('hei på deg') === null && decodeAny('PA1.%%%') === null && parseBackup('{"x":1}') === null, expect: true },
    { name: 'overføring fra Eiendomsalg: EA1-kode gjenkjennes', run: () => { const d = decodeAny(oldEncode(oldFreshStore())); return !!d && d.legacy && d.store.scenarios.length === 3 }, expect: true },
    { name: 'lagring: valgt scenario åpnes først', run: () => sanitizeStore({ scenarios: [], chosen: 3, active: 1 }).active, expect: 3 },
  ]

  const results = cases.map((c) => {
    let actual, ok, err = null
    try {
      actual = c.run()
      ok = typeof c.expect === 'boolean' ? actual === c.expect : Math.abs(actual - c.expect) < 1
    } catch (e) { err = e.message; ok = false }
    return { Test: c.name, OK: ok, Forventet: c.expect, Fikk: err ? `Feil: ${err}` : actual }
  })
  const allOk = results.every((r) => r.OK)
  if (allOk) console.log('%cPapp: alle selvtester OK ✓', 'color:#2f6f5e;font-weight:bold')
  else console.warn('Papp: en eller flere selvtester feilet. Se tabell:')
  console.table(results)
  return allOk
}
