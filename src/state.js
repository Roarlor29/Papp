// Standardverdier, grenser, opprydding av lagrede data og lagring i nettleseren (localStorage).
// Alt brukeren skriver inn lagres på denne enheten. Ingenting sendes til noen server.
import { decodeStore as decodeLegacyStore } from './legacy/oldState.js'

export const STORE_KEY = 'papp-v1-scenarios'
const LEGACY_BROWSER_KEY = 'eiendomsalg-v4-scenarios' // samme nettleser-opprinnelse som Eiendomsalg-appen
export const MAX_NAME = 30
export const MAX_AGE = 99
export const MAX_YEARS = 70

export const ACCOUNT_TYPES = [
  { value: 'konto', label: 'Bankkonto / innskudd' },
  { value: 'fond', label: 'Fond' },
  { value: 'aksjer', label: 'Aksjer' },
  { value: 'annet', label: 'Annen formue (ikke likvid)' },
]
export const DEBT_MODES = [
  { value: 'avdragsfritt', label: 'Avdragsfritt (bare renter betales)' },
  { value: 'avdrag', label: 'Fast avdrag per måned (pluss renter)' },
  { value: 'fast', label: 'Fast beløp per måned (renter og avdrag)' },
  { value: 'innfrielse', label: 'Full innfrielse på en dato (renter betales frem til da)' },
]
export const HOME_KINDS = [
  { value: 'owned', label: 'Bolig jeg eier ved start' },
  { value: 'sale', label: 'Boligsalg' },
  { value: 'purchase', label: 'Boligkjøp' },
]
export const INCOME_KINDS = [
  { value: 'lønn', label: 'Lønn' },
  { value: 'folketrygd', label: 'Folketrygd (alderspensjon)' },
  { value: 'tjenestepensjon', label: 'Tjenestepensjon' },
  { value: 'pensjon', label: 'Annen pensjon (AFP, IPS m.m.)' },
]

export const TAX_DEFAULTS = {
  personfradrag: 114540, trygdeLonn: 0.076, trygdePensjon: 0.051,
  mfLonnSats: 0.46, mfLonnTak: 95700, mfPensjonSats: 0.4, mfPensjonTak: 75400, fellesskattSats: 0.22,
  pensionCreditMax: 37100, pensionStep1: 284950, pensionStep2: 436050, pensionRate1: 0.167, pensionRate2: 0.06,
  trinn1Fra: 226100, trinn1Sats: 0.017, trinn2Fra: 318300, trinn2Sats: 0.04, trinn3Fra: 725050, trinn3Sats: 0.137,
  trinn4Fra: 980100, trinn4Sats: 0.168, trinn5Fra: 1467200, trinn5Sats: 0.178,
  formueBunnfradrag: 1900000, formueTrinn2Bredde: 19600000, formueSats1: 0.01, formueSats2: 0.011,
  primaerboligTak: 14000000, primaerboligSatsUnder: 0.25, primaerboligSatsOver: 0.7,
  valFond: 0.8, valAksjer: 0.8, fondGainRate: 0.3784,
}

export const DEFAULTS = {
  birth: '1960-01-01', start: '2027-01-01', years: 10, joint: false,
  inflation: 0.025, autoWithdraw: true, tjenesteCredit: false,
  targetEnabled: false, targetClosing: 1000000,
  advanceShare: 1, advanceMonth: 9, taxPaymentMonth: 8, taxAuthorityRate: 0.0312,
  accounts: [
    { id: 1, type: 'konto', name: 'Sparekonto', institution: '', value: 2000000, rate: 0.04, cost: 0, sellDate: '', main: true },
  ],
  debts: [],
  homes: [],
  incomes: [
    { id: 1, kind: 'folketrygd', name: 'Folketrygd', payer: 'NAV', monthly: 25000, start: '2027-01-01', end: '', growth: 0.025 },
  ],
  payouts: [],
  yr: {},
  ...TAX_DEFAULTS,
}

