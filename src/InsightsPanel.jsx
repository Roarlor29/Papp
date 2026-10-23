import { useMemo } from 'react'
import { stressTest, suggestions } from './insights.js'
import { Field, MoneyInput, krShort } from './inputs.jsx'

export default function InsightsPanel({ g, plan, onSpend }) {
  const stress = useMemo(() => stressTest(g, plan), [g, plan])
  const tips = useMemo(() => suggestions(g, plan), [g, plan])
  const spend = Number(g.wantedSpend) || 0
  return (
    <div className="panel">
      <h2>Forslag og stresstest</h2>
      <div className="grid">
        <Field label="Ønsket forbruk per måned (i startårets kroner)" hint="Valgfritt. Brukes til å sjekke om planen holder og om bufferen er stor nok.">
          <MoneyInput label="Ønsket forbruk per måned" value={g.wantedSpend} onChange={onSpend} />
        </Field>
      </div>
      <h3>Stresstest</h3>
      <p className="field-hint">Planen regnes på nytt med verre forutsetninger. Uttaket er det samme som i planen. Når uttaket er satt til avkastningen (automatisk uttak), blir kapitalen lik og det er forbruket som synker. Beløp er i startårets kroner.</p>
      <div className="plan-scroll">
        <table className="plan-table">
          <thead><tr><th>Scenario</th><th>Kapital ved slutt</th><th>Disponibelt per måned</th><th>Kapitalen er brukt opp</th></tr></thead>
          <tbody>
            {stress.map((r) => (
              <tr key={r.label}>
                <td>{r.label}</td>
                <td>{krShort(r.closingReal)}</td>
                <td>{krShort(r.disposableReal)}{spend > 0 && r.disposableReal < spend ? ' ⚠' : ''}</td>
                <td>{r.emptyYear ? `Ja, ${r.emptyYear}${r.emptyAge !== null ? ` (${r.emptyAge} år)` : ''}` : 'Nei'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>Forslag</h3>
      {tips.map((t, i) => <p key={i} className={`notice ${t.level}`}>{t.level === 'warn' ? '⚠ ' : t.level === 'ok' ? '✓ ' : ''}{t.text}</p>)}
      <p className="field-hint">Forslagene er enkle regler ut fra tallene dine og er ikke rådgivning. Sjekk viktige beslutninger med bank, rådgiver eller skatteetaten.no.</p>
    </div>
  )
}
