import { useMemo } from 'react'
import { stressTest, suggestions } from './insights.js'
import { ACCOUNT_TYPES, DEBT_MODES, HOME_KINDS, INCOME_KINDS, WITHHOLD_METHODS } from './state.js'
import { kr, krShort, pct } from './inputs.jsx'

const label = (list, v) => String((list.find((x) => x.value === v) || {}).label || v || '')
const dato = (s) => (s ? new Date(s + 'T00:00:00Z').toLocaleDateString('nb-NO', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '')

// Utskriftsvennlig oppsummering. Vises bare ved utskrift («Lag PDF»), aldri på skjermen.
export default function PrintSummary({ g, plan, name }) {
  const S = plan.summary
  const stress = useMemo(() => stressTest(g, plan), [g, plan])
  const tips = useMemo(() => suggestions(g, plan), [g, plan])
  const today = new Date().toLocaleDateString('nb-NO', { day: '2-digit', month: 'long', year: 'numeric' })
  const first = plan.years[0]
  const ageText = first && first.age !== null ? ` (alder ${first.age}–${plan.years[plan.years.length - 1].age})` : ''
  return (
    <div className="print-summary">
      <header>
        <h1>Oppsummering av privatøkonomi</h1>
        <p>Scenario: <b>{name}</b> · Planperiode {S.startYear}–{S.endYear}{ageText} · Laget {today}</p>
      </header>

      <h2>Hovedtall</h2>
      <table className="kv">
        <tbody>
          <tr><td>Sparekapital ved start</td><td>{kr(S.initial)}</td></tr>
          {S.debtStart > 0 && <tr><td>Gjeld ved start</td><td>{kr(S.debtStart)}</td></tr>}
          <tr><td>Disponibelt per måned (snitt fra {S.steadyFrom})</td><td>{kr(S.avgDisposablePerMonth)}</td></tr>
          <tr><td>Samme beløp i startårets kroner</td><td>{kr(S.avgDisposablePerMonthReal)}</td></tr>
          <tr><td>Netto avkastning per måned, etter skatt</td><td>{kr(S.avgNetReturnPerMonth)}</td></tr>
          <tr><td>Sparekapital ved utgangen av {S.endYear}, etter skatt</td><td>{kr(S.closingAfterTax)}</td></tr>
          <tr><td>Netto formue ved utgangen av {S.endYear}</td><td>{kr(S.netWorthEnd)}</td></tr>
          <tr><td>Skatt på kapital totalt over planen</td><td>{kr(S.totalInterestTax + S.totalGainTax + S.totalWealthTax)}</td></tr>
        </tbody>
      </table>

      <h2>Sparekapital og formue ved start</h2>
      <table>
        <thead><tr><th>Type</th><th>Navn</th><th>Bank / institusjon</th><th className="n">Verdi</th><th className="n">Avkastning</th></tr></thead>
        <tbody>
          {g.accounts.map((a) => (
            <tr key={a.id}><td>{label(ACCOUNT_TYPES, a.type)}</td><td>{a.name}</td><td>{a.institution}</td><td className="n">{krShort(a.value)}</td><td className="n">{pct(a.rate)}</td></tr>
          ))}
        </tbody>
      </table>

      {g.debts.length > 0 && (<>
        <h2>Gjeld</h2>
        <table>
          <thead><tr><th>Navn</th><th>Konto</th><th>Pant</th><th className="n">Beløp</th><th className="n">Rente</th><th>Nedbetaling</th></tr></thead>
          <tbody>
            {g.debts.map((d) => (
              <tr key={d.id}><td>{d.name}</td><td>{d.account}</td><td>{d.collateral}</td><td className="n">{krShort(d.amount)}</td><td className="n">{pct(d.rate)}</td>
                <td>{label(DEBT_MODES, d.mode).split(' (')[0]}{d.mode === 'avdrag' || d.mode === 'fast' ? `, ${krShort(d.monthly)} kr/mnd` : ''}{d.mode === 'innfrielse' && d.settleDate ? `, ${dato(d.settleDate)}` : ''}</td></tr>
            ))}
          </tbody>
        </table>
      </>)}

      {g.homes.length > 0 && (<>
        <h2>Bolig</h2>
        <table>
          <thead><tr><th>Type</th><th>Bolig</th><th>Dato</th><th className="n">Markedsverdi</th><th className="n">Pris</th></tr></thead>
          <tbody>
            {g.homes.map((h) => (
              <tr key={h.id}><td>{label(HOME_KINDS, h.kind)}</td><td>{h.label}</td><td>{dato(h.date)}</td><td className="n">{h.marketValue ? krShort(h.marketValue) : ''}</td><td className="n">{h.price ? krShort(h.price) : ''}</td></tr>
            ))}
          </tbody>
        </table>
      </>)}

      {g.incomes.length > 0 && (<>
        <h2>Inntekter</h2>
        <table>
          <thead><tr><th>Type</th><th>Navn</th><th>Utbetaler</th><th className="n">Brutto per måned</th><th>Fra</th><th>Til</th><th>Skattetrekk</th></tr></thead>
          <tbody>
            {g.incomes.map((p) => (
              <tr key={p.id}><td>{label(INCOME_KINDS, p.kind)}</td><td>{p.name}</td><td>{p.payer}</td><td className="n">{krShort(p.monthly)}</td><td>{dato(p.start)}</td><td>{p.end ? dato(p.end) : 'Løpende'}</td>
                <td>{p.wMethod === 'tabell' ? `Tabell${p.wTable ? ` ${p.wTable}` : ''}` : `${label(WITHHOLD_METHODS, p.wMethod).split(' (')[0]} ${pct(p.wPct, 0)}`}</td></tr>
            ))}
          </tbody>
        </table>
      </>)}

      <h2>År for år</h2>
      <table className="years">
        <thead><tr><th>År</th><th>Alder</th><th className="n">Lønn og pensjon etter skatt per mnd</th><th className="n">Uttak per mnd</th><th className="n">Disponibelt per mnd</th><th className="n">Skatt på kapital</th><th className="n">Sparekapital 31.12</th><th className="n">Gjeld 31.12</th><th className="n">Netto formue</th></tr></thead>
        <tbody>
          {plan.years.map((y) => (
            <tr key={y.year}><td>{y.year}</td><td>{y.age ?? ''}</td><td className="n">{krShort(y.incomeNet / 12)}</td><td className="n">{krShort(y.withdrawalPerMonth)}</td><td className="n">{krShort(y.disposablePerMonth)}</td><td className="n">{krShort(y.capitalTax)}</td><td className="n">{krShort(y.savingsClose)}</td><td className="n">{krShort(y.debtClose)}</td><td className="n">{krShort(y.netWorth)}</td></tr>
          ))}
        </tbody>
      </table>

      <h2>Stresstest</h2>
      <table>
        <thead><tr><th>Scenario</th><th className="n">Kapital ved slutt (startårets kroner)</th><th className="n">Disponibelt per mnd (startårets kroner)</th><th>Kapitalen brukt opp</th></tr></thead>
        <tbody>
          {stress.map((r) => (
            <tr key={r.label}><td>{r.label}</td><td className="n">{krShort(r.closingReal)}</td><td className="n">{krShort(r.disposableReal)}</td><td>{r.emptyYear ? `Ja, ${r.emptyYear}` : 'Nei'}</td></tr>
          ))}
        </tbody>
      </table>

      {tips.length > 0 && (<>
        <h2>Merknader</h2>
        <ul>{tips.map((t, i) => <li key={i}>{t.text}</li>)}</ul>
      </>)}

      <h2>Forutsetninger</h2>
      <p>Prisvekst {pct(g.inflation)} per år. Skatt på renter, gevinster og formue betales {g.restNoInterest !== false ? 'som forskudd og restskatt uten rentetillegg' : 'som forskudd og restskatt med rentetillegg'}. Skattesatser og fradrag er dagens satser, forenklet.{S.targetEnabled ? ` Sparemål: ${kr(S.target)} ved slutten av ${S.endYear}.` : ''}</p>
      <p className="fine">Dette er et planleggingsanslag laget i Papp, ikke en skatteberegning, finansiell rådgivning eller et tilbud. Tallene bygger på opplysningene og forutsetningene som er lagt inn, og er ikke kontrollert av bank, rådgiver eller skattemyndighetene. Kontroller viktige beslutninger mot skatteetaten.no eller en rådgiver.</p>
    </div>
  )
}
