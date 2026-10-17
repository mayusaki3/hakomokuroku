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

## Design constraints
- A missing hash from the user's remaining recoveryCodes list is **not sufficient** to identify a race.
- The test harness must distinguish a request initiated before redemption from a later replay; use persisted redemption evidence with a timestamp or equivalent atomic, unambiguous evidence.
- Do not exempt all missing recovery codes from rate limiting.
- Keep error responses from disclosing whether a supplied recovery code was ever valid; 400/404 response compatibility requires review.
- Production implementation must be preceded by automated regression tests for MFA-RACE-001 through MFA-RACE-006.
- Check failCount and lockedUntil in addition to HTTP statuses and session/challenge/code state.
- Production build, unit tests, and repeated two-process HTTP tests must pass before declaring fixed.

## Current implementation risk
In `/api/auth/login/totp`, the initial user recoveryCodes read can occur after the other server has committed its redemption. The invalid branch then calls `recordMfaLoginFailure`; depending on request timing this can happen after the successful transaction reset failCount. A post-hoc check of only `lastLoginAt` or challenge creation time is not enough to prove the submitted code was the consumed code.
