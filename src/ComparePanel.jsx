import { krShort } from './inputs.jsx'

// Sammenligning av de tre scenarioene side om side. Det beste tallet i hver rad vises i fet skrift.
// «better»: 'high' = høyest er best, 'low' = lavest er best, utelatt = ingen vurdering.
export default function ComparePanel({ store, plans }) {
  const refIdx = Math.max(0, store.scenarios.findIndex((s) => s.id === (store.chosen ?? 1)))
  const refName = store.scenarios[refIdx].name

  const rows = [
    { l: 'Planløp (år)', v: (p) => p.summary.years, plain: true },
    { l: 'Sparekapital ved start', v: (p) => p.summary.initial },
    { l: 'Gjeld ved start', v: (p) => p.summary.debtStart, hideZero: true },
    { l: 'Boligkjøp inkl. omkostninger', v: (p) => p.summary.homeCost, hideZero: true },
    { l: 'Utbetalinger totalt', v: (p) => p.years.reduce((a, y) => a + y.payouts, 0), hideZero: true },
    { section: 'Per måned (snitt fra første stabile år)' },
    { l: 'Netto avkastning', v: (p) => p.summary.avgNetReturnPerMonth, better: 'high' },
    { l: 'Uttak fra kapital', v: (p) => p.summary.avgWithdrawalPerMonth },
    { l: 'Gjeldsbetjening (renter og avdrag)', v: (p) => p.summary.avgDebtServicePerMonth, hideZero: true },
    { l: 'Disponibelt (inntekt etter skatt + uttak)', v: (p) => p.summary.avgDisposablePerMonth, better: 'high', strong: true },
    { l: 'Disponibelt i startårets kroner', v: (p) => p.summary.avgDisposablePerMonthReal, better: 'high' },
    { section: 'Ved planslutt og skatt' },
    { l: 'Sparekapital etter skatt ved slutt', v: (p) => p.summary.closingAfterTax, better: 'high', strong: true },
    { l: 'Gjeld ved slutt', v: (p) => p.summary.debtEnd, better: 'low', hideZero: true },
    { l: 'Netto formue ved slutt', v: (p) => p.summary.netWorthEnd, better: 'high' },
    { l: 'Skatt på kapital totalt', v: (p) => p.summary.totalInterestTax + p.summary.totalWealthTax + p.summary.totalGainTax, better: 'low' },
    { l: '  herav formuesskatt', v: (p) => p.summary.totalWealthTax, better: 'low' },
    { section: `Forskjell mot ${refName}` },
    { l: 'Disponibelt per måned', v: (p) => p.summary.avgDisposablePerMonth - plans[refIdx].summary.avgDisposablePerMonth, diff: true },
    { l: 'Sparekapital etter skatt ved slutt', v: (p) => p.summary.closingAfterTax - plans[refIdx].summary.closingAfterTax, diff: true },
  ]
  const shown = rows.filter((r) => r.section || !r.hideZero || plans.some((p, i) => Math.abs(r.v(p, i)) > 0.5))

  return (
    <div className="panel">
      <h2>Sammenligning av scenarioene</h2>
      <div className="plan-scroll">
        <table className="plan-table compare">
          <thead>
            <tr><th></th>{store.scenarios.map((s) => <th key={s.id}>{store.chosen === s.id ? '★ ' : ''}{s.name}</th>)}</tr>
          </thead>
          <tbody>
            {shown.map((r, ri) => {
              if (r.section) return <tr className="sect" key={'s' + ri}><td colSpan={store.scenarios.length + 1}>{r.section}</td></tr>
              const vals = plans.map((p, i) => r.v(p, i))
              let best = -1
              if (r.better && new Set(vals.map((x) => Math.round(x))).size > 1) {
                best = vals.reduce((b, x, i) => (r.better === 'high' ? (x > vals[b] ? i : b) : (x < vals[b] ? i : b)), 0)
              }
              return (
                <tr key={ri} className={r.strong ? 'strong' : ''}>
                  <td>{r.l}</td>
                  {vals.map((x, i) => (
                    <td key={i} className={i === best ? 'best' : ''}>
                      {r.diff && i === refIdx ? '–' : (r.diff && x > 0.5 ? '+' : '') + krShort(x)}
                    </td>
                  ))}
                </tr>
              )
            })}
            <tr><td>Advarsler</td>{plans.map((p, i) => <td key={i}>{p.warnings.length ? `⚠ ${p.warnings.length}` : 'Ingen'}</td>)}</tr>
          </tbody>
        </table>
      </div>
      <p className="field-hint">
        Alle beløp i kroner. Det beste tallet i hver rad er i <b>fet skrift</b>. Forskjellene er regnet mot {store.chosen ? 'ditt valgte scenario' : 'Scenario A (ingen er valgt ennå)'}.
        Scenarioer med advarsel (⚠) er ikke dekket av kapitalen, så tallene deres er ikke pålitelige.
      </p>
    </div>
  )
}
