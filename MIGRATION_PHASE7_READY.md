# Migration Phase 7 — Positions / Risk Desk ready

Authoritative base source: user-provided `criptoopciones-lab-professional-v2(1).zip`.

## Candidate identity

- Original source `positions.html`: 128,434 bytes — SHA256 `bbc467d5be03c3853a28de74b591870e1ad3cd42d0288dba9184773d23ac2351`
- Reviewed Phase 7 candidate: 129,606 bytes — SHA256 `381feb74ff16b4ff43cd906ccbc4e4311a524a5956e4ff054d671f591b4f0ffb`

The Phase 7 candidate intentionally differs from the untouched ZIP only for the reviewed roll-model hardening. It preserves the institutional positions page and keeps real execution delegated to the backend.

## Safety checks passed

- Inline JavaScript syntax validated before staging.
- Old roll type bug (`call` forced regardless of leg type) is absent.
- Roll estimates are role-aware: CALL short/long are modeled together; PUT short/long are modeled together.
- Mixed structures do not invent an executable roll quote when a homogeneous pair is unavailable.
- Partial reduction uses `POST /positions/${p.label}/resize` with `partial_resize` capability gating.
- Full manual close remains a separate `/close` action; partial reduction is never implemented as a disguised full close.
- GitHub Actions reconstructed the candidate from staged payload and verified the exact SHA256 before committing `positions.html`.

## Promotion status

Phase 7 is ready on `migration-local-institutional-20260828` for integrated terminal validation. No production bot `main.py` change is part of this phase. The repository `main` branch should remain untouched until the complete terminal validation is finished.
