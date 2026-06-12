# Phase 3 UX And Navigation

## Navigation Flow

```text
Open OMS
  -> Validate Supabase session
  -> Login when signed out, expired, inactive, or removed
  -> Dashboard when authenticated
```

Operational pages never render before authentication. Direct links to
Dashboard, Orders, Production, Settings, Staff Management, or Pricing use the
same session and role guard.

## Login

The signed-out experience contains only:

- Tastory OMS branding
- Email and password fields
- Sign In
- Forgot Password
- Administrator contact guidance

Invitation and password-recovery callbacks continue to use the existing
authoritative token exchange before any cached session is restored.

## Settings

The avatar menu provides Settings and Sign Out for all authenticated users.
Admins additionally receive:

- Staff Management
- Backup & Restore
- Data Mode
- Business Settings
- Pricing Management

The Data Mode control changes only the business-data provider. A valid Supabase
identity and role remain mandatory while the emergency device fallback is
active.

## Dashboard

The Dashboard is operational only:

- Orders in progress
- Ready to deliver
- Amount collected
- Create order
- Production planning
- Daily order overview
- Upcoming deliveries
- Payment follow-up

Exports, pricing, staff administration, data controls, and configuration have
been removed from the Dashboard.

## Screenshots

- `screenshots/mobile-login.png`
- `screenshots/mobile-dashboard.png`
- `screenshots/mobile-profile-menu.png`
- `screenshots/mobile-settings.png`
- `screenshots/desktop-login.png`
- `screenshots/desktop-dashboard.png`
- `screenshots/desktop-settings.png`

## Regression Coverage

Automated tests cover:

- Invitation and recovery callback precedence
- Signed-out route blocking
- Operational page access for authenticated staff
- Admin-only Staff Management and Pricing
- New Order role permissions
- Expired session detection
- Removed staff sign-out behavior

Browser checks additionally cover password-reset feedback, direct URL expiry,
Admin Settings visibility, and non-Admin Settings restrictions.
