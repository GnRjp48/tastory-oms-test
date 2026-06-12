# Tastory OMS

A mobile-first, single-page order management system for Tastory, a small home-based granola business.

Supabase infrastructure is documented in
[`docs/supabase-phase-1.md`](docs/supabase-phase-1.md). The current UI continues
to use browser storage by default. The opt-in Supabase frontend integration,
realtime behavior, data protection, and rollback controls are documented in
[`docs/phase-2-scope.md`](docs/phase-2-scope.md). Admin staff management is
documented in
[`docs/phase-3-staff-management.md`](docs/phase-3-staff-management.md).
The invitation and password-recovery callback correction is documented in
[`docs/phase-3-auth-callback-fix.md`](docs/phase-3-auth-callback-fix.md).
The authenticated navigation and Settings redesign is documented in
[`docs/phase-3-ux-navigation.md`](docs/phase-3-ux-navigation.md).
Emergency Local Mode safety behavior is documented in
[`docs/phase-4-emergency-local-mode.md`](docs/phase-4-emergency-local-mode.md).

## Features

- Dashboard with active orders, revenue, upcoming deliveries, and payment reminders
- New order form for all Tastory flavors and pack sizes
- Automatic item count and order total calculation
- Payment status: Unpaid, Deposit Paid, and Paid
- Amount paid and automatic outstanding amount calculation
- Customer notes for preferences like less sweet, no raisins, call before delivery, or leave at guard house
- WhatsApp button on every order card
- One-tap production workflow progression
- Dashboard order overview for today's total, pending, in-progress, completed, and cancelled orders
- Simplified daily order summary page
- Export today's orders to an Excel `.xlsx` file
- Optional auto-export folder using supported browser folder permissions
- Pricing management for editing products, packaging sizes, and prices without changing code
- Searchable and filterable order list
- Order details, editing, deletion, and quick production status updates
- Production summary by product, pack size, and workflow stage
- Supabase email/password authentication and password reset
- Dedicated login screen with authenticated route protection
- Profile menu and role-aware Settings area
- Admin-only Emergency Local Mode with persistent warnings and guarded exit
- Admin-only staff invitations, roles, activation, removal, and invitation tracking
- Realtime order updates across signed-in devices in Supabase mode
- Local browser storage with sample data on first launch
- Responsive bottom navigation designed for Android phones

## Authentication And Data Modes

- Every operational screen requires a valid Supabase staff session.
- The shared workspace supports authenticated, realtime business data.
- Admins can activate Emergency Local Mode from Settings without
  bypassing authentication or role permissions.
- Google Sheets and Hermes are not connected.

## Install on Android

After deployment to GitHub Pages, open the site in Chrome on Android and choose:

```text
Menu > Add to Home screen > Install
```

The PWA manifest and service worker are included, so Chrome can install Tastory OMS as a standalone app.

## Custom Domain

The production OMS custom domain is configured through the root `CNAME` file:

```text
oms.tastory4u.com
```

The `oms` DNS record must point to `gnrjp48.github.io`. The apex domain and
`www` are reserved for the separate public Tastory website.

## Export Notes

`Export to Excel` creates `DailyOrders_YYYY-MM-DD.xlsx` for orders created today.

`Auto Export` uses the browser File System Access API when available. If the browser does not support default folder permissions, Tastory OMS falls back to a normal file download.

## Run Locally

No build step or backend is required.

### Option 1: Open the file

Open `index.html` in a browser. An internet connection is needed for the
Tailwind CSS CDN and Supabase Authentication.

### Option 2: Use a local server

From this directory, run either:

```powershell
python -m http.server 8000
```

or:

```powershell
npx serve .
```

Then visit `http://localhost:8000` (Python) or the URL shown by `serve`.

## Data Storage

Local mode stores orders in the browser under:

```text
tastory-oms-orders-v1
```

Supabase mode stores business data in the linked Supabase project. Switching
providers does not delete the LocalStorage copy.

## Product Prices

Admins can update products, packaging sizes, and prices from Pricing. Supabase
mode saves changes to the shared product catalog; local mode saves them in
browser settings.

## Staff Invitations

Supabase's default email service has a low rate limit. Configure custom SMTP in
Supabase before relying on staff invitations for production use.

## Project Files

```text
.
|-- index.html
|-- styles.css
|-- app.js
|-- supabase-client.js
|-- supabase/
|-- docs/
`-- README.md
```
