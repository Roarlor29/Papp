import { Field, MoneyInput, PctInput, DateInput, OptDateInput, krShort } from './inputs.jsx'
import { ACCOUNT_TYPES, DEBT_MODES, HOME_KINDS, INCOME_KINDS, MAX_ITEMS, WITHHOLD_METHODS } from './state.js'

// Felles bygg for en post i en liste: tittel, «Fjern»-knapp og felter.
function Card({ title, onRemove, children, note }) {
  return (
    <div className="item-card">
      <div className="item-head">
        <b>{title}</b>
        <button type="button" className="ghost small" onClick={onRemove}>Fjern</button>
      </div>
      <div className="grid">{children}</div>
      {note && <p className="field-note">{note}</p>}
    </div>
  )
}

const Select = ({ label, value, onChange, options, hint }) => (
  <Field label={label} hint={hint}>
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </Field>
)
const Text = ({ label, value, onChange, max = 40, hint }) => (
  <Field label={label} hint={hint}><input type="text" value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} /></Field>
)
const Money = ({ label, value, onChange, hint }) => <Field label={label} hint={hint}><MoneyInput label={label} value={value} onChange={onChange} /></Field>
const Pct = ({ label, value, onChange, hint }) => <Field label={label} hint={hint}><PctInput label={label} value={value} onChange={onChange} /></Field>
const Check = ({ label, checked, onChange }) => <label className="inline-check"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /> {label}</label>

export function AccountsPanel({ g, api, startMin }) {
  const typeLabel = (t) => ACCOUNT_TYPES.find((x) => x.value === t)?.label.split(' /')[0].split(' (')[0] || t
  return (
    <div className="panel">
      <h2>Sparekapital per startdato</h2>
      <p className="field-hint">Legg inn hver konto og investering med verdi på startdatoen. Bankkontoer tjener rente dag for dag. Fond og aksjer vokser med forventet avkastning og skattlegges først når du selger. Alle hendelser (salg, kjøp, utbetalinger, gjeld og uttak) går via hovedkontoen.</p>
      {g.accounts.map((a) => (
        <Card key={a.id} title={`${a.name || 'Uten navn'} · ${typeLabel(a.type)} · ${krShort(a.value)} kr`} onRemove={() => api.delItem('accounts', a.id)}
          note={a.type === 'fond' || a.type === 'aksjer' ? 'Gevinstskatt (sats under «Avanserte forutsetninger») beregnes når posten selges. Verdsettelse til formuesskatt er også justerbar der.' : a.type === 'annet' ? 'Verdien telles med i formuen og i formuesskatten, men gir ingen løpende inntekt.' : undefined}>
          <Select label="Type" value={a.type} options={ACCOUNT_TYPES} onChange={(v) => api.setItem('accounts', a.id, 'type', v)} />
          <Text label="Navn" value={a.name} onChange={(v) => api.setItem('accounts', a.id, 'name', v)} />
          <Text label="Bank / finansinstitusjon" value={a.institution} onChange={(v) => api.setItem('accounts', a.id, 'institution', v)} />
          <Money label="Verdi per startdato" value={a.value} onChange={(v) => api.setItem('accounts', a.id, 'value', v)} />
          <Pct label={a.type === 'konto' ? 'Rente per år' : a.type === 'annet' ? 'Verdiendring per år' : 'Forventet avkastning per år'} value={a.rate} onChange={(v) => api.setItem('accounts', a.id, 'rate', v)} />
          {(a.type === 'fond' || a.type === 'aksjer') && <>
            <Money label="Innkjøpsverdi (til gevinstskatt)" hint="Tom/0 = samme som verdien i dag" value={a.cost} onChange={(v) => api.setItem('accounts', a.id, 'cost', v)} />
            <Field label="Selges (valgfritt)" hint="Hele posten selges og pengene går til hovedkontoen"><OptDateInput label="Salgsdato" value={a.sellDate} min={startMin} onChange={(v) => api.setItem('accounts', a.id, 'sellDate', v)} /></Field>
          </>}
          {a.type === 'konto' && (
            <div className="field"><span className="field-label">Hovedkonto</span>
              <Check label="Hendelser og uttak går via denne kontoen" checked={a.main} onChange={() => api.setMain(a.id)} />
            </div>
          )}
        </Card>
      ))}
      {g.accounts.length < MAX_ITEMS.accounts && <button type="button" className="add" onClick={() => api.addItem('accounts')}>+ Legg til konto, fond eller aksjer</button>}
    </div>
  )
}

