# MFA recovery-code concurrency: test specification

Status: design / tests first. Target: two independent Next.js production processes sharing one SQLite database.

## Existing verified baseline
- Same recovery code submitted concurrently with distinct, valid login challenges: exactly one 200 success; other request is rejected (400 auth_failed or 404 not_found).
- Exactly one active session and used challenge, zero remaining recovery codes.
- 100/100 repetitions passed under this baseline.
- Defect: a 400 auth_failed losing request can increment MfaLoginAttempt.failCount to 1 after the successful request reset it.

## Required behavior and cases

| ID | Scenario | Expected |
| --- | --- | --- |
| MFA-RACE-001 | Two requests begin concurrently with same valid recovery code, distinct challenges | One success, one rejection, one session, one used challenge, code consumed once |
| MFA-RACE-002 | Concurrent losing request observes code already consumed during its processing | No additional MFA failure count or lock caused solely by that race |
| MFA-RACE-003 | Previously consumed recovery code submitted in a new request after redemption | Authentication rejected and counted as invalid attempt |
| MFA-RACE-004 | Five invalid recovery-code submissions | 15-minute MFA lock remains enforced |
| MFA-RACE-005 | A different invalid code submitted concurrently with a valid code | Invalid code must not be classified as a benign race |
| MFA-RACE-006 | Valid recovery code submitted again after process restart | Reuse rejected and counted; no new session |
| MFA-RACE-007 | Concurrent valid code requests with different challenges across two processes | Both process orderings preserve consistency; no 500 or double redemption |
| MFA-RACE-008 | Both HTTP requests are dispatched concurrently but one server starts handling only after the other's commit | Must be treated as a replay, not automatically exempted merely because client-side dispatch was concurrent |
| MFA-RACE-009 | Both requests are recorded by the server before either is allowed to verify or consume the code | Losing request does not increment failures; use an explicit cross-process synchronization barrier in the test harness |
| MFA-RACE-010 | Invalid code request enters the barrier alongside a valid code request | Invalid code increments failure count even though a successful redemption overlaps |

## Design constraints
- A missing hash from the user's remaining recoveryCodes list is **not sufficient** to identify a race.
- The test harness must distinguish a request **observed by the server** before redemption from a later replay; use persisted redemption evidence with a timestamp or equivalent atomic, unambiguous evidence. Client-side concurrent `Promise.all` is insufficient.
- Persisting a consumed hash alone is insufficient: the system must also have a trustworthy, server-side request-start ordering relative to the commit. Design this without letting an attacker supply timestamps or forge an in-flight request.
- If there is no reliable ordering evidence, fail closed and count the invalid authentication attempt rather than suppressing lockout protection.
- The race test must coordinate the two independent server processes with a test-only barrier at a defined pre-validation point. Do not enable this barrier in production configuration.
- Do not exempt all missing recovery codes from rate limiting.
- Keep error responses from disclosing whether a supplied recovery code was ever valid; 400/404 response compatibility requires review.
- Production implementation must be preceded by automated regression tests for MFA-RACE-001 through MFA-RACE-006.
- Check failCount and lockedUntil in addition to HTTP statuses and session/challenge/code state.
- Production build, unit tests, and repeated two-process HTTP tests must pass before declaring fixed.

## Current implementation risk
In `/api/auth/login/totp`, the initial user recoveryCodes read can occur after the other server has committed its redemption. The invalid branch then calls `recordMfaLoginFailure`; depending on request timing this can happen after the successful transaction reset failCount. A post-hoc check of only `lastLoginAt` or challenge creation time is not enough to prove the submitted code was the consumed code.