const RATE = { min: 0, max: 2 }
export const CLAMP = {
  inflation: { min: 0, max: 1 }, taxAuthorityRate: RATE, advanceShare: { min: 0, max: 1 },
  advanceMonth: { min: 1, max: 12 }, taxPaymentMonth: { min: 1, max: 12 },
  trygdeLonn: RATE, trygdePensjon: RATE, mfLonnSats: RATE, mfPensjonSats: RATE, fellesskattSats: RATE,
  pensionRate1: RATE, pensionRate2: RATE, formueSats1: RATE, formueSats2: RATE,
  primaerboligSatsUnder: RATE, primaerboligSatsOver: RATE, valFond: RATE, valAksjer: RATE, fondGainRate: { min: 0, max: 1 },
  trinn1Sats: RATE, trinn2Sats: RATE, trinn3Sats: RATE, trinn4Sats: RATE, trinn5Sats: RATE,
  years: { min: 1, max: MAX_YEARS },
}
export const MAX_MONEY = 1e11
export const clampMoney = (v) => Math.min(MAX_MONEY, Math.max(0, v))
export const clampField = (key, v) => {
  const c = CLAMP[key]
  if (!c) return clampMoney(v)
  return Math.min(c.max, Math.max(c.min, v))
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
const str = (v, max, d = '') => (typeof v === 'string' ? v.slice(0, max) : d)
const oneOf = (v, list, d) => (list.some((x) => x.value === v) ? v : d)

// Skjema for postene i listene. money = kroner, rate = brøk (0,04 = 4 %), dateOpt = dato eller tomt.
const SCHEMAS = {
  accounts: { max: 20, fields: {
    type: 'enum:' + ACCOUNT_TYPES.map((x) => x.value), name: 'str:40', institution: 'str:40',
    value: 'money', rate: 'rate', cost: 'money', sellDate: 'dateOpt', main: 'bool',
  }, defaults: { type: 'konto', name: 'Konto', institution: '', value: 0, rate: 0.03, cost: 0, sellDate: '', main: false } },
  debts: { max: 20, fields: {
    name: 'str:40', account: 'str:40', collateral: 'str:60', amount: 'money', rate: 'rate',
    mode: 'enum:' + DEBT_MODES.map((x) => x.value), monthly: 'money', settleDate: 'dateOpt',
  }, defaults: { name: 'Lån', account: '', collateral: '', amount: 0, rate: 0.05, mode: 'avdragsfritt', monthly: 0, settleDate: '' } },
  homes: { max: 20, fields: {
    kind: 'enum:' + HOME_KINDS.map((x) => x.value), label: 'str:40', date: 'dateOpt', marketValue: 'money',
    price: 'money', costs: 'money', buffer: 'int:0:365', sellId: 'int:0:1000000', settleDebtIds: 'ids',
    docFee: 'bool', docFeeRate: 'rate', improvements: 'money',
    land: 'money', landCost: 'money', landImprovements: 'money', landTaxable: 'bool',
    purchaseValue: 'money', acquisitionCosts: 'money', propertyImprovements: 'money', gainTaxFree: 'bool',
  }, defaults: {
    kind: 'sale', label: 'Bolig', date: '', marketValue: 0, price: 0, costs: 0, buffer: 14, sellId: 0, settleDebtIds: [],
    docFee: true, docFeeRate: 0.025, improvements: 0, land: 0, landCost: 0, landImprovements: 0, landTaxable: true,
    purchaseValue: 0, acquisitionCosts: 0, propertyImprovements: 0, gainTaxFree: true,
  } },
  incomes: { max: 20, fields: {
    kind: 'enum:' + INCOME_KINDS.map((x) => x.value), name: 'str:40', payer: 'str:40', monthly: 'money',
    start: 'date', end: 'dateOpt', growth: 'rate',
  }, defaults: { kind: 'pensjon', name: 'Inntekt', payer: '', monthly: 0, start: '2027-01-01', end: '', growth: 0.025 } },
  payouts: { max: 30, fields: { label: 'str:60', date: 'date', amount: 'money' },
    defaults: { label: 'Utbetaling', date: '2027-06-01', amount: 0 } },
}

function cleanField(spec, v, def) {
  const [t, a, b] = spec.split(':')
  switch (t) {
    case 'str': return str(v, Number(a), def)
    case 'money': return isNum(v) ? clampMoney(v) : def
    case 'rate': return isNum(v) ? Math.min(2, Math.max(0, v)) : def
    case 'date': return isDate(v) ? v : def
    case 'dateOpt': return v === '' || v === null || v === undefined ? '' : isDate(v) ? v : def
    case 'bool': return typeof v === 'boolean' ? v : def
    case 'int': return isNum(v) ? Math.min(Number(b), Math.max(Number(a), Math.round(v))) : def
    case 'ids': return Array.isArray(v) ? [...new Set(v.filter((x) => isNum(x)).map(Math.round))].slice(0, 20) : def
    case 'enum': return a.split(',').includes(v) ? v : def
    default: return def
  }
}

function cleanList(name, raw) {
  const sch = SCHEMAS[name]
  if (!Array.isArray(raw)) return null
  const seen = new Set()
  const out = []
  raw.slice(0, sch.max).forEach((r, i) => {
    if (!r || typeof r !== 'object') return
    const item = {}
    let id = isNum(r.id) ? Math.round(r.id) : i + 1
    while (seen.has(id)) id += 1
    seen.add(id)
    item.id = id
    for (const [k, spec] of Object.entries(sch.fields)) item[k] = cleanField(spec, r[k], sch.defaults[k])
    out.push(item)
  })
  return out
}

export function sanitize(raw) {
  const out = JSON.parse(JSON.stringify(DEFAULTS))
  if (!raw || typeof raw !== 'object') return out
  for (const key of Object.keys(DEFAULTS)) {
    if (!(key in raw) || ['accounts', 'debts', 'homes', 'incomes', 'payouts', 'yr'].includes(key)) continue
    const def = DEFAULTS[key], v = raw[key]
    if (typeof def === 'number' && isNum(v)) out[key] = key === 'years' ? Math.round(clampField(key, v)) : clampField(key, v)
    else if (typeof def === 'boolean' && typeof v === 'boolean') out[key] = v
    else if (typeof def === 'string' && isDate(v)) out[key] = v
  }
  for (const name of Object.keys(SCHEMAS)) {
    const list = cleanList(name, raw[name])
    if (list) out[name] = list
  }
  // Minst én hovedkonto: hvis ingen er merket, brukes den første bankkontoen.
  const kontos = out.accounts.filter((a) => a.type === 'konto')
  if (kontos.length && !kontos.some((a) => a.main)) kontos[0].main = true
  if (kontos.filter((a) => a.main).length > 1) { let f = false; kontos.forEach((a) => { if (a.main && f) a.main = false; if (a.main) f = true }) }
  if (raw.yr && typeof raw.yr === 'object') {
    for (const [y, o] of Object.entries(raw.yr)) {
      if (!/^\d{4}$/.test(y) || !o || typeof o !== 'object') continue
      const clean = {}
      if (isNum(o.rate)) clean.rate = Math.min(2, Math.max(0, o.rate))
      if (isNum(o.withdrawal)) clean.withdrawal = clampMoney(o.withdrawal)
      if (o.inc && typeof o.inc === 'object') {
        const inc = {}
        for (const [id, v] of Object.entries(o.inc)) if (/^\d+$/.test(id) && isNum(v)) inc[id] = clampMoney(v)
        if (Object.keys(inc).length) clean.inc = inc
      }
      if (Object.keys(clean).length) out.yr[y] = clean
    }
  }
  return out
}

export const freshState = () => sanitize(null)
export const newItem = (name, list, extra = {}) => ({
  ...JSON.parse(JSON.stringify(SCHEMAS[name].defaults)),
  id: Math.max(0, ...list.map((x) => x.id)) + 1,
  ...extra,
})
export const MAX_ITEMS = Object.fromEntries(Object.entries(SCHEMAS).map(([k, v]) => [k, v.max]))

// ---------------------------------------------------------------------------
// Tre uavhengige scenarioer. «chosen» er scenarioet brukeren har valgt som sitt.
// ---------------------------------------------------------------------------
const SCENARIO_IDS = [1, 2, 3]
const DEFAULT_NAMES = { 1: 'Scenario A', 2: 'Scenario B', 3: 'Scenario C' }
const deepCopy = (o) => JSON.parse(JSON.stringify(o))
export const copyScenarioData = (data) => deepCopy(data)

export const freshStore = () => ({
  v: 1,
  scenarios: SCENARIO_IDS.map((id) => ({ id, name: DEFAULT_NAMES[id], data: sanitize(null) })),
  chosen: null,
  active: 1,
})

export function sanitizeStore(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.scenarios)) return freshStore()
  const scenarios = SCENARIO_IDS.map((id) => {
    const found = raw.scenarios.find((s) => s && typeof s === 'object' && s.id === id)
    const name = found && typeof found.name === 'string' ? found.name.trim().slice(0, MAX_NAME) : ''
    return { id, name: name || DEFAULT_NAMES[id], data: sanitize(found ? found.data : null) }
  })
  const chosen = SCENARIO_IDS.includes(raw.chosen) ? raw.chosen : null
  const active = chosen ?? (SCENARIO_IDS.includes(raw.active) ? raw.active : 1)
  return { v: 1, scenarios, chosen, active }
}

