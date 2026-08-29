# Integral Terminal Migration Audit

Scope: `migration-local-institutional-20260828` only. Production `main` is not modified by this audit.

## Page status

- `chain.html` — exact institutional source, JS syntax OK, read-only market workflow.
- `iv.html` — exact institutional source, JS syntax OK.
- `diario.html` — exact institutional source, JS syntax OK; journal/live reads only.
- `ajuste.html` — exact institutional source, JS syntax OK; roll execution requires verified proposal/margin gates and explicit human approval.
- `positions.html` — reviewed institutional candidate, JS syntax OK; role-aware CALL/PUT roll modeling; partial reduction uses `/resize`, never disguised `/close`; roll requires explicit approval.
- `manual.html` — institutional manual candidate audited; passive page, no bot fetch/execution. Broken PDF download dependencies are removed while print-to-PDF remains available.
- `index.html` — institutional Analyzer candidate audited. Live Analyzer execution must remain blocked while real Bybit margin is UNVERIFIED and execute+adopt is not transactional. Dry-run/simulation remains allowed. Position closing is delegated to Risk & Positions instead of direct Analyzer close.

## Safety invariants validated

1. MODEL / UNVERIFIED data is not treated as executable truth in Adjustment/Risk flows.
2. Rolls remain human-in-the-loop and require explicit approval.
3. Partial resize is separated from total close.
4. Analyzer must not perform a non-transactional real `execute` followed by a separate `adopt`.
5. Position management/close belongs to Risk & Positions, where ownership/freshness safety gates exist.
6. Frontend navigation uses local project pages/engines only; no missing PDF files are required by the manual candidate.
7. `co_shared.js` contains no unreachable initializer after `navHTML()` returns; this cleanup does not alter trading behavior.

## Candidate fingerprints after audit

- `index.html` candidate: SHA256 `02fa39b240e7ca0faa90ce8438cc47c7f6cfd98902ea86ea28f0469ce5222501` — 103882 bytes.
- `manual.html` candidate: SHA256 `4a06fdb5484797300406b0e5f209d3fa23702a635f4ba1f822995d2e109c7a4b` — 52820 bytes.
- `positions.html`: SHA256 `381feb74ff16b4ff43cd906ccbc4e4311a524a5956e4ff054d671f591b4f0ffb`.
- `ajuste.html`: SHA256 `9e5416efdfac75b8d28ed8b379c15bce91690a16e0fa6bb470884b28ebbb8981`.
- `chain.html`: SHA256 `58b8b363bef82ebc16efca811c9c77e3c182cd0826b44cdc1bc6dc7dadb128e7`.
- `iv.html`: SHA256 `ab018b2b1ccd421b849a7c4b736556b46d809880a2135389f75a094b27f89194`.
- `diario.html`: SHA256 `0571a7792d48ea74a563b7c2ce9b166fbf2ede55153e74c09ddb3ae8a35faa68`.

## Promotion gate

Do not merge to `main` until the two audited candidates (`manual.html`, `index.html`) are materialized on the migration branch and their GitHub content matches the fingerprints above. After that, perform one final branch diff and keep promotion as a separate, explicit step.