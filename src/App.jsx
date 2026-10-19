import { useEffect, useMemo, useRef, useState } from 'react'
import { runPlan, planSpan, dayToDate } from './engine.js'
import {
  clampField, clampMoney, loadStore, saveStore, clearAll, hasSavedStore, readLegacyFromBrowser, encodeStore, decodeAny,
  backupText, parseBackup, freshState, freshStore, copyScenarioData, newItem, MAX_NAME, MAX_ITEMS, MAX_AGE,
} from './state.js'
import { Field, MoneyInput, PctInput, DateInput, IntInput, kr, krShort, pct } from './inputs.jsx'
import IncomeChart from './IncomeChart.jsx'
import { ScenarioBar, ChosenBanner } from './ScenarioBar.jsx'
import ComparePanel from './ComparePanel.jsx'
import { AccountsPanel, DebtsPanel, HomesPanel, IncomesPanel, PayoutsPanel } from './sections.jsx'
import { SECTIONS } from './tables.js'
import { exportExcel, downloadText } from './exportXlsx.js'

const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember']
const fmtDay = (n) => dayToDate(n).toLocaleDateString('nb-NO', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })

export default function App() {
  const [store, setStore] = useState(loadStore)
  // Tilbud om å hente scenarioer fra Eiendomsalg (samme nettleser) når Papp åpnes første gang.
  const [legacyOffer, setLegacyOffer] = useState(() => (hasSavedStore() ? null : readLegacyFromBrowser()))
  // Vi lagrer først når noe er endret, slik at tilbudet over består til du har svart på det.
  const initial = useRef(store)
  useEffect(() => { if (store !== initial.current) saveStore(store) }, [store])

  const cache = useRef(new WeakMap())
  const planOf = (data) => {
    let p = cache.current.get(data)
    if (!p) { p = runPlan(data); cache.current.set(data, p) }
    return p
  }
  const plans = store.scenarios.map((sc) => planOf(sc.data))
  const activeIdx = Math.max(0, store.scenarios.findIndex((sc) => sc.id === store.active))
  const activeSc = store.scenarios[activeIdx]
  const g = activeSc.data
  const plan = plans[activeIdx]
  const { years, summary: S } = plan
  const span = useMemo(() => planSpan(g), [g])

  const setG = (fn) => setStore((st) => ({ ...st, scenarios: st.scenarios.map((sc) => (sc.id === st.active ? { ...sc, data: fn(sc.data) } : sc)) }))
  const selectScenario = (id) => setStore((st) => ({ ...st, active: id }))
  const renameScenario = (id, name) => setStore((st) => ({ ...st, scenarios: st.scenarios.map((sc) => (sc.id === id ? { ...sc, name: name.slice(0, MAX_NAME) } : sc)) }))
  const chooseScenario = (id) => setStore((st) => ({ ...st, chosen: id }))
  const copyInto = (srcId) => {
    const src = store.scenarios.find((sc) => sc.id === srcId)
    if (src && window.confirm(`Overskrive alle verdier i «${activeSc.name}» med verdiene fra «${src.name}»?`)) setG(() => copyScenarioData(src.data))
  }

  const put = (k) => (v) => { if (typeof v === 'number' && !Number.isFinite(v)) return; setG((x) => ({ ...x, [k]: typeof v === 'number' ? clampField(k, v) : v })) }
  const toggle = (k) => () => setG((x) => ({ ...x, [k]: !x[k] }))
  const setYr = (year, field, v, incId) => setG((x) => {
    const yr = { ...x.yr }
    const o = { ...(yr[year] || {}) }
    const valid = !(v === '' || v === undefined || !Number.isFinite(v))
    if (incId !== undefined) {
      const inc = { ...(o.inc || {}) }
      if (valid) inc[incId] = clampMoney(v); else delete inc[incId]
      if (Object.keys(inc).length) o.inc = inc; else delete o.inc
    } else if (!valid) delete o[field]
    else o[field] = field === 'rate' ? clampField('rate', v) : clampMoney(v)
    if (Object.keys(o).length) yr[year] = o; else delete yr[year]
    return { ...x, yr }
  })

  // Felles redigering av poster i listene (sparekapital, gjeld, bolig, inntekter, utbetalinger).
  const api = {
    setItem: (list, id, field, val) => setG((x) => ({
      ...x, [list]: x[list].map((it) => (it.id === id ? { ...it, [field]: typeof val === 'number' ? Math.min(1e11, Math.max(0, val)) : val } : it)),
    })),
    addItem: (list, extra) => setG((x) => (x[list].length >= MAX_ITEMS[list] ? x : { ...x, [list]: [...x[list], newItem(list, x[list], extra)] })),
    delItem: (list, id) => setG((x) => {
      const n = { ...x, [list]: x[list].filter((it) => it.id !== id) }
      if (list === 'debts') n.homes = n.homes.map((h) => ({ ...h, settleDebtIds: h.settleDebtIds.filter((d) => d !== id) }))
      if (list === 'homes') n.homes = n.homes.map((h) => (h.sellId === id ? { ...h, sellId: 0 } : h))
      if (list === 'accounts') {
        const ks = n.accounts.filter((a) => a.type === 'konto')
        if (ks.length && !ks.some((a) => a.main)) n.accounts = n.accounts.map((a) => (a.id === ks[0].id ? { ...a, main: true } : a))
      }
      return n
    }),
    setMain: (id) => setG((x) => ({ ...x, accounts: x.accounts.map((a) => (a.type === 'konto' ? { ...a, main: a.id === id } : a)) })),
  }

  const resetActive = () => { if (window.confirm(`Nullstille «${activeSc.name}» til standardverdier? De to andre scenarioene berøres ikke.`)) setG(() => freshState()) }
  const resetAll = () => {
    if (window.confirm('Slette alle tre scenarioene og alt som er lagret på denne enheten, og starte på nytt?')) { clearAll(); setStore(freshStore()) }
  }

  // ---- Overføring, sikkerhetskopi og Excel ----
  const hashDone = useRef(false)
  useEffect(() => {
    if (hashDone.current) return
    hashDone.current = true
    const h = window.location.hash
    if (!h.startsWith('#d=')) return
    const imported = decodeAny(h)
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
    if (!imported) { window.alert('Lenken er ufullstendig eller ødelagt, så ingenting ble hentet inn.'); return }
    if (window.confirm('Erstatte alle scenarioene på denne enheten med de fra lenken?')) setStore(imported.store)
  }, [])
  const [transfer, setTransfer] = useState({ code: '', paste: '', msg: '' })
  const [busy, setBusy] = useState(false)
  const makeCode = () => setTransfer((t) => ({ ...t, code: encodeStore(store), msg: '' }))
  const linkOf = (code) => window.location.origin + window.location.pathname + '#d=' + code
  const copyText = async (text, okMsg) => {
    try { await navigator.clipboard.writeText(text); setTransfer((t) => ({ ...t, msg: okMsg })) } catch { setTransfer((t) => ({ ...t, msg: 'Kunne ikke kopiere automatisk. Marker teksten og kopier selv.' })) }
  }
  const importCode = () => {
    const imported = decodeAny(transfer.paste)
    if (!imported) { setTransfer((t) => ({ ...t, msg: 'Fant ingen gyldig kode eller lenke i teksten.' })); return }
    const what = imported.legacy ? 'Koden er fra Eiendomsalg og gjøres om til Papp-poster. ' : ''
    if (window.confirm(`${what}Erstatte alle tre scenarioene på denne enheten med de du har limt inn?`)) {
      setStore(imported.store); setTransfer({ code: '', paste: '', msg: 'Scenarioene er hentet inn.' })
    }
  }
  const backup = () => {
    const d = new Date().toISOString().slice(0, 10)
    downloadText(`Papp-sikkerhetskopi-${d}.json`, backupText(store))
    setTransfer((t) => ({ ...t, msg: 'Sikkerhetskopien er lagret som fil. På iPhone finner du den i Filer-appen under Nedlastinger.' }))
  }
  const restore = (e) => {
    const f = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => {
      const st = parseBackup(String(reader.result))
      if (!st) { setTransfer((t) => ({ ...t, msg: 'Filen er ikke en gyldig Papp-sikkerhetskopi.' })); return }
      if (window.confirm('Erstatte alle tre scenarioene på denne enheten med innholdet i sikkerhetskopien?')) { setStore(st); setTransfer((t) => ({ ...t, msg: 'Sikkerhetskopien er gjenopprettet.' })) }
    }
    reader.readAsText(f)
  }
  const excel = async () => {
    setBusy(true)
    try { await exportExcel(store, plans); setTransfer((t) => ({ ...t, msg: 'Excel-filen Papp.xlsx er lagret.' })) } catch { setTransfer((t) => ({ ...t, msg: 'Kunne ikke lage Excel-filen.' })) }
    setBusy(false)
  }

  const steadyYear = years.find((y) => y.year >= S.steadyFrom) || years[years.length - 1]
  const yieldAfterTax = steadyYear.savingsClose > 0 ? steadyYear.netReturn / steadyYear.savingsClose : 0
  const taxOnCapital = S.totalInterestTax + S.totalWealthTax + S.totalGainTax

  // Kontantstrøm: uttak og gjeldsbetalinger slås sammen per år, så listen blir lesbar.
  const cashRows = useMemo(() => {
    const out = [], agg = {}
    for (const e of plan.events) {
      if (e.kind === 'uttak' || e.kind === 'gjeld') {
        const k = e.year + '|' + e.label
        const a = agg[k] || (agg[k] = { sum: 0, day: e.day, balance: e.balance, n: 0, year: e.year, label: e.label, kind: e.kind, prio: e.prio })
        a.sum += e.amount; a.day = e.day; a.balance = e.balance; a.n += 1
      } else out.push(e)
    }
    Object.values(agg).forEach((a) => out.push({ day: a.day, year: a.year, prio: a.prio, kind: a.kind, label: `${a.label} (${a.n} ${a.n === 1 ? 'betaling' : 'betalinger'})`, amount: a.sum, balance: a.balance }))
    return out.sort((a, b) => a.day - b.day || a.prio - b.prio)
  }, [plan.events])

  const pctField = (key, label, hint) => <Field label={label} hint={hint}><PctInput label={label} value={g[key]} onChange={put(key)} /></Field>
  const moneyField = (key, label, hint) => <Field label={label} hint={hint}><MoneyInput label={label} value={g[key]} onChange={put(key)} /></Field>
  const monthSelect = (key, label) => (
    <Field label={label}>
      <select value={g[key]} onChange={(e) => put(key)(Number(e.target.value))}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
    </Field>
  )

  return (
    <div className="wrap">
      <h1>Papp · pensjonistappen</h1>
      <p className="lede">
        Planlegg privatøkonomien din fra en startdato: sparekapital, gjeld, bolig, lønn og pensjon. Modellen følger pengene dag for dag og viser skatt,
        formuesskatt og hva du har til disposisjon hvert år. Alle tall er anslag med dagens skatteregler, og du kan endre alt. Du kan ha tre alternative scenarioer og velge ett som ditt valg.
      </p>

      {legacyOffer && (
        <div className="panel notice">
          <h2>Fant scenarioene dine fra Eiendomsalg</h2>
          <p className="field-hint">De ligger lagret i denne nettleseren. Vil du hente dem inn i Papp? De gjøres om til sparekapital, gjeld, bolig og inntekter. Husk å fylle inn fødselsdatoen din under «Grunnlag og planløp».</p>
          <div className="reset-row">
            <button type="button" className="primary" onClick={() => { setStore(legacyOffer); setLegacyOffer(null) }}>Hent inn</button>
            <button type="button" className="ghost" onClick={() => setLegacyOffer(null)}>Ikke nå</button>
          </div>
        </div>
      )}

      <ChosenBanner store={store} plans={plans} onSelect={selectScenario} />
      <ScenarioBar store={store} plans={plans} onSelect={selectScenario} onRename={renameScenario} onChoose={chooseScenario} onCopy={copyInto} />

      {/* key = scenario-id: feltene bygges på nytt når du bytter scenario, så ingen halvferdig redigering følger med */}
      <div key={activeSc.id}>

        {plan.warnings.length > 0 && (
          <div className="panel warn" role="alert">
            <h2>Sjekk dette</h2>
            {plan.warnings.map((w) => <p key={w}>{w}</p>)}
          </div>
        )}

        <div className="panel">
          <h2>Hovedresultat · {activeSc.name}</h2>
          <div className="hero-grid multi">
            <div className="hero">
              <span>Netto avkastning per måned</span>
              <strong>{krShort(S.avgNetReturnPerMonth)}</strong>
              <small>snitt {S.steadyFrom}–{S.endYear}, etter skatt og formuesskatt · {pct(yieldAfterTax)} av sparekapitalen per år</small>
            </div>
            <div className="hero">
              <span>Disponibelt per måned</span>
              <strong>{krShort(S.avgDisposablePerMonth)}</strong>
              <small>lønn og pensjon etter skatt + uttak · {krShort(S.avgDisposablePerMonthReal)} kr i startårets kroner</small>
            </div>
            <div className="hero">
              <span>Sparekapital 31.12.{S.endYear}</span>
              <strong>{krShort(S.closingAfterTax)}</strong>
              <small>{krShort(S.closingReal)} kr i startårets kroner{S.outstandingTax > 1 ? ` · etter ${krShort(S.outstandingTax)} kr restskatt som forfaller året etter` : ''}</small>
            </div>
            <div className="hero">
              <span>Skatt på kapital, {S.years} år</span>
              <strong>{krShort(taxOnCapital)}</strong>
              <small>herav formuesskatt {krShort(S.totalWealthTax)} kr og skatt på renter {krShort(S.totalInterestTax)} kr</small>
            </div>
          </div>
          <p className="field-hint">
            Sparekapital ved start: <b>{kr(S.initial)}</b>{S.debtStart > 0 ? <>, gjeld ved start: <b>{kr(S.debtStart)}</b></> : ''}.
            {S.homeCost > 0 ? <> Boligkjøp koster totalt <b>{kr(S.homeCost)}</b>.</> : ''}
            {S.debtEnd > 0 || S.debtStart > 0 ? <> Gjeld ved slutt: <b>{kr(S.debtEnd)}</b>.</> : ''}
            {' '}Netto formue ved slutt: <b>{kr(S.netWorthEnd)}</b>.
            Snittene gjelder fra {S.steadyFrom}, første år uten engangshendelser (salg, kjøp, utbetalinger og endringer i inntekt).
            {S.targetEnabled ? ` Sparemål: ${kr(S.target)} i ${S.endYear}, som gir ${kr(S.extraPerMonth)} per måned i ekstra forbruk.` : ''}
          </p>
        </div>

        <ComparePanel store={store} plans={plans} />

        <div className="panel">
          <h2>Disponibel inntekt per måned · {activeSc.name}</h2>
          <IncomeChart years={years} />
        </div>

        <div className="panel">
          <h2>År for år · {activeSc.name}</h2>
          <div className="plan-scroll">
            <table className="plan-table">
              <thead><tr><th></th>{years.map((y) => <th key={y.year}>{y.year}</th>)}</tr></thead>
              <tbody>
                <tr className="sub"><td>Alder 31.12</td>{years.map((y) => <td key={y.year}>{y.age ?? ''}</td>)}</tr>
                <tr className="sub"><td>Rente hovedkonto</td>{years.map((y) => <td key={y.year}>{pct(y.rate)}</td>)}</tr>
                {SECTIONS.map((s) => (
                  [<tr className="sect" key={s.title}><td colSpan={years.length + 1}>{s.title}</td></tr>,
                    ...s.rows.filter((r) => !r.hide || years.some((y) => Math.abs(r.f(y)) > 0.5)).map((r) => (
                      <tr key={r.l} className={r.strong ? 'strong' : ''}><td>{r.l}</td>{years.map((y) => <td key={y.year}>{krShort(r.f(y))}</td>)}</tr>
                    ))]
                ))}
              </tbody>
            </table>
          </div>
          <p className="field-hint">Alle beløp i kroner. Skatt på lønn og pensjon trekkes fra inntektene og belaster ikke kapitalen. Skatt på renter, gevinst og formue betales fra kapitalen.</p>
          <details className="tax-detail">
            <summary>Vis alle hendelser på hovedkontoen (dato for dato)</summary>
            <div className="plan-scroll tall">
              <table className="plan-table events">
                <thead><tr><th>Dato</th><th>Hendelse</th><th>Beløp</th><th>Saldo etter</th></tr></thead>
                <tbody>{cashRows.map((e, i) => <tr key={i}><td>{fmtDay(e.day)}</td><td>{e.label}</td><td>{krShort(e.amount)}</td><td>{krShort(e.balance)}</td></tr>)}</tbody>
              </table>
            </div>
          </details>
        </div>

        <div className="panel">
          <h2>Grunnlag og planløp</h2>
          <div className="grid">
            <Field label="Fødselsdato"><DateInput label="Fødselsdato" value={g.birth} min="1920-01-01" max="2010-12-31" onChange={put('birth')} /></Field>
            <Field label="Startdato for sparekapital" hint="Datoen kapitalen og gjelden under gjelder for"><DateInput label="Startdato" value={g.start} min="2020-01-01" max="2100-12-31" onChange={put('start')} /></Field>
            <Field label="Planløp (antall år)" hint={`Standard 10. Høyst ${span.maxYears} år med din alder.`}><IntInput label="Planløp" value={g.years} min={1} max={span.maxYears} onChange={put('years')} /></Field>
            {pctField('inflation', 'Inflasjon', 'Brukes bare til tall i startårets kroner')}
          </div>
          <p className="field-hint">
            {span.ageAtStart !== null ? <>Du er <b>{span.ageAtStart} år</b> ved start. Planen går fra {span.startYear} til <b>{S.endYear}</b>, og du er da <b>{S.ageEnd} år</b>. </> : ''}
            Planen kan ikke gå forbi {MAX_AGE} år.
          </p>
          <div className="checks">
            <label><input type="checkbox" checked={g.joint} onChange={toggle('joint')} /> Gift/registrert partner/meldepliktig samboer: skattlegges samlet</label>
            <label><input type="checkbox" checked={g.autoWithdraw} onChange={toggle('autoWithdraw')} /> Bruk netto avkastning som månedlig uttak, så sparekapitalen står urørt</label>
          </div>
        </div>

        <AccountsPanel g={g} api={api} startMin={g.start} />
        <DebtsPanel g={g} api={api} />
        <HomesPanel g={g} api={api} />
        <IncomesPanel g={g} api={api} />
        <PayoutsPanel g={g} api={api} />

        <div className="panel">
          <h2>Sparemål og forbruk</h2>
          <div className="checks">
            <label><input type="checkbox" checked={!!g.targetEnabled} onChange={toggle('targetEnabled')} /> Jeg vil bruke av kapitalen, og la en bestemt sum stå igjen i {S.endYear}</label>
          </div>
          {g.targetEnabled && (
            <>
              <div className="grid">{moneyField('targetClosing', `Sparekapital som skal stå igjen 31.12.${S.endYear} (etter skatt)`, 'Appen regner ut hvor mye du kan bruke resten av tiden')}</div>
              <div className="hero-grid multi">
                <div className="hero"><span>Ekstra forbruk per måned</span><strong>{krShort(S.extraPerMonth)}</strong><small>{krShort(S.extraPerMonth * 12)} kr per år, i tillegg til avkastningen · fra {S.steadyFrom}</small></div>
                <div className="hero"><span>Totalt uttak per måned</span><strong>{krShort(S.avgWithdrawalPerMonth)}</strong><small>avkastning etter skatt + ekstra forbruk (snitt {S.steadyFrom}–{S.endYear})</small></div>
                <div className="hero"><span>Disponibelt per måned</span><strong>{krShort(S.avgDisposablePerMonth)}</strong><small>lønn og pensjon etter skatt + uttak</small></div>
              </div>
              <div className="plan-scroll">
                <table className="plan-table">
                  <thead><tr><th>Uttak per måned</th>{years.map((y) => <th key={y.year}>{y.year}</th>)}</tr></thead>
                  <tbody><tr><td>Fra kapitalen</td>{years.map((y) => <td key={y.year}>{krShort(y.withdrawalPerMonth)}</td>)}</tr></tbody>
                </table>
              </div>
            </>
          )}
          <p className="field-hint">
            Ekstra forbruk tas fra og med {S.steadyFrom} og gjelder alle år du ikke har overstyrt uttaket i tabellen under. Tallet regnes ut slik at sparekapitalen etter skatt blir lik målet.
            Uten sparemål lar appen kapitalen stå urørt og du bruker bare avkastningen.
          </p>
        </div>

        <div className="panel">
          <h2>Overstyr per år</h2>
          <p className="field-hint">
            Tomme felt bruker verdien fra året før (rente) eller årlig økning (inntekter). Skriv inn en verdi for å endre fra og med det året. Rente gjelder alle bankkontoer.
            Uttak: tomt = hele netto avkastning tas ut, så kapitalen står uendret. Fyll inn et beløp for å velge selv (kroner per år).
          </p>
          <div className="plan-scroll">
            <table className="plan-table inputs">
              <thead><tr><th></th>{years.map((y) => <th key={y.year}>{y.year}</th>)}</tr></thead>
              <tbody>
                <tr>
                  <td>Rente bankkontoer (%)</td>
                  {years.map((y) => <td key={y.year}><PctInput label={`Rente ${y.year}`} allowEmpty value={g.yr[y.year]?.rate} placeholder={y.rate} onChange={(v) => setYr(y.year, 'rate', v)} /></td>)}
                </tr>
                {g.incomes.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name || 'Inntekt'} per måned</td>
                    {years.map((y) => {
                      const line = y.incomeLines.find((l) => l.id === p.id)
                      return <td key={y.year}><MoneyInput label={`${p.name} ${y.year}`} allowEmpty value={g.yr[y.year]?.inc?.[p.id]} placeholder={line ? line.monthly : 0} onChange={(v) => setYr(y.year, 'inc', v, p.id)} /></td>
                    })}
                  </tr>
                ))}
                <tr>
                  <td>Uttak fra kapital per år</td>
                  {years.map((y) => <td key={y.year}><MoneyInput label={`Uttak ${y.year}`} allowEmpty value={g.yr[y.year]?.withdrawal} onChange={(v) => setYr(y.year, 'withdrawal', v)} /></td>)}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <h2>Betaling av skatt</h2>
          <div className="grid">
            {pctField('advanceShare', 'Andel betalt som forskuddsskatt', '100 % = alt betales i inntektsåret')}
            {monthSelect('advanceMonth', 'Forskudd regnes betalt i')}
            {monthSelect('taxPaymentMonth', 'Restskatt betales i')}
            {pctField('taxAuthorityRate', 'Rentetillegg på restskatt', 'Sist kjente sats')}
          </div>
          <p className="field-hint">Modellen legger hele forskuddet på én dato (15. i valgt måned) som en forenkling. Skatt på lønn og pensjon trekkes av utbetaleren og er ikke med her.</p>
        </div>

        <details className="panel">
          <summary>Avanserte forutsetninger: inntektsskatt</summary>
          <p className="field-hint">Modellen bruker sist kjente satser. Oppdater her når nye satser publiseres.</p>
          <div className="grid">
            {moneyField('personfradrag', 'Personfradrag')}
            {pctField('trygdeLonn', 'Trygdeavgift lønn')}
            {pctField('trygdePensjon', 'Trygdeavgift pensjon')}
            {pctField('mfLonnSats', 'Minstefradrag lønn, sats')}
            {moneyField('mfLonnTak', 'Minstefradrag lønn, tak')}
            {pctField('mfPensjonSats', 'Minstefradrag pensjon, sats')}
            {moneyField('mfPensjonTak', 'Minstefradrag pensjon, tak')}
            {pctField('fellesskattSats', 'Skatt på alminnelig inntekt')}
            {moneyField('pensionCreditMax', 'Pensjonistfradrag, maks')}
            {moneyField('pensionStep1', 'Pensjonistfradrag: avtrapping starter')}
            {moneyField('pensionStep2', 'Pensjonistfradrag: trinn 2 starter')}
            {pctField('pensionRate1', 'Avtrappingssats trinn 1')}
            {pctField('pensionRate2', 'Avtrappingssats trinn 2')}
          </div>
          <div className="checks">
            <label><input type="checkbox" checked={g.tjenesteCredit} onChange={toggle('tjenesteCredit')} /> Annen pensjon enn folketrygd gir også rett til pensjonistfradrag (vanligvis bare folketrygd)</label>
          </div>
          <h3 className="sub-h">Trinnskatt</h3>
          <div className="grid">
            {[1, 2, 3, 4, 5].map((i) => [
              <div key={'f' + i}>{moneyField('trinn' + i + 'Fra', `Trinn ${i}: fra`)}</div>,
              <div key={'s' + i}>{pctField('trinn' + i + 'Sats', `Trinn ${i}: sats`)}</div>,
            ])}
          </div>
        </details>

        <details className="panel">
          <summary>Avanserte forutsetninger: formuesskatt og fond/aksjer</summary>
          <p className="field-hint">Bunnfradrag og trinnbredde gjelder enslig og dobles ved felles ligning. Bankinnskudd verdsettes til 100 %. Sjekk satsene for fond og aksjer på skatteetaten.no.</p>
          <div className="grid">
            {moneyField('formueBunnfradrag', 'Bunnfradrag (enslig)')}
            {moneyField('formueTrinn2Bredde', 'Bredde på trinn 1 (enslig)')}
            {pctField('formueSats1', 'Sats trinn 1')}
            {pctField('formueSats2', 'Sats trinn 2')}
            {moneyField('primaerboligTak', 'Primærbolig: verdsettelsestak')}
            {pctField('primaerboligSatsUnder', 'Primærbolig: andel av verdi under tak')}
            {pctField('primaerboligSatsOver', 'Primærbolig: andel av verdi over tak')}
            {pctField('valFond', 'Fond: verdsettelse til formuesskatt', 'Andel av markedsverdi')}
            {pctField('valAksjer', 'Aksjer: verdsettelse til formuesskatt', 'Andel av markedsverdi')}
            {pctField('fondGainRate', 'Skatt på gevinst ved salg av fond og aksjer', 'Forenklet: uten skjermingsfradrag')}
          </div>
        </details>

        <div className="panel">
          <h2>Sikkerhetskopi, Excel og overføring til en annen enhet</h2>
          <p className="field-hint">
            Tallene lagres bare i nettleseren på denne enheten. Lag en sikkerhetskopi av alle tre scenarioene som fil, eller last dem ned som Excel.
            For å få de samme scenarioene på en annen enhet lager du en overføringskode eller bruker sikkerhetskopifilen.
          </p>
          <div className="reset-row">
            <button type="button" className="primary" onClick={backup}>Last ned sikkerhetskopi (.json)</button>
            <button type="button" className="ghost" onClick={excel} disabled={busy}>{busy ? 'Lager Excel …' : 'Last ned som Excel (.xlsx)'}</button>
            <label className="ghost file-btn">Gjenopprett fra fil<input type="file" accept=".json,application/json" onChange={restore} hidden /></label>
          </div>
          <div className="reset-row">
            <button type="button" className="ghost" onClick={makeCode}>Lag overføringskode</button>
          </div>
          {transfer.code && (
            <>
              <textarea className="transfer-box" readOnly rows={4} value={linkOf(transfer.code)} onFocus={(e) => e.target.select()} aria-label="Overføringslenke" />
              <div className="reset-row">
                <button type="button" className="ghost" onClick={() => copyText(linkOf(transfer.code), 'Lenken er kopiert. Lim den inn i Notater eller en melding til deg selv.')}>Kopier lenke</button>
                <button type="button" className="ghost" onClick={() => copyText(transfer.code, 'Koden er kopiert.')}>Kopier bare koden</button>
              </div>
            </>
          )}
          <label className="field">
            <span className="field-label">Hent inn fra en annen enhet (eller fra Eiendomsalg): lim inn kode eller lenke</span>
            <textarea className="transfer-box" rows={3} value={transfer.paste} onChange={(e) => setTransfer((t) => ({ ...t, paste: e.target.value, msg: '' }))} placeholder="PA1.… eller EA1.…" />
          </label>
          <div className="reset-row">
            <button type="button" className="ghost" disabled={!transfer.paste.trim()} onClick={importCode}>Hent inn og erstatt alle scenarioer</button>
          </div>
          {transfer.msg && <p className="field-hint" role="status"><b>{transfer.msg}</b></p>}
        </div>

        <div className="footnote">
          <b>Forutsetninger og begrensninger.</b> Renter på bankkontoer beregnes som enkel rente per dag og krediteres 31.12. Fond og aksjer vokser med forventet avkastning og skattlegges først ved salg,
          forenklet uten skjermingsfradrag. Gjeldsrenter gir rentefradrag, og renter og avdrag betales den 15. hver måned. Inntektene øker med valgt prosent per år.
          Pensjonistfradraget beregnes bare av folketrygden, med mindre du krysser av for noe annet. Formuesskatt beregnes på formue 31.12 og er forenklet.
          Skattereglene er forenklet og forutsetter dagens satser, så resultatet er et planleggingsanslag og ikke skatteberegning. Kontroller viktige beslutninger mot skatteetaten.no eller en rådgiver.
          Verdiene lagres bare i denne nettleseren på denne enheten, ikke på noen server.
          <div className="reset-row">
            <button type="button" className="ghost" onClick={resetActive}>Nullstill {activeSc.name}</button>
            <button type="button" className="ghost" onClick={resetAll}>Slett alt lagret og start på nytt</button>
          </div>
        </div>
      </div>
    </div>
  )
}
