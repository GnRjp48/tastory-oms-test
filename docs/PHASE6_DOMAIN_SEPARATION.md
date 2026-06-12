# Phase 6 Domain Separation

## Target Architecture

- `https://oms.tastory4u.com` - internal Tastory OMS
- `https://www.tastory4u.com` - future public website
- `https://tastory4u.com` - redirects to `https://www.tastory4u.com`

The OMS repository must claim only `oms.tastory4u.com`. A separate repository
is recommended for the public website because one GitHub Pages site supports
one custom-domain relationship.

## Zero-Downtime Cutover Order

1. From the current OMS, run **Backup Now** and retain the downloaded JSON.
2. Export any Emergency Local Mode data before leaving the old origin.
3. Record order, customer, staff, and business-setting counts.
4. Add the Namecheap `oms` CNAME and wait for public DNS resolution.
5. Change this repository's `CNAME` file to `oms.tastory4u.com` and deploy it.
6. Confirm GitHub Pages recognizes the custom domain and provisions HTTPS.
7. Set the hosted Supabase Site URL to `https://oms.tastory4u.com`.
8. Keep old root and `www` Auth redirect URLs temporarily, while adding the OMS
   root and reset URLs.
9. Set the `invite-user` function secret:
   `AUTH_REDIRECT_URL=https://oms.tastory4u.com`.
10. Deploy the `invite-user` Edge Function.
11. Test login, invitation acceptance, and password recovery at the OMS domain.
12. Reinstall the Android PWA from `https://oms.tastory4u.com`.
13. Deploy the public website separately, then redirect the apex to `www`.
14. After old invitation and recovery links have expired, remove root and
    `www` from the Supabase Auth redirect allow-list.

## Namecheap DNS

Create:

| Type | Host | Value | TTL |
| --- | --- | --- | --- |
| CNAME | `oms` | `gnrjp48.github.io` | Automatic |

Do not remove the current apex or `www` records until the OMS is confirmed on
the new hostname and the public website destination is ready.

## Hosted Supabase Auth

Set:

- Site URL: `https://oms.tastory4u.com`
- Redirect URL: `https://oms.tastory4u.com`
- Redirect URL: `https://oms.tastory4u.com/?auth=reset`
- Development: `http://localhost:8000`
- Development: `http://localhost:8000/?auth=reset`
- Development: `http://127.0.0.1:8000`
- Development: `http://127.0.0.1:8000/?auth=reset`

During the migration grace period, retain:

- `https://tastory4u.com`
- `https://tastory4u.com/?auth=reset`
- `https://www.tastory4u.com`
- `https://www.tastory4u.com/?auth=reset`

## Browser and PWA Impact

Browser storage is origin-specific. Moving from the apex to `oms` does not move:

- Emergency Local Mode orders
- Retained IndexedDB backup copies
- Selected backup-folder permission
- Supabase cached browser session
- Installed PWA identity and old service-worker cache

Jane and staff must sign in again. The old PWA should be uninstalled after the
new OMS PWA is verified. Supabase business data is unaffected.

## Acceptance Checks

- Jane and one non-Admin staff member can sign in.
- Removed or disabled users are rejected.
- Invitation links open the OMS domain and authenticate the invited user.
- Password-reset links open the OMS domain.
- Orders, customer counts, staff, pricing, and business settings match.
- Realtime order updates appear on two devices.
- Backup creation and restore preview work without running a production restore.
- Emergency Local Mode remains Admin-only.
- Android Chrome offers a fresh PWA installation.
