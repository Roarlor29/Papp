// Forslag og stresstest ut fra planen. Alt regnes på nytt med endrede forutsetninger, uten å lagre noe.
import { runPlanCore } from './engine.js'

const shift = (g, dRate, dInfl) => {
  const c = JSON.parse(JSON.stringify(g))
  c.accounts = c.accounts.map((a) => ({ ...a, rate: Math.max(0, (Number(a.rate) || 0) + dRate) }))
  for (const o of Object.values(c.yr || {})) if (typeof o.rate === 'number') o.rate = Math.max(0, o.rate + dRate)
  c.inflation = Math.max(0, (Number(c.inflation) || 0) + dInfl)
  c.targetEnabled = false
  return c
}

export function stressTest(g, plan) {
  const extra = plan.summary.extraPerMonth || 0
  const cases = [
    { label: 'Som planlagt', d: [0, 0] },
    { label: 'Avkastning 2 prosentpoeng lavere', d: [-0.02, 0] },
    { label: 'Inflasjon 2 prosentpoeng høyere', d: [0, 0.02] },
    { label: 'Begge deler', d: [-0.02, 0.02] },
  ]
  return cases.map((c) => {
    const p = runPlanCore(shift(g, c.d[0], c.d[1]), extra)
    const empty = p.years.find((y) => y.savingsClose <= 1 || y.minBal < -0.5)
    return {
      label: c.label,
      closingReal: p.summary.closingReal,
      closing: p.summary.closingAfterTax,
      disposableReal: p.summary.avgDisposablePerMonthReal,
      emptyYear: empty ? empty.year : null,
      emptyAge: empty && empty.age !== null ? empty.age : null,
    }
  })
}

const fmt = (n) => Math.round(n).toLocaleString('nb-NO')

export function suggestions(g, plan) {
  const S = plan.summary
  const out = []
  const add = (level, text) => out.push({ level, text })

  const empty = plan.years.find((y) => y.savingsClose <= 1 || y.minBal < -0.5)
  if (empty) add('warn', `Sparekapitalen er brukt opp i ${empty.year}${empty.age !== null ? ` (${empty.age} år)` : ''}. Senk uttaket, bruk lengre tid på å bruke opp kapitalen, eller se på om boligen kan frigjøre penger.`)

  const spend = Number(g.wantedSpend) || 0
  if (spend > 0) {
    const have = S.avgDisposablePerMonthReal
    if (have < spend) add('warn', `Du ønsker ${fmt(spend)} kr per måned, men planen gir ${fmt(have)} kr i startårets kroner. Det mangler ${fmt(spend - have)} kr per måned.`)
    else add('ok', `Planen dekker ønsket forbruk på ${fmt(spend)} kr per måned. Margin: ${fmt(have - spend)} kr per måned i startårets kroner.`)
    const konto = g.accounts.filter((a) => a.type === 'konto').reduce((s, a) => s + (Number(a.value) || 0), 0)
    if (konto < spend * 6) add('info', `Som buffer anbefales ofte 3–6 måneders forbruk på en konto du kommer til med en gang, her ${fmt(spend * 3)}–${fmt(spend * 6)} kr. Du har ${fmt(konto)} kr på bankkontoer ved start.`)
  }

  const first = plan.years.find((y) => y.year >= S.steadyFrom) || plan.years[0]
  if (first && first.withdrawals > first.netReturn * 1.05 + 1 && first.netReturn > 0) {
    add('info', `Fra ${first.year} tar du ut mer enn netto avkastning (${fmt(first.withdrawals)} mot ${fmt(first.netReturn)} kr per år), så kapitalen minker med tiden.`)
  }

  // Innskuddsgaranti: 2 mill. kr per kunde per bank
  const byBank = {}
  g.accounts.filter((a) => a.type === 'konto').forEach((a) => { const k = (a.institution || a.name || '').trim().toLowerCase() || 'ukjent'; byBank[k] = (byBank[k] || 0) + (Number(a.value) || 0) })
  const over = Object.entries(byBank).filter(([, v]) => v > 2000000)
  if (over.length) add('info', `Innskuddsgarantien dekker 2 millioner kroner per kunde per bank. Du har mer enn det i ${over.length === 1 ? 'en bank' : `${over.length} banker`}. Vurder å spre pengene eller sjekk gjeldende regler hos Bankenes sikringsfond.`)

  // Gjeld som koster mer enn kapitalen gir
  const mainRate = (g.accounts.find((a) => a.main) || {}).rate || 0
  const dear = g.debts.filter((d) => (Number(d.amount) || 0) > 0 && (Number(d.rate) || 0) > mainRate * 1.0 + 0.0001 && d.mode !== 'innfrielse')
  dear.forEach((d) => add('info', `Gjelden «${d.name}» har ${(d.rate * 100).toLocaleString('nb-NO', { maximumFractionDigits: 2 })} % rente, mens hovedkontoen gir ${(mainRate * 100).toLocaleString('nb-NO', { maximumFractionDigits: 2 })} %. Vurder å betale ned eller innfri gjelden. Husk at rente på gjeld gir skattefradrag og at renter på sparing skattlegges.`))

  if (S.totalWealthTax > 1) add('info', `Du betaler ${fmt(S.totalWealthTax)} kr i formuesskatt over planen. Sjekk at formuesverdiene i skattemeldingen er riktige (bolig, fond og aksjer verdsettes lavere enn markedsverdi) og at gjeld er med.`)

  if (g.restNoInterest === false && plan.years.some((y) => y.restInterest > 1)) {
    add('info', `Du betaler rentetillegg på restskatt (${fmt(plan.years.reduce((s, y) => s + y.restInterest, 0))} kr totalt). Betaler du restskatten innen fristen om våren, slipper du rentetillegget. Du kan slå det på under «Betaling av skatt».`)
  }

  const labour = plan.years.find((y) => Math.abs(y.labourRest) > 5000)
  if (labour) add('info', `Skattetrekket på lønn og pensjon avviker fra beregnet skatt med ${fmt(Math.abs(labour.labourRest))} kr i ${labour.year}. Du får ${labour.labourRest > 0 ? 'restskatt' : 'penger tilbake'}. Juster trekkprosenten hvis du vil unngå det.`)

  if (!out.length) add('ok', 'Ingen åpenbare problemer funnet med dagens forutsetninger.')
  return out
}
