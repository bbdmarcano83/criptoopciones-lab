# Final validation — Institutional Terminal Migration

Status: **PASS on migration branch; NOT merged to main.**

Validated pages: `index.html`, `positions.html`, `chain.html`, `iv.html`, `ajuste.html`, `diario.html`, `manual.html`.

## Static validation

- Inline JavaScript syntax: PASS on all seven pages.
- Local navigation targets: PASS.
- Shared engine references: PASS where required (`exchange_engine.js`, `iv_engine.js`, `market_engine.js`, `co_shared.js`).
- Manual broken PDF dependencies: removed; browser print-to-PDF remains available.

## Trading-safety validation

- Analyzer real execution is intentionally blocked while Bybit real margin is UNVERIFIED and `execute + adopt` is non-transactional. Simulation remains available.
- Analyzer no longer directly closes a live position; it sends the user to Risk & Positions.
- Risk & Positions uses role-aware CALL/PUT roll modeling.
- Partial position reduction uses `/positions/{label}/resize`; it is not implemented as a disguised total `/close`.
- Adjustment Desk requires fresh/verified data, known max loss, liquidity, verified proposal/margin and explicit human approval before roll execution.
- Roll remains human-in-the-loop; no automatic roll is introduced.

## Verified candidate fingerprints

- `index.html`: SHA256 `02fa39b240e7ca0faa90ce8438cc47c7f6cfd98902ea86ea28f0469ce5222501` — 103882 bytes.
- `manual.html`: SHA256 `4a06fdb5484797300406b0e5f209d3fa23702a635f4ba1f822995d2e109c7a4b` — 52820 bytes.
- `positions.html`: SHA256 `381feb74ff16b4ff43cd906ccbc4e4311a524a5956e4ff054d671f591b4f0ffb`.
- `ajuste.html`: SHA256 `9e5416efdfac75b8d28ed8b379c15bce91690a16e0fa6bb470884b28ebbb8981`.
- `chain.html`: SHA256 `58b8b363bef82ebc16efca811c9c77e3c182cd0826b44cdc1bc6dc7dadb128e7`.
- `iv.html`: SHA256 `ab018b2b1ccd421b849a7c4b736556b46d809880a2135389f75a094b27f89194`.
- `diario.html`: SHA256 `0571a7792d48ea74a563b7c2ce9b166fbf2ede55153e74c09ddb3ae8a35faa68`.

## Promotion rule

`main` remains untouched. Promotion must be a separate explicit step after reviewing the final branch diff. No bot backend or bot `main.py` change is part of this terminal validation.