export function loadStore() {
  try {
    const cur = localStorage.getItem(STORE_KEY)
    if (cur) return sanitizeStore(JSON.parse(cur))
  } catch { /* ingen lagring tilgjengelig – bruk standardverdier */ }
  return freshStore()
}
export const hasSavedStore = () => { try { return !!localStorage.getItem(STORE_KEY) } catch { return false } }
export function saveStore(store) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)) } catch { /* ignorer */ }
}
export function clearAll() {
  try { localStorage.removeItem(STORE_KEY) } catch { /* ignorer */ }
}

// ---------------------------------------------------------------------------
// Overføring og sikkerhetskopi. Koden inneholder bare felt som avviker fra standardverdiene.
// ---------------------------------------------------------------------------
const CODE_PREFIX = 'PA1.'
const toB64 = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const fromB64 = (b) => decodeURIComponent(escape(atob(b.replace(/-/g, '+').replace(/_/g, '/'))))

export function encodeStore(store) {
  const slim = {
    v: 1, chosen: store.chosen, active: store.active,
    scenarios: store.scenarios.map((sc) => {
      const d = {}
      for (const k of Object.keys(DEFAULTS)) {
        if (['accounts', 'debts', 'homes', 'incomes', 'payouts', 'yr'].includes(k)) continue
        if (sc.data[k] !== DEFAULTS[k]) d[k] = sc.data[k]
      }
      for (const k of ['accounts', 'debts', 'homes', 'incomes', 'payouts', 'yr']) d[k] = sc.data[k]
      return { id: sc.id, name: sc.name, data: d }
    }),
  }
  return CODE_PREFIX + toB64(JSON.stringify(slim))
}

