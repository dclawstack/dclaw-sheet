# Consensus Bug Report — dclaw-sheet

**Auditors:** opus-4.8 + sonnet-4.6 (independent) · reconciled by opus-4.8.
**Confirmed by both models: 4** · Opus: 16 · Sonnet: 15

## 🔴 Confirmed bugs (found by both models)

#### 1. 🟧 [HIGH/security] JWKS cache never expires across rotated keys causing auth failure
- **Location:** `backend/app/core/auth.py:134`
- **Problem:** _fetch_jwks caches JWKS in a module-global dict with no TTL or invalidation. When the IdP rotates signing keys, all new tokens are rejected until process restart, and there is no refresh-on-miss.
- **Fix:** Add a TTL to the cache and force a JWKS re-fetch on kid mismatch before raising 401.

#### 2. 🟧 [HIGH/data-loss] Telemetry emit() commits/rolls back on shared session, breaking transaction isolation and risking data loss
- **Location:** `backend/app/services/telemetry.py:40`
- **Problem:** emit() calls db.commit()/db.rollback() on the shared request-scoped session, prematurely committing or discarding the caller's pending changes mid-handler.
- **Fix:** Use a separate session/transaction for telemetry, or use a savepoint (begin_nested), or emit after the main transaction commits.

#### 3. 🟨 [MEDIUM/security] Content-Disposition / export filename header handling via sheet name
- **Location:** `backend/app/api/v1/sheets.py:168`
- **Problem:** The export filename is derived from sheet.name via safe_name sanitisation and placed in the Content-Disposition header. Auditor A judged it safe; auditor B flags RFC 5987 encoding and quote-escaping concerns. Both examine the same code location.
- **Fix:** Use RFC 5987 encoding (filename*=UTF-8'') or ensure the sanitised name can never contain quotes/semicolons.

#### 4. 🟨 [MEDIUM/correctness] recalc seeds formula cells with stale DB values / startswith on cell value
- **Location:** `backend/app/services/formula/recalc.py:146`
- **Problem:** In _evaluate_targets the seed loop uses c.value.startswith('#') and setdefault to seed existing formula values; stale DB values for non-dirty cells may feed incorrect inputs to dirty dependents.
- **Fix:** Only seed formula cells not in the current recalc targets, and ensure cell.value is a str before calling startswith.

