// Regnemotor for Papp. Følger sparekapital, gjeld, bolig, inntekter og skatt dag for dag
// gjennom et planløp på 1–70 år (men aldri forbi 99 år).
//
// Prinsipper:
//  - Bankkontoer tjener enkel rente per dag på det som faktisk står på kontoen, og rentene krediteres 31.12.
//    Hendelser (salg, kjøp, utbetalinger, gjeldsbetaling, uttak) går via hovedkontoen.
//  - Fond og aksjer vokser med forventet avkastning (urealisert) og skattlegges først når posten selges.
//  - Gjeld har rente per dag. Renter og avdrag betales fra hovedkontoen den 15. hver måned. Rentene gir rentefradrag.
//  - Skatt regnes per inntektsår med dagens regler (alle satser kan endres i appen).
//    Skatt på lønn og pensjon trekkes fra inntektene. Skatt på renter, gevinst og formue betales fra kapitalen:
//    en andel som forskuddsskatt i inntektsåret, resten som restskatt året etter.
//  - Fordi skatt og uttak avhenger av årets renter, og rentene av hva som er betalt og tatt ut,
//    løses hvert år iterativt til tallene stabiliserer seg.
import { tax2027, wealthTax2027, primaryResidenceTaxValue } from './engineV2.js'
import { MAX_AGE, MAX_YEARS } from './state.js'

const DAY = 86400000
const dn = (y, m, d) => Date.UTC(y, m - 1, d) / DAY
export const dayToDate = (n) => new Date(n * DAY)
const yearOfDay = (n) => dayToDate(n).getUTCFullYear()
export function parseDay(s, fallback = null) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''))
  if (!m) return fallback
  const n = dn(+m[1], +m[2], +m[3])
  return Number.isFinite(n) ? n : fallback
}
const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
const daysInYear = (y) => (isLeap(y) ? 366 : 365)
const dim = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate()
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d }
const has = (v) => typeof v === 'number' && Number.isFinite(v)
// Kalendermåned som brøk: 1. januar = år*12, 16. januar = år*12 + 15/31 osv.
const mfrac = (n) => { const d = dayToDate(n); return d.getUTCFullYear() * 12 + d.getUTCMonth() + (d.getUTCDate() - 1) / dim(d.getUTCFullYear(), d.getUTCMonth() + 1) }
const monthsBetween = (a, b) => Math.max(0, mfrac(b) - mfrac(a))

function taxParams(g) {
  return {
    personfradrag: g.personfradrag,
    trinn: [1, 2, 3, 4, 5].map((i) => ({ fra: g['trinn' + i + 'Fra'], sats: g['trinn' + i + 'Sats'] })),
    trygdeLonn: g.trygdeLonn, trygdePensjon: g.trygdePensjon,
    mfLonnSats: g.mfLonnSats, mfLonnTak: g.mfLonnTak, mfPensjonSats: g.mfPensjonSats, mfPensjonTak: g.mfPensjonTak,
    fellesskattSats: g.fellesskattSats,
    pensionCreditMax: g.pensionCreditMax, pensionStep1: g.pensionStep1, pensionStep2: g.pensionStep2,
    pensionRate1: g.pensionRate1, pensionRate2: g.pensionRate2,
  }
}
const wealthParams = (g) => ({ bunnfradragSingle: g.formueBunnfradrag, trinn2BreddeSingle: g.formueTrinn2Bredde, sats1: g.formueSats1, sats2: g.formueSats2 })
const homeParams = (g) => ({ tak: g.primaerboligTak, satsUnder: g.primaerboligSatsUnder, satsOver: g.primaerboligSatsOver })

// Planens lengde: valgt antall år, men siste år kan ikke gå forbi 99 år.
export function planSpan(g) {
  const startDay = parseDay(g.start, dn(2027, 1, 1))
  const startYear = yearOfDay(startDay)
  const birthDay = parseDay(g.birth, null)
  const requested = Math.min(MAX_YEARS, Math.max(1, Math.round(num(g.years, 10))))
  let ageAtStart = null, maxYears = MAX_YEARS
  if (birthDay !== null) {
    const b = dayToDate(birthDay), s = dayToDate(startDay)
    ageAtStart = s.getUTCFullYear() - b.getUTCFullYear() - (s.getUTCMonth() < b.getUTCMonth() || (s.getUTCMonth() === b.getUTCMonth() && s.getUTCDate() < b.getUTCDate()) ? 1 : 0)
    maxYears = Math.max(1, b.getUTCFullYear() + MAX_AGE - startYear + 1)
  }
  const years = Math.min(requested, maxYears, MAX_YEARS)
  return {
    startDay, startYear, birthYear: birthDay === null ? null : yearOfDay(birthDay), ageAtStart, requested,
    maxYears: Math.min(maxYears, MAX_YEARS), years, capped: years < requested,
  }
}

