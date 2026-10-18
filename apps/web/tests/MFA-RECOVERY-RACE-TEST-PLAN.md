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

## Event-ordering design decision (2026-10-18)

The 20-iteration runs of `invalid-first`, `valid-first`, `invalid-barrier` and `barrier` all passed. In `invalid-barrier`, the final failure counter varied between 0 and 1. That is compatible with different serialization orders; it does **not** establish that every failed attempt was counted.

### Required durable evidence

A future schema change must provide two separate concepts:

1. **Attempt admission**: an immutable, server-generated attempt ID associated with a user, login challenge, and the SHA-256 hash of the submitted recovery code. The database must assign a trustworthy ordering point *before* validation and before any successful consumption. A wall-clock timestamp alone is insufficient across server processes.
2. **Redemption event**: an immutable record of the recovery-code hash, consuming attempt ID, and the database ordering point at which the code was consumed. Its creation, recovery-code removal, challenge claim, session creation and successful-login counter reset must be atomic.

A loser may be classified as a benign duplicate **only if** the submitted hash equals the recorded consumed hash **and** its persisted admission ordering point precedes the consuming transaction's ordering point. Otherwise it is a failed authentication attempt. No request-supplied timestamp, client token or client-controlled attempt ID can establish this ordering.

The ordering primitive must be validated against SQLite's actual transaction/locking behavior, including transaction retries and process termination. A database sequence allocated in a transaction that later rolls back cannot be treated as a committed admission event. Avoid a read-then-write transaction that fails with SQLITE_BUSY under competing writers.

### Failure counter semantics

- A committed invalid attempt increases the counter; a subsequent committed successful login resets it.
- A committed successful login followed by an invalid attempt leaves the counter incremented.
- When both overlap, final counter 0 or 1 may be valid **only when durable event ordering proves which commit happened last**.
- A benign duplicate rejection does not create a failure event or increment the counter.
- A post-redemption replay must create a failure event and increment the counter even when it uses a different still-valid challenge.
- Preserve five failures / 15-minute lockout, and ensure that a success cannot bypass a lock committed before its own decision point.

### Additional regression tests before production implementation

| ID | Scenario | Expected |
| --- | --- | --- |
| MFA-RACE-011 | Invalid attempt commits before valid login | Failure event retained, current failCount 0 after successful reset |
| MFA-RACE-012 | Valid login commits before invalid attempt | Failure event retained, current failCount 1 |
| MFA-RACE-013 | Valid and invalid requests overlap | Exactly one failure event; final counter matches persisted event order |
| MFA-RACE-014 | Same valid code admitted twice before redemption | One success, one benign duplicate, no failure event for duplicate |
| MFA-RACE-015 | Same code admitted only after redemption | Rejected as replay, exactly one failure event |
| MFA-RACE-016 | Competing requests under SQLite lock contention and process restart | No duplicate session, no lost event, no unhandled 500 |
| MFA-RACE-017 | Unrelated invalid code overlaps consumed valid code | Failure recorded, never exempted based only on timing |
| MFA-RACE-018 | Five invalid attempts interleaved with a successful login | Lockout and reset follow committed event order |

### Implementation gates

1. Add schema and migration for durable admission/redemption/failure events with bounded retention and no plaintext recovery codes.
2. Add tests that query persisted event rows and verify ordering, not only `failCount`.
3. Implement transaction-safe admission and consumption; then make the route consult persisted evidence before suppressing failure increments.
4. Re-run `race`, `barrier`, `replay`, `invalid-first`, `valid-first`, `invalid-barrier` plus MFA-RACE-011 through MFA-RACE-018 against two real server processes.
5. Do not remove the existing failure-count assertions or weaken replay detection to make concurrency tests pass.

**Security note:** Do not store recovery codes in plaintext or emit submitted hashes in logs. Plan retention and cleanup for admission records; preserve enough redemption evidence for replay classification without retaining unbounded per-request history.
