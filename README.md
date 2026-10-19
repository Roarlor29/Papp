# Papp – pensjonistappen

Privatøkonomi for voksne (særlig over 60): sparekapital (konto, fond, aksjer), gjeld, bolig (salg og kjøp), lønn og pensjon,
skatt og formuesskatt, i inntil tre alternative scenarioer. Alt regnes i nettleseren og lagres bare på enheten din.

## Slik legges den ut (GitHub Pages)
1. Lag et nytt repo som heter `Papp`.
2. Last opp innholdet i denne mappen (index.html, package.json, vite.config.js, README.md, mappene `public` og `src`).
3. Legg til filen `.github/workflows/deploy.yml` (innholdet ligger i `DEPLOY-FIL-deploy.yml`).
4. Settings → Pages → Source: GitHub Actions.
5. Etter 1–2 minutter ligger appen på `https://<brukernavn>.github.io/Papp/`.

## Filer
- `src/engine.js` – regnemotoren (sparekapital, gjeld, bolig, inntekter, skatt)
- `src/state.js` – standardverdier, opprydding, lagring, overføring, import fra Eiendomsalg
- `src/App.jsx`, `src/sections.jsx` – skjermbilder
- `src/exportXlsx.js` – Excel-eksport og nedlasting av sikkerhetskopi
- `src/selfChecks.js` – selvtester som kjøres ved oppstart (se konsollen)