// ---- Gjeldsplan: renter og avdrag for hver gjeld, uavhengig av resten av planen ----
function debtSchedule(debt, startDay, endDay, settleDay) {
  const events = []
  let bal = Math.max(0, num(debt.amount))
  if (bal <= 0) return { events, balAfter: () => 0 }
  const rate = num(debt.rate)
  const own = debt.mode === 'innfrielse' ? parseDay(debt.settleDate, null) : null
  const settleAt = [own, settleDay].filter((d) => d !== null && d >= startDay && d < endDay).sort((a, b) => a - b)[0] ?? null
  let last = startDay
  const monthlyDays = []
  const sd = dayToDate(startDay)
  let yy = sd.getUTCFullYear(), mm = sd.getUTCMonth() + 1
  for (let guard = 0; guard < 900; guard++) {
    const d = dn(yy, mm, 15)
    if (d >= endDay) break
    if (d > startDay) monthlyDays.push(d)
    mm += 1
    if (mm > 12) { mm = 1; yy += 1 }
  }
  const days = monthlyDays.filter((d) => d < endDay && (settleAt === null || d < settleAt))
  if (settleAt !== null) days.push(settleAt)
  for (const d of days) {
    if (bal <= 0.005) break
    const interest = bal * rate * (d - last) / 365
    let principal = 0
    const isSettle = settleAt !== null && d === settleAt
    if (isSettle) principal = bal
    else if (debt.mode === 'avdrag') principal = Math.min(bal, num(debt.monthly))
    else if (debt.mode === 'fast') principal = Math.min(bal, Math.max(0, num(debt.monthly) - interest))
    bal -= principal
    last = d
    events.push({ day: d, interest, principal, balAfter: bal, settle: isSettle })
  }
  // Saldo ved et gitt tidspunkt (etter siste betaling før eller på dagen).
  const balAfter = (day) => {
    let b = Math.max(0, num(debt.amount))
    for (const e of events) { if (e.day <= day) b = e.balAfter; else break }
    return b
  }
  return { events, balAfter, interestAccruedAfterLast: null }
}

