# Phase 3 Auth Callback Fix

## Root Cause

The OMS previously relied on Supabase JS `detectSessionInUrl` while also calling
`getSession()` immediately during application startup. URL callback processing
is asynchronous. When Jane or another staff member already had a persisted
session, `getSession()` could return that cached account before the invitation
fragment was processed. The dashboard then continued under the wrong identity.

Password recovery used the same startup sequence and had the same race.

## Corrected Flow

`auth-callback.js` now inspects the URL before the Supabase client restores a
session. When it finds an invitation or recovery callback, it:

1. Forces Supabase data mode.
2. Removes only the locally persisted Supabase session, preserving PKCE data.
3. Creates the client with automatic URL detection disabled.
4. Processes fragment tokens with `setSession`, token hashes with `verifyOtp`,
   or PKCE codes with `exchangeCodeForSession`.
5. Removes credentials from the browser URL.
6. Requires the callback user to set a password before loading OMS data.
7. Keeps that requirement across refreshes and installed-PWA relaunches.
8. Loads the invited user's live profile, role, and active business only after
   the password update succeeds.

The previous user's server-side sessions on other devices are not revoked.
Only the current browser's cached identity is replaced.

## Supported Cases

- Invitation opened with no existing session.
- Invitation opened while Jane is signed in.
- Invitation opened while another staff account is signed in.
- Password recovery with fragment, token-hash, or PKCE callbacks.
- Mobile browser, desktop browser, and installed PWA on the same origin.

Expired or invalid links display an authentication error and do not restore the
previous cached account.