// Tar imot kode, hel lenke (#d=...) eller kode fra Eiendomsalg (EA1.). Null hvis ugyldig.
export function decodeAny(text) {
  try {
    let t = String(text || '').trim()
    const i = t.indexOf('#d=')
    if (i >= 0) t = t.slice(i + 3)
    t = t.replace(/\s+/g, '')
    if (t.startsWith(CODE_PREFIX)) {
      const raw = JSON.parse(fromB64(t.slice(CODE_PREFIX.length)))
      if (!raw || !Array.isArray(raw.scenarios)) return null
      return { store: sanitizeStore(raw), legacy: false }
    }
    if (t.startsWith('EA1.')) {
      const old = decodeLegacyStore(t)
      return old ? { store: fromLegacyStore(old), legacy: true } : null
    }
    return null
  } catch { return null }
}
export const decodeStore = (text) => decodeAny(text)?.store ?? null

// Sikkerhetskopi som fil (JSON) og innlesing av slik fil.
export function backupText(store) {
  return JSON.stringify({ app: 'Papp', version: 1, saved: new Date().toISOString(), store }, null, 2)
}
export function parseBackup(text) {
  try {
    const raw = JSON.parse(text)
    if (!raw || raw.app !== 'Papp' || !raw.store) return null
    return sanitizeStore(raw.store)
  } catch { return null }
}

// ---------------------------------------------------------------------------
// Overføring fra Eiendomsalg (forrige app). Hvert gamle scenario gjøres om til nye poster.
// ---------------------------------------------------------------------------
const addMonthsStr = (s, n) => {
  const [y, m, d] = s.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1 + n, 1))
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate()
  const dd = Math.min(d, last)
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
}