export function runPlanCore(g, extraMonthly = 0) {
  const warnings = []
  const span = planSpan(g)
  const { startDay, startYear, birthYear } = span
  const N = span.years
  const endDay = dn(startYear + N, 1, 1)
  if (span.capped) warnings.push(`Planløpet er kortet ned til ${N} år, fordi planen ikke kan gå forbi ${MAX_AGE} år.`)
  const tp = taxParams(g), wp = wealthParams(g), hp = homeParams(g)
  const share = Math.min(1, Math.max(0, num(g.advanceShare, 1)))
  const advMonth = Math.min(12, Math.max(1, Math.round(num(g.advanceMonth, 9))))
  const taxMonth = Math.min(12, Math.max(1, Math.round(num(g.taxPaymentMonth, 8))))
  const inflation = num(g.inflation)
  const inPlan = (d) => d !== null && d >= startDay && d < endDay

  // ---- Sparekapitalposter ----
  const accounts = (g.accounts || []).map((a) => ({
    id: a.id, type: a.type, name: a.name || 'Konto', value: Math.max(0, num(a.value)), rate: num(a.rate),
    cost: a.cost > 0 ? num(a.cost) : Math.max(0, num(a.value)), sellDay: parseDay(a.sellDate, null), main: !!a.main,
  }))
  let main = accounts.find((a) => a.type === 'konto' && a.main) || accounts.find((a) => a.type === 'konto')
  if (!main) { main = { id: -1, type: 'konto', name: 'Hovedkonto', value: 0, rate: 0, cost: 0, sellDay: null, main: true }; accounts.unshift(main) }
  const others = accounts.filter((a) => a !== main).map((a) => ({ ...a, bal: a.value, sold: false }))
  const initialLiquid = accounts.filter((a) => a.type !== 'annet').reduce((s, a) => s + a.value, 0)

  // ---- Bolig ----
  const homes = (g.homes || []).map((h) => ({ ...h, day: parseDay(h.date, null) }))
  const sales = homes.filter((h) => h.kind === 'sale')
  const purchases = homes.filter((h) => h.kind === 'purchase')
  const owned = homes.filter((h) => h.kind === 'owned')
  const settleDayOf = (h) => (h.day === null ? null : h.day + Math.max(0, num(h.buffer)))
  const saleInfo = sales.map((h) => {
    const price = num(h.price), costs = num(h.costs), land = num(h.land)
    const taxableLand = Math.max(0, Math.min(land, price))
    const allocated = costs * (price > 0 ? taxableLand / price : 0)
    const landGain = h.landTaxable ? Math.max(0, land - allocated - num(h.landCost) - num(h.landImprovements)) : 0
    const residenceGain = h.gainTaxFree ? 0
      : Math.max(0, price - land - num(h.purchaseValue) - num(h.acquisitionCosts) - num(h.propertyImprovements) - costs + allocated)
    return { h, day: h.day, settle: settleDayOf(h), price, costs, gain: landGain + residenceGain }
  })
  const purchaseInfo = purchases.map((h) => {
    const price = num(h.price)
    const docFee = h.docFee ? price * num(h.docFeeRate) : 0
    return { h, day: h.day, price, docFee, total: price + docFee + num(h.costs) + num(h.improvements) }
  })
  sales.forEach((h) => {
    if (h.day === null) warnings.push(`Boligsalget «${h.label}» mangler gyldig dato og er ikke med.`)
    else if (!inPlan(settleDayOf(h))) warnings.push(`Boligsalget «${h.label}» ligger utenfor planperioden og er ikke med.`)
    else if (h.day < startDay) warnings.push(`Boligsalget «${h.label}» er datert før startdatoen.`)
  })
  purchases.forEach((h) => {
    if (num(h.price) > 0) {
      if (h.day === null || !inPlan(h.day)) warnings.push(`Boligkjøpet «${h.label}» mangler dato eller ligger utenfor planperioden og er ikke med.`)
    }
  })

  // ---- Gjeld ----
  const debtSettleDay = {}
  saleInfo.forEach((si) => (si.h.settleDebtIds || []).forEach((id) => { if (si.settle !== null && inPlan(si.settle)) debtSettleDay[id] = Math.min(debtSettleDay[id] ?? Infinity, si.settle) }))
  const debts = (g.debts || []).map((d) => ({ d, sch: debtSchedule(d, startDay, endDay, debtSettleDay[d.id] ?? null) }))
  const debtStart = debts.reduce((s, x) => s + Math.max(0, num(x.d.amount)), 0)

  // ---- Inntektsposter ----
  const incomes = (g.incomes || []).map((p) => ({ ...p, startDay: parseDay(p.start, startDay), endDay: parseDay(p.end, null) }))

  // ---- Utbetalinger ----
  const payouts = (g.payouts || []).map((p) => ({ label: p.label || 'Utbetaling', day: parseDay(p.date, null), amount: num(p.amount) }))
  payouts.forEach((p) => {
    if (p.day === null) warnings.push(`Utbetalingen «${p.label}» mangler gyldig dato og er ikke med.`)
    else if (!inPlan(p.day)) warnings.push(`Utbetalingen «${p.label}» ligger utenfor planperioden og er ikke med.`)
  })
  accounts.forEach((a) => { if (a.sellDay !== null && a.type !== 'konto' && a.type !== 'annet' && !inPlan(a.sellDay)) warnings.push(`Salgsdatoen for «${a.name}» ligger utenfor planperioden. Posten beholdes hele planen.`) })

  // ---- Første stabile år: året etter siste engangshendelse eller endring i inntekt ----
  const evYears = [startYear]
  saleInfo.forEach((s) => { if (s.settle !== null && inPlan(s.settle)) evYears.push(yearOfDay(s.settle)) })
  purchaseInfo.forEach((p) => { if (p.day !== null && inPlan(p.day) && p.price > 0) evYears.push(yearOfDay(p.day)) })
  payouts.forEach((p) => { if (inPlan(p.day) && p.amount !== 0) evYears.push(yearOfDay(p.day)) })
  accounts.forEach((a) => { if (a.sellDay !== null && inPlan(a.sellDay) && (a.type === 'fond' || a.type === 'aksjer')) evYears.push(yearOfDay(a.sellDay)) })
  debts.forEach((x) => { const e = x.sch.events.find((ev) => ev.settle); if (e) evYears.push(yearOfDay(e.day)); const z = x.sch.events.find((ev) => ev.balAfter <= 0.005); if (z) evYears.push(yearOfDay(z.day)) })
  incomes.forEach((p) => { if (p.startDay > startDay && inPlan(p.startDay)) evYears.push(yearOfDay(p.startDay)); if (p.endDay !== null && inPlan(p.endDay)) evYears.push(yearOfDay(p.endDay)) })
  const steadyFrom = Math.min(startYear + N - 1, Math.max(...evYears) + 1)
  const extraAnnual = Math.max(0, extraMonthly) * 12
  // Uttak til livsopphold starter først når det står penger på hovedkontoen.
  const inflowDays = [
    ...saleInfo.filter((x) => x.settle !== null && inPlan(x.settle) && x.price - x.costs > 0).map((x) => x.settle),
    ...accounts.filter((a) => a !== main && (a.type === 'fond' || a.type === 'aksjer') && a.sellDay !== null && inPlan(a.sellDay)).map((a) => a.sellDay),
  ]
  const withdrawFrom = main.value > 0 || !inflowDays.length ? startDay : Math.min(...inflowDays)

  // ---- Årlige inntektsnivåer (per måned) etter vekst og eventuell overstyring ----
  const incLevel = incomes.map(() => [])
  incomes.forEach((p, k) => {
    const pStartYear = yearOfDay(p.startDay)
    for (let i = 0; i < N; i++) {
      const y = startYear + i
      const o = g.yr && g.yr[y] && g.yr[y].inc
      const ov = o && has(o[p.id]) ? o[p.id] : null
      const def = y <= pStartYear ? num(p.monthly) : incLevel[k][i - 1] * (1 + num(p.growth))
      incLevel[k].push(ov !== null ? ov : def)
    }
  })
  const kontoRate = (a, y) => {
    for (let yy = y; yy >= startYear; yy--) { const o = g.yr && g.yr[yy]; if (o && has(o.rate)) return o.rate }
    return num(a.rate)
  }

  const years = []
  const events = []
  let openMain = main.value
  let restDue = 0
  let negativeWarned = false

  for (let i = 0; i < N; i++) {
    const y = startYear + i
    const yStart = dn(y, 1, 1), yEnd = dn(y + 1, 1, 1)
    const isFirst = i === 0
    const from = Math.max(yStart, startDay)
    const fracOf = (a, b) => Math.max(0, (b - a) / daysInYear(y))

    // Faste hendelser (påvirker hovedkontoen)
    const base = []
    let settlementIn = 0, homeOut = 0, payoutsSum = 0
    saleInfo.forEach((s) => {
      if (s.settle !== null && s.settle >= from && s.settle < yEnd && s.price !== 0) {
        base.push({ day: s.settle, kind: 'salg', label: `${s.h.label}: salgssum minus omkostninger`, amount: s.price - s.costs, prio: 0 })
        settlementIn += s.price - s.costs
      }
    })
    purchaseInfo.forEach((p) => {
      if (p.day !== null && p.day >= from && p.day < yEnd && p.price > 0) {
        base.push({ day: p.day, kind: 'kjøp', label: `${p.h.label}: kjøp inkl. avgift og omkostninger`, amount: -p.total, prio: 1 })
        homeOut += p.total
      }
    })
    payouts.forEach((p) => {
      if (p.day !== null && p.day >= from && p.day < yEnd && p.amount !== 0) { base.push({ day: p.day, kind: 'utbetaling', label: p.label, amount: -p.amount, prio: 1 }); payoutsSum += p.amount }
    })
    // Gjeld
    let debtInterest = 0, debtPrincipal = 0
    debts.forEach((x) => {
      x.sch.events.filter((e) => e.day >= from && e.day < yEnd).forEach((e) => {
        base.push({ day: e.day, kind: 'gjeld', label: `Gjeld: ${x.d.name || 'Lån'}${e.settle ? ' (innfris)' : ''}`, amount: -(e.interest + e.principal), prio: 1, debtId: x.d.id })
        debtInterest += e.interest; debtPrincipal += e.principal
      })
    })
    // Øvrige poster (deterministisk): renter, vekst og salg av fond/aksjer
    let othersInterest = 0, fundGainTax = 0, fundSaleIn = 0
    const othersClose = { konto: 0, fond: 0, aksjer: 0, annet: 0 }
    others.forEach((a) => {
      if (a.sold) return
      const rate = a.type === 'konto' ? kontoRate(a, y) : a.rate
      const yearFrom = from
      if ((a.type === 'fond' || a.type === 'aksjer') && a.sellDay !== null && a.sellDay >= yearFrom && a.sellDay < yEnd) {
        const proceeds = a.bal * (1 + rate * fracOf(yearFrom, a.sellDay))
        fundGainTax += num(g.fondGainRate) * Math.max(0, proceeds - a.cost)
        fundSaleIn += proceeds
        base.push({ day: a.sellDay, kind: 'verdipapirsalg', label: `Salg av ${a.name} (til hovedkonto)`, amount: proceeds, prio: 0 })
        a.bal = 0; a.sold = true
        return
      }
      if (a.type === 'konto') { const it = a.bal * rate * fracOf(yearFrom, yEnd); othersInterest += it; a.bal += it }
      else a.bal = a.bal * (1 + rate * fracOf(yearFrom, yEnd))
      othersClose[a.type] += a.bal
    })
    // Restskatt fra året før
    let restPaid = 0, restInterest = 0
    if (Math.abs(restDue) > 0.5) {
      const payDay = dn(y, taxMonth, 20)
      restInterest = restDue > 0 ? restDue * num(g.taxAuthorityRate) * Math.max(0, payDay - dn(y - 1, 7, 1)) / 365 : 0
      restPaid = restDue + restInterest
      base.push({ day: payDay, kind: 'restskatt', label: restDue > 0 ? `Restskatt ${y - 1} (inkl. rentetillegg)` : `Tilgode skatt ${y - 1}`, amount: -restPaid, prio: 2 })
    }
    const wDays = []
    for (let m = 1; m <= 12; m++) { const d = dn(y, m, 15); if (d > withdrawFrom) wDays.push(d) }

    const rateMain = kontoRate(main, y)
    const sim = (F, W) => {
      const evs = base.slice()
      if (F > 0.005) evs.push({ day: dn(y, advMonth, 15), kind: 'forskudd', label: `Forskuddsskatt ${y}`, amount: -F, prio: 2 })
      if (W > 0.005 && wDays.length) wDays.forEach((d) => evs.push({ day: d, kind: 'uttak', label: 'Uttak til livsopphold', amount: -W / wDays.length, prio: 3 }))
      evs.sort((a, b) => a.day - b.day || a.prio - b.prio)
      let bal = openMain, cursor = from, accrued = 0, minBal = openMain, minDay = from
      const log = []
      for (const e of evs) {
        accrued += Math.max(0, bal) * rateMain * (e.day - cursor) / daysInYear(y)
        cursor = e.day
        bal += e.amount
        log.push({ ...e, year: y, balance: bal })
        if (bal < minBal) { minBal = bal; minDay = e.day }
      }
      accrued += Math.max(0, bal) * rateMain * (yEnd - cursor) / daysInYear(y)
      return { log, interest: accrued, close: bal + accrued, minBal, minDay }
    }

    // Inntekter dette året
    let salary = 0, pension = 0, folkBasis = 0
    const incomeLines = []
    incomes.forEach((p, k) => {
      const a = Math.max(from, p.startDay), b = Math.min(yEnd, p.endDay === null ? yEnd : p.endDay)
      const months = b > a ? monthsBetween(a, b) : 0
      const gross = incLevel[k][i] * months
      incomeLines.push({ id: p.id, name: p.name, kind: p.kind, monthly: months > 0 ? incLevel[k][i] : 0, gross })
      if (p.kind === 'lønn') salary += gross
      else { pension += gross; if (p.kind === 'folketrygd') folkBasis += gross }
    })
    const creditBasis = g.tjenesteCredit ? pension : folkBasis
    const common = { salary, pension, creditBasis, ...tp }
    const tBase = tax2027({ ...common, interestIncome: 0, taxableRental: 0, taxablePropertyGain: 0 })
    const gainY = saleInfo.reduce((s, x) => s + (x.settle !== null && x.settle >= yStart && x.settle < yEnd ? x.gain : 0), 0)

    // Formuesposter ved årsslutt som ikke avhenger av hovedkontoen
    const debtEnd = debts.reduce((s, x) => s + x.sch.balAfter(yEnd - 1), 0)
    const heldHomes = [
      ...owned.filter((h) => !sales.some((s) => s.sellId === h.id && s.settle !== null && s.day <= yEnd - 1 && s.day >= startDay)).map((h) => num(h.marketValue)),
      ...purchaseInfo.filter((p) => p.day !== null && p.day >= startDay && p.day < yEnd && p.price > 0
        && !sales.some((s) => s.sellId === p.h.id && s.day !== null && s.day <= yEnd - 1)).map((p) => num(p.h.marketValue) > 0 ? num(p.h.marketValue) : p.price),
    ]
    const homeMarket = heldHomes.reduce((s, v) => s + v, 0)
    const homeTaxValue = homeMarket > 0 ? primaryResidenceTaxValue(homeMarket, hp) : 0

    const auto = !has(g.yr && g.yr[y] && g.yr[y].withdrawal)
    const fixedW = auto ? 0 : g.yr[y].withdrawal * (wDays.length / 12)
    const taxesFor = (s) => {
      const interestAll = s.interest + othersInterest
      const nci = interestAll - debtInterest
      const tNoGain = tax2027({ ...common, interestIncome: nci, taxableRental: 0, taxablePropertyGain: 0 })
      const tFull = tax2027({ ...common, interestIncome: nci, taxableRental: 0, taxablePropertyGain: gainY })
      const wealthNet = Math.max(0, s.close + othersClose.konto + othersClose.fond * num(g.valFond) + othersClose.aksjer * num(g.valAksjer) + othersClose.annet + homeTaxValue - debtEnd)
      const wealth = wealthTax2027(wealthNet, !!g.joint, wp)
      const interestTax = tNoGain.total - tBase.total
      const propGainTax = tFull.total - tNoGain.total
      const gainTax = propGainTax + fundGainTax
      return { tNoGain, tFull, wealthNet, wealth, interestTax, gainTax, interestAll, capitalTax: interestTax + gainTax + wealth }
    }
    let F = 0, Wauto = 0, s, t
    for (let it = 0; it < 80; it++) {
      s = sim(F, auto ? Wauto : fixedW)
      t = taxesFor(s)
      const Fn = Math.max(0, share * t.capitalTax)
      const useExtra = y >= steadyFrom ? extraAnnual * (wDays.length / 12) : 0
      const Wn = auto ? Math.max(0, (g.autoWithdraw === false ? 0 : t.interestAll - t.interestTax - t.wealth) + useExtra) : 0
      const done = Math.abs(Fn - F) < 0.25 && Math.abs(Wn - Wauto) < 0.25
      F = Fn; Wauto = Wn
      if (done) break
    }
    const paidForskudd = s.log.filter((e) => e.kind === 'forskudd').reduce((a, e) => a - e.amount, 0)
    const withdrawals = s.log.filter((e) => e.kind === 'uttak').reduce((a, e) => a - e.amount, 0)
    const netReturn = t.interestAll - t.interestTax - t.wealth
    const trekk = tBase.total
    const incomeNet = salary + pension - trekk
    const realFactor = 1 / Math.pow(1 + inflation, y - startYear)
    const disposablePerMonth = (incomeNet + withdrawals) / 12
    const kontoClose = s.close + othersClose.konto
    const savingsClose = kontoClose + othersClose.fond + othersClose.aksjer
    const netWorth = savingsClose + othersClose.annet + homeMarket - debtEnd

    if (s.minBal < -0.5 && !negativeWarned) {
      negativeWarned = true
      warnings.push(`Hovedkontoen blir negativ første gang i ${y} (laveste ${Math.round(s.minBal).toLocaleString('nb-NO')} kr, ${dayToDate(s.minDay).toLocaleDateString('nb-NO', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })}). Planen er da ikke dekket av kapitalen, og tallene fra dette året er ikke pålitelige.`)
    }

    years.push({
      year: y, age: birthYear === null ? null : y - birthYear, rate: rateMain, openMain, closeMain: s.close, minBal: s.minBal,
      interest: t.interestAll, interestTax: t.interestTax, gainTax: t.gainTax, wealthNet: t.wealthNet, wealthTax: t.wealth,
      capitalTax: t.capitalTax, forskudd: paidForskudd, restPaid, restInterest, restNext: t.capitalTax - Math.max(0, share * t.capitalTax),
      withdrawals, withdrawalPerMonth: wDays.length ? withdrawals / wDays.length : 0, auto,
      payouts: payoutsSum, homeOut, settlementIn, fundSaleIn,
      debtInterest, debtPrincipal, debtService: debtInterest + debtPrincipal, debtClose: debtEnd,
      salary, pension, incomeLines, trekk, incomeNet, pensionCredit: t.tNoGain.pensionCredit,
      netReturn, netReturnPerMonth: netReturn / 12, disposablePerMonth, disposablePerMonthReal: disposablePerMonth * realFactor, realFactor,
      kontoClose, fondClose: othersClose.fond, aksjerClose: othersClose.aksjer, annetClose: othersClose.annet,
      savingsClose, homeMarket, homeTaxValue, netWorth,
    })
    events.push(...s.log, { day: yEnd - 1, kind: 'interest', year: y, label: `Renter ${y} kreditert kontoene`, amount: s.interest, balance: s.close, prio: 9 })
    restDue = t.capitalTax - Math.max(0, share * t.capitalTax)
    openMain = s.close
  }

  const sum = (k) => years.reduce((a, r) => a + r[k], 0)
  const steady = years.filter((r) => r.year >= steadyFrom)
  const avg = (k) => steady.reduce((a, r) => a + r[k], 0) / Math.max(1, steady.length)
  const last = years[years.length - 1]
  const summary = {
    years: N, startYear, endYear: startYear + N - 1, ageAtStart: span.ageAtStart, ageEnd: birthYear === null ? null : startYear + N - 1 - birthYear,
    initial: initialLiquid, debtStart,
    homeCost: purchaseInfo.reduce((s, p) => s + (p.price > 0 ? p.total : 0), 0),
    totalInterest: sum('interest'), totalInterestTax: sum('interestTax'), totalWealthTax: sum('wealthTax'), totalGainTax: sum('gainTax'),
    totalDebtService: sum('debtService'), totalDebtInterest: sum('debtInterest'),
    totalNetReturn: sum('netReturn'), steadyFrom,
    avgNetReturnPerMonth: avg('netReturn') / 12,
    avgIncomeNetPerMonth: avg('incomeNet') / 12,
    avgWithdrawalPerMonth: avg('withdrawalPerMonth'),
    avgDebtServicePerMonth: avg('debtService') / 12,
    avgDisposablePerMonth: avg('disposablePerMonth'),
    avgDisposablePerMonthReal: avg('disposablePerMonthReal'),
    extraPerMonth: extraMonthly,
    closing: last.savingsClose, debtEnd: last.debtClose, netWorthEnd: last.netWorth, outstandingTax: restDue,
    closingAfterTax: last.savingsClose - restDue,
    closingReal: (last.savingsClose - restDue) / Math.pow(1 + inflation, N - 1),
  }
  return { years, events, warnings: [...new Set(warnings)], summary, span, incomes: incomes.map((p) => ({ id: p.id, name: p.name, kind: p.kind })) }
}

// Hovedfunksjon. Med «sparemål» finner vi (ved halvering) hvor mye ekstra som kan brukes per måned
// fra første stabile år, slik at kapitalen etter skatt ved planslutt blir lik målet.
export function runPlan(g) {
  const base = runPlanCore(g, 0)
  if (!g.targetEnabled) return base
  const target = Math.max(0, Number(g.targetClosing) || 0)
  const f = (x) => runPlanCore(g, x)
  const warnings = []
  let lo = 0, hi = Math.max(1e6, base.summary.initial) / 6 + 1e5
  let best = base
  if (base.summary.closingAfterTax < target - 1) {
    warnings.push('Målet for kapital ved planslutt er høyere enn kapitalen holder til selv uten ekstra uttak. Ekstra uttak er satt til 0.')
  } else {
    const top = f(hi)
    if (top.summary.closingAfterTax > target) { best = top }
    else {
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2
        if (f(mid).summary.closingAfterTax >= target) lo = mid; else hi = mid
      }
      best = f(lo)
    }
  }
  best.summary.target = target
  best.summary.targetEnabled = true
  best.warnings = [...new Set([...best.warnings, ...warnings])]
  return best
}
