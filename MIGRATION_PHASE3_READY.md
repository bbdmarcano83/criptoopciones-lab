# Migration Phase 3 — Read-only market pages preflight

Authoritative source: user-provided `criptoopciones-lab-professional-v2(1).zip`.

This phase is intentionally conservative. No production/main changes are included here. Before replacing read-only market pages, the exact source files were validated locally against the shared engines already present on this migration branch.

## Exact source fingerprints

- `chain.html` — 42,336 bytes — SHA256 `58b8b363bef82ebc16efca811c9c77e3c182cd0826b44cdc1bc6dc7dadb128e7`
- `iv.html` — 43,193 bytes — SHA256 `ab018b2b1ccd421b849a7c4b736556b46d809880a2135389f75a094b27f89194`
- `diario.html` — 33,809 bytes — SHA256 `0571a7792d48ea74a563b7c2ce9b166fbf2ede55153e74c09ddb3ae8a35faa68`
- `ajuste.html` — 58,630 bytes — SHA256 `9e5416efdfac75b8d28ed8b379c15bce91690a16e0fa6bb470884b28ebbb8981`
- `index.html` — 103,349 bytes — SHA256 `c4026e999bff73eabe2c8c260fb16758e5b13552d80a438ea11a8cd05144d085`
- `positions.html` — 128,434 bytes — SHA256 `bbc467d5be03c3853a28de74b591870e1ad3cd42d0288dba9184773d23ac2351`

## Preflight results

- `chain.html`: inline JavaScript syntax OK.
- `iv.html`: inline JavaScript syntax OK.
- Both reference the same local engines: `exchange_engine.js`, `iv_engine.js`, `market_engine.js`, `co_shared.js`.
- External Plotly dependency remains the same CDN version used by the source project.
- No bot backend or live trading code is changed in this phase.

## Promotion rule

Only exact source files matching the SHA256 fingerprints above should be promoted. Do not hand-reconstruct or partially replace these large HTML files. Validate on the migration branch first; `main` remains untouched until the full terminal passes page-by-page checks.
