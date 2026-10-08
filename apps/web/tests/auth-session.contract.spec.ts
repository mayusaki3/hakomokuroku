import { describe, it } from 'vitest';

// Pre-implementation cases. TODO is intentional: no authentication behavior
// is claimed to pass until a real isolated integration harness is available.
describe('v0.8 session authentication contract', () => {
  it.todo('AUTH-S01: password login without TOTP creates one valid session');
  it.todo('AUTH-S02: password login with TOTP creates challenge but no session');
  it.todo('AUTH-S03: valid TOTP consumes challenge and creates session');
  it.todo('AUTH-S04: challenge cannot be reused');
  it.todo('AUTH-S05: recovery code is consumed exactly once');
  it.todo('AUTH-S06: logout revokes the current session');
  it.todo('AUTH-S07: expired or revoked session cannot authorize requests');
  it.todo('AUTH-S08: session cookie is HttpOnly, SameSite=Lax or stricter, Path=/, Secure on HTTPS');
  it.todo('AUTH-S09: GET /api/auth/me is not cacheable');
  it.todo('AUTH-S10: account and image APIs enforce session User scope');
  it.todo('AUTH-S11: registration does not issue a session');
  it.todo('AUTH-S12: login failures do not disclose whether user exists');
});