export function fromLegacyData(d) {
  const raw = {
    start: '2027-01-01', years: 10, joint: !!d.jointTaxation,
    inflation: d.inflation, tjenesteCredit: !!d.tjenesteCredit,
    targetEnabled: !!d.targetEnabled, targetClosing: d.targetClosing,
    advanceShare: d.advanceShare, advanceMonth: d.advanceMonth, taxPaymentMonth: d.taxPaymentMonth, taxAuthorityRate: d.taxAuthorityRate,
  }
  for (const k of Object.keys(TAX_DEFAULTS)) if (k in d) raw[k] = d[k]
  raw.accounts = [{ id: 1, type: 'konto', name: 'Hovedkonto', institution: '', value: 0, rate: d.rate, cost: 0, sellDate: '', main: true }]
  if (d.otherAssets > 0) raw.accounts.push({ id: 2, type: 'annet', name: 'Andre eiendeler', institution: '', value: d.otherAssets, rate: 0, cost: 0, sellDate: '', main: false })
  raw.debts = []
  if (d.debt > 0) raw.debts.push({ id: 1, name: 'Gjeld som innfris ved salg', account: '', collateral: 'Solgt eiendom', amount: d.debt, rate: 0, mode: 'innfrielse', monthly: 0, settleDate: '' })
  if (d.otherDebt > 0) raw.debts.push({ id: 2, name: 'Annen gjeld', account: '', collateral: '', amount: d.otherDebt, rate: 0, mode: 'avdragsfritt', monthly: 0, settleDate: '' })
  raw.homes = [{
    id: 1, kind: 'sale', label: 'Salg av bolig/eiendom', date: d.sale, buffer: d.buffer, price: d.total, costs: d.saleCost,
    sellId: 0, settleDebtIds: d.debt > 0 ? [1] : [], land: d.land, landCost: d.landCost, landImprovements: d.landImprovements,
    landTaxable: !!d.landTaxable, purchaseValue: d.purchaseTotal, acquisitionCosts: d.acquisitionCosts,
    propertyImprovements: d.propertyImprovements, gainTaxFree: !!d.residenceGainTaxFree,
  }]
  if (d.homePrice > 0) {
    raw.homes.push({
      id: 2, kind: 'purchase', label: 'Ny bolig', date: d.homeDate, price: d.homePrice, marketValue: d.homePrice,
      docFee: !!d.homeDocFee, docFeeRate: d.homeDocFeeRate, costs: d.homeCosts, improvements: d.homeImprovements,
    })
  }
  raw.incomes = []
  let id = 1
  const idOf = {}
  if (d.salary > 0 && d.salaryMonths > 0) {
    idOf.salary = id
    raw.incomes.push({ id: id++, kind: 'lønn', name: 'Lønn', payer: '', monthly: d.salary, start: '2027-01-01', end: addMonthsStr('2027-01-01', Math.round(d.salaryMonths)), growth: d.pensionGrowth })
  }
  idOf.folk = id
  raw.incomes.push({ id: id++, kind: 'folketrygd', name: 'Folketrygd', payer: 'NAV', monthly: d.folkMonthly, start: d.folkStart, end: '', growth: d.pensionGrowth })
  idOf.tjeneste = id
  raw.incomes.push({ id: id++, kind: 'tjenestepensjon', name: 'Tjenestepensjon', payer: '', monthly: d.tjenesteMonthly, start: d.tjenesteStart, end: '', growth: d.pensionGrowth })
  raw.payouts = (d.payouts || []).map((p) => ({ id: p.id, label: p.label, date: p.date, amount: p.amount }))
  raw.yr = {}
  for (const [y, o] of Object.entries(d.yr || {})) {
    const n = {}
    if (typeof o.rate === 'number') n.rate = o.rate
    if (typeof o.withdrawal === 'number') n.withdrawal = o.withdrawal
    const inc = {}
    if (typeof o.folk === 'number') inc[idOf.folk] = o.folk
    if (typeof o.tjeneste === 'number') inc[idOf.tjeneste] = o.tjeneste
    if (Object.keys(inc).length) n.inc = inc
    if (Object.keys(n).length) raw.yr[y] = n
  }
  return sanitize(raw)
}

export function fromLegacyStore(old) {
  return sanitizeStore({
    scenarios: old.scenarios.map((sc) => ({ id: sc.id, name: sc.name, data: fromLegacyData(sc.data) })),
    chosen: old.chosen, active: old.active,
  })
}

// Finner lagrede Eiendomsalg-scenarioer i denne nettleseren (de to appene deler lagring på github.io).
export function readLegacyFromBrowser() {
  try {
    const t = localStorage.getItem(LEGACY_BROWSER_KEY)
    if (!t) return null
    const raw = JSON.parse(t)
    if (!raw || !Array.isArray(raw.scenarios)) return null
    // Eiendomsalg lagrer ferdig ryddede data; vi lar den gamle ryddefunksjonen kjøre en gang til via kodevegen.
    const code = 'EA1.' + toB64(JSON.stringify(raw))
    const old = decodeLegacyStore(code)
    return old ? fromLegacyStore(old) : null
  } catch { return null }
}
