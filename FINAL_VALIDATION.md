# Final validation — Institutional Terminal Migration

Status: **PASS on migration branch; NOT merged to main.**

Branch validated: `migration-local-institutional-20260828`.

Validated pages: `index.html`, `positions.html`, `chain.html`, `iv.html`, `ajuste.html`, `diario.html`, `manual.html`.

## Static validation

- Inline JavaScript syntax: PASS on all seven pages.
- Shared JavaScript engines: PASS with `node --check` for `exchange_engine.js`, `iv_engine.js`, `market_engine.js`, `co_shared.js` and `co_bot.js`.
- Local navigation targets: PASS. `chain.html` and `iv.html` obtain the full seven-page navigation through `navHTML()` in `co_shared.js`.
- Local asset/dependency references: PASS; no missing local HTML/JS dependency was detected.
- Local HTTP smoke: PASS; all seven pages and the four shared engines returned HTTP 200 from a local static server.
- Manual broken PDF dependencies: removed; browser print / print-to-PDF remains available for one section or the full manual.
- Shared navigation cleanup: removed unreachable `_initNav` scheduling after `return` in `navHTML()`; no trading logic changed.
- Legacy entry pages `CriptoOpciones_Lab.html` and `quant_options_lab.html` redirect to `index.html`.

A headless Chromium browser smoke was attempted, but this execution environment blocks loopback navigation with `ERR_BLOCKED_BY_ADMINISTRATOR`; this is an environment restriction, not a terminal failure. Therefore no claim of browser-runtime/API connectivity validation is made here.

## Trading-safety validation

- Analyzer real execution is intentionally blocked while real Bybit margin is UNVERIFIED and `execute + adopt` is non-transactional. Simulation remains available.
- Analyzer no longer directly closes a live position; it delegates management to Risk & Positions.
- Risk & Positions uses role-aware CALL/PUT roll modeling; the old always-CALL bug is absent.
- Partial position reduction uses `/positions/{label}/resize`; it is not implemented as a disguised total `/close`.
- Adjustment Desk preserves the existing verification/human-approval gates before roll execution.
- Roll remains human-in-the-loop; no automatic roll is introduced.

## Materialization confirmed on GitHub

The migration branch currently contains the audited candidate blobs:

- `index.html`: Git blob `0577771c7daa0fecd9ce7b2c83eb14a04db372ea`, 103882 bytes; SHA256 `02fa39b240e7ca0faa90ce8438cc47c7f6cfd98902ea86ea28f0469ce5222501`.
- `manual.html`: Git blob `0f2efde9a4c1e903f6dd8fd148a8c02bc38b0d7f`, 52820 bytes; SHA256 `4a06fdb5484797300406b0e5f209d3fa23702a635f4ba1f822995d2e109c7a4b`.
- `positions.html`: Git blob `c91a1529bc1a671fce2a0d3d5289d574066ac5d5`; SHA256 `381feb74ff16b4ff43cd906ccbc4e4311a524a5956e4ff054d671f591b4f0ffb`.
- `ajuste.html`: Git blob `72a2a16f0c52e5170f1f4984cd11ac742e19bbbc`; SHA256 `9e5416efdfac75b8d28ed8b379c15bce91690a16e0fa6bb470884b28ebbb8981`.
- `chain.html`: Git blob `dcf750dc079e0e94f4416fdf21bdf973beb4ff42`; SHA256 `58b8b363bef82ebc16efca811c9c77e3c182cd0826b44cdc1bc6dc7dadb128e7`.
- `iv.html`: Git blob `32c83e8c7dbbd44e9c29b68ab58529b65900f720`; SHA256 `ab018b2b1ccd421b849a7c4b736556b46d809880a2135389f75a094b27f89194`.
- `diario.html`: Git blob `55d4ea913230036add83be7d45e6ba19408b0f3f`; SHA256 `0571a7792d48ea74a563b7c2ce9b166fbf2ede55153e74c09ddb3ae8a35faa68`.

The common engines on the branch are the exact authoritative project versions: `exchange_engine.js` 8027 bytes, `iv_engine.js` 12277 bytes, `market_engine.js` 5361 bytes and `co_shared.js` 10783 bytes (Git blob `170a0649328b777e775f89baea6974460bc1ef08`).

## Local acceptance gate

Status: **PASS — confirmed by the owner on 2026-08-29.**

The complete local acceptance checklist was reported successful:

- Seven-page visual/layout review.
- BTC and ETH market data on Bybit and Deribit.
- Deribit DVOL 52W IVR/IVP.
- Read-only Bot V5 connection.
- Chain → Analyzer state transfer.
- Positions → Adjustment state transfer and safety gates.
- Diario default and KPIs in PRODUCTION ONLY.
- Manual section and full-manual print/print-to-PDF.

## Promotion rule

`main` remains untouched. Static, integration and local acceptance gates are complete. The pull request may be marked **ready for review**, but it must not merge automatically. Promotion to `main` remains a separate explicit action by the owner. No bot backend or bot `main.py` change is part of this frontend terminal validation.