export function DebtsPanel({ g, api }) {
  return (
    <div className="panel">
      <h2>Gjeld</h2>
      <p className="field-hint">Gjeld per startdato. Renter og avdrag betales fra hovedkontoen den 15. hver måned. Rentene gir rentefradrag i skatten. Gjeld trekkes fra i formuesskatten.</p>
      {g.debts.map((d) => (
        <Card key={d.id} title={`${d.name || 'Uten navn'} · ${krShort(d.amount)} kr`} onRemove={() => api.delItem('debts', d.id)}
          note={d.mode === 'avdragsfritt' ? 'Avdragsfritt: gjelden står uendret, og bare rentene betales.' : undefined}>
          <Text label="Navn på gjelden" value={d.name} onChange={(v) => api.setItem('debts', d.id, 'name', v)} />
          <Text label="Konto / lånenummer" value={d.account} onChange={(v) => api.setItem('debts', d.id, 'account', v)} />
          <Text label="Pant (hva gjelden er sikret i)" max={60} value={d.collateral} onChange={(v) => api.setItem('debts', d.id, 'collateral', v)} />
          <Money label="Gjeld per startdato" value={d.amount} onChange={(v) => api.setItem('debts', d.id, 'amount', v)} />
          <Pct label="Rente per år" value={d.rate} onChange={(v) => api.setItem('debts', d.id, 'rate', v)} />
          <Select label="Nedbetaling" value={d.mode} options={DEBT_MODES} onChange={(v) => api.setItem('debts', d.id, 'mode', v)} />
          {d.mode === 'avdrag' && <Money label="Avdrag per måned" value={d.monthly} onChange={(v) => api.setItem('debts', d.id, 'monthly', v)} />}
          {d.mode === 'fast' && <Money label="Fast beløp per måned" hint="Renter trekkes fra beløpet, resten er avdrag" value={d.monthly} onChange={(v) => api.setItem('debts', d.id, 'monthly', v)} />}
          {d.mode === 'innfrielse' && <Field label="Innfris på dato" hint="Eller tom hvis gjelden innfris ved et boligsalg"><OptDateInput label="Innfrielsesdato" value={d.settleDate} onChange={(v) => api.setItem('debts', d.id, 'settleDate', v)} /></Field>}
        </Card>
      ))}
      {g.debts.length < MAX_ITEMS.debts && <button type="button" className="add" onClick={() => api.addItem('debts')}>+ Legg til gjeld</button>}
    </div>
  )
}

export function HomesPanel({ g, api }) {
  const ownable = g.homes.filter((h) => h.kind === 'owned' || h.kind === 'purchase')
  const kindLabel = (k) => HOME_KINDS.find((x) => x.value === k)?.label || k
  return (
    <div className="panel">
      <h2>Bolig, boligsalg og boligkjøp</h2>
      <p className="field-hint">Bolig du eier telles med i formuesskatten med skattemessig verdi. Et boligsalg setter pengene inn på hovedkontoen på oppgjørsdagen og innfrier valgt gjeld. Et boligkjøp tar pengene ut av hovedkontoen.</p>
      {g.homes.map((h) => (
        <Card key={h.id} title={`${h.label || 'Uten navn'} · ${kindLabel(h.kind)}`} onRemove={() => api.delItem('homes', h.id)}>
          <Select label="Type" value={h.kind} options={HOME_KINDS} onChange={(v) => api.setItem('homes', h.id, 'kind', v)} />
          <Text label="Beskrivelse" value={h.label} onChange={(v) => api.setItem('homes', h.id, 'label', v)} />
          {h.kind === 'owned' && <Money label="Markedsverdi i dag" hint="Skattemessig verdi regnes av denne" value={h.marketValue} onChange={(v) => api.setItem('homes', h.id, 'marketValue', v)} />}
          {h.kind === 'sale' && <>
            <Field label="Salgsdato"><DateInput label="Salgsdato" value={h.date || g.start} min={g.start} onChange={(v) => api.setItem('homes', h.id, 'date', v)} /></Field>
            <Money label="Dager fra salg til pengene er på konto" value={h.buffer} onChange={(v) => api.setItem('homes', h.id, 'buffer', v)} />
            <Money label="Salgssum" value={h.price} onChange={(v) => api.setItem('homes', h.id, 'price', v)} />
            <Money label="Salgsomkostninger" value={h.costs} onChange={(v) => api.setItem('homes', h.id, 'costs', v)} />
            <Field label="Hvilken bolig selges?" hint="Boligen slutter å telle i formuen">
              <select value={h.sellId} onChange={(e) => api.setItem('homes', h.id, 'sellId', Number(e.target.value))}>
                <option value={0}>Ingen av boligene over</option>
                {ownable.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </Field>
            <div className="field"><span className="field-label">Gjeld som innfris ved salget</span>
              {g.debts.length === 0 && <span className="field-note">Ingen gjeld lagt inn</span>}
              {g.debts.map((d) => (
                <Check key={d.id} label={`${d.name} (${krShort(d.amount)} kr)`} checked={h.settleDebtIds.includes(d.id)}
                  onChange={(c) => api.setItem('homes', h.id, 'settleDebtIds', c ? [...h.settleDebtIds, d.id] : h.settleDebtIds.filter((x) => x !== d.id))} />
              ))}
            </div>
            <div className="field full">
              <Check label="Gevinst på boligen er skattefri (eier- og brukstidsreglene)" checked={h.gainTaxFree} onChange={(c) => api.setItem('homes', h.id, 'gainTaxFree', c)} />
              <Check label="Tomteandelen utover naturlig arrondert tomt er skattepliktig" checked={h.landTaxable} onChange={(c) => api.setItem('homes', h.id, 'landTaxable', c)} />
            </div>
            <details className="full">
              <summary>Gevinstberegning (opprinnelige kostnader)</summary>
              <div className="grid">
                <Money label="Skattepliktig tomteandel av salgssum" value={h.land} onChange={(v) => api.setItem('homes', h.id, 'land', v)} />
                <Money label="Tomtekostpris" value={h.landCost} onChange={(v) => api.setItem('homes', h.id, 'landCost', v)} />
                <Money label="Påkostninger tomt" value={h.landImprovements} onChange={(v) => api.setItem('homes', h.id, 'landImprovements', v)} />
                <Money label="Opprinnelig kjøpesum" hint="Brukes bare hvis gevinsten på boligen er skattepliktig" value={h.purchaseValue} onChange={(v) => api.setItem('homes', h.id, 'purchaseValue', v)} />
                <Money label="Kjøpskostnader den gangen" value={h.acquisitionCosts} onChange={(v) => api.setItem('homes', h.id, 'acquisitionCosts', v)} />
                <Money label="Påkostninger bolig" value={h.propertyImprovements} onChange={(v) => api.setItem('homes', h.id, 'propertyImprovements', v)} />
              </div>
            </details>
          </>}
          {h.kind === 'purchase' && <>
            <Field label="Kjøpsdato"><DateInput label="Kjøpsdato" value={h.date || g.start} min={g.start} onChange={(v) => api.setItem('homes', h.id, 'date', v)} /></Field>
            <Money label="Kjøpesum" value={h.price} onChange={(v) => api.setItem('homes', h.id, 'price', v)} />
            <Pct label="Dokumentavgift" value={h.docFeeRate} onChange={(v) => api.setItem('homes', h.id, 'docFeeRate', v)} hint="Brukt selveierbolig. Ikke for nyoppført." />
            <Money label="Andre omkostninger ved kjøpet" hint="Tinglysing, takst, megler m.m." value={h.costs} onChange={(v) => api.setItem('homes', h.id, 'costs', v)} />
            <Money label="Oppussing og innredning" value={h.improvements} onChange={(v) => api.setItem('homes', h.id, 'improvements', v)} />
            <Money label="Markedsverdi til formuesskatt" hint="0 = samme som kjøpesummen" value={h.marketValue} onChange={(v) => api.setItem('homes', h.id, 'marketValue', v)} />
            <div className="field"><Check label="Beregn dokumentavgift" checked={h.docFee} onChange={(c) => api.setItem('homes', h.id, 'docFee', c)} /></div>
          </>}
        </Card>
      ))}
      {g.homes.length < MAX_ITEMS.homes && (
        <div className="reset-row">
          <button type="button" className="add" onClick={() => api.addItem('homes', { kind: 'owned', label: 'Min bolig' })}>+ Bolig jeg eier</button>
          <button type="button" className="add" onClick={() => api.addItem('homes', { kind: 'sale', label: 'Salg av bolig', date: g.start })}>+ Boligsalg</button>
          <button type="button" className="add" onClick={() => api.addItem('homes', { kind: 'purchase', label: 'Kjøp av bolig', date: g.start })}>+ Boligkjøp</button>
        </div>
      )}
    </div>
  )
}

export function IncomesPanel({ g, api }) {
  return (
    <div className="panel">
      <h2>Inntekter: lønn og pensjon</h2>
      <p className="field-hint">Legg inn hver inntekt for seg, også fra flere arbeidsgivere eller utbetalere. Beløpet er brutto per måned på startdatoen for posten, og øker med valgt prosent hvert år. Skatten regnes av summen av alle poster. Skattetrekket per post avgjør hvor mye som trekkes underveis. Hvis trekket avviker fra beregnet skatt, gjøres det opp som restskatt eller tilgode året etter.</p>
      {g.incomes.map((p) => (
        <Card key={p.id} title={`${p.name || 'Uten navn'} · ${krShort(p.monthly)} kr/mnd`} onRemove={() => api.delItem('incomes', p.id)}>
          <Select label="Type" value={p.kind} options={INCOME_KINDS} onChange={(v) => api.setItem('incomes', p.id, 'kind', v)} />
          <Text label="Navn" value={p.name} onChange={(v) => api.setItem('incomes', p.id, 'name', v)} />
          <Text label={p.kind === 'lønn' ? 'Arbeidsgiver' : 'Utbetaler'} value={p.payer} onChange={(v) => api.setItem('incomes', p.id, 'payer', v)} />
          <Money label="Brutto per måned" value={p.monthly} onChange={(v) => api.setItem('incomes', p.id, 'monthly', v)} />
          <Field label="Starter"><DateInput label="Starter" value={p.start} onChange={(v) => api.setItem('incomes', p.id, 'start', v)} /></Field>
          <Field label="Slutter (valgfritt)"><OptDateInput label="Slutter" value={p.end} onChange={(v) => api.setItem('incomes', p.id, 'end', v)} /></Field>
          <Pct label="Økning per år" value={p.growth} onChange={(v) => api.setItem('incomes', p.id, 'growth', v)} />
          <Select label="Skattetrekk fra denne posten" value={p.wMethod} options={WITHHOLD_METHODS} onChange={(v) => api.setItem('incomes', p.id, 'wMethod', v)}
            hint="Kan endres for enkelte år i tabellen «Overstyr per år»" />
          {p.wMethod === 'tabell'
            ? <Text label="Tabellnummer (valgfritt)" max={10} value={p.wTable} onChange={(v) => api.setItem('incomes', p.id, 'wTable', v)} hint="Bare til info, for eksempel 7100" />
            : <Pct label="Trekkprosent" value={p.wPct} onChange={(v) => api.setItem('incomes', p.id, 'wPct', v)} hint={p.wMethod === 'bi' ? 'Biarbeidsgivere trekker en fast prosent uten fradrag' : 'Fast prosent av brutto'} />}
        </Card>
      ))}
      {g.incomes.length < MAX_ITEMS.incomes && <button type="button" className="add" onClick={() => api.addItem('incomes', { start: g.start })}>+ Legg til lønn eller pensjon</button>}
    </div>
  )
}

export function PayoutsPanel({ g, api }) {
  return (
    <div className="panel">
      <h2>Utbetalinger fra hovedkontoen</h2>
      <p className="field-hint">Beløp som skal ut av kontoen på en bestemt dato, for eksempel oppgjør til en tidligere samboer, gaver eller større utgifter. Pengene tjener rente helt frem til datoen.</p>
      <div className="payouts">
        {g.payouts.map((p) => (
          <div className="payout-row" key={p.id}>
            <Field label="Beskrivelse"><input type="text" value={p.label} maxLength={60} onChange={(e) => api.setItem('payouts', p.id, 'label', e.target.value)} /></Field>
            <Field label="Dato"><DateInput label="Dato" value={p.date} onChange={(v) => api.setItem('payouts', p.id, 'date', v)} /></Field>
            <Field label="Beløp"><MoneyInput label="Beløp" value={p.amount} onChange={(v) => api.setItem('payouts', p.id, 'amount', v)} /></Field>
            <button type="button" className="ghost" onClick={() => api.delItem('payouts', p.id)} aria-label={`Fjern ${p.label}`}>Fjern</button>
          </div>
        ))}
      </div>
      {g.payouts.length < MAX_ITEMS.payouts && <button type="button" className="add" onClick={() => api.addItem('payouts', { date: g.start })}>+ Legg til utbetaling</button>}
    </div>
  )
}
