# Phase 3: Staff Management

The Staff Management screen is available only to signed-in Admin users.

## Staff Statuses

- Pending Invitation: invitation sent but not yet accepted.
- Active: accepted staff member with OMS access.
- Inactive: staff member retained for history but blocked from OMS access.

## Admin Actions

- Invite staff with an Admin, Manager, Sales Staff, or Production Staff role.
- Resend or cancel pending invitations.
- Change an accepted or pending staff member's role.
- Disable or reactivate accepted staff.
- Remove staff from Tastory while retaining the Auth identity, profile, and
  historical records.

The database prevents removal or deactivation of the current Admin and prevents
demotion, removal, or deactivation of the last active Admin.

## Removal Semantics

`Remove from Tastory` is a business-membership removal, not permanent account
deletion:

- The Tastory role assignment is deleted.
- `active_business_id` is cleared.
- The OMS profile is marked inactive.
- The user disappears from the Tastory Staff Management list.
- The Supabase Auth identity and public profile are retained.
- Historical orders, assignments, and activity records remain attributable.

`Disable account` keeps the Tastory membership and role so an Admin can
reactivate it later. Permanent Auth deletion is intentionally not exposed in the
OMS because many historical records reference `public.users`.

## Invitation Email Delivery

The invitation function uses Supabase Auth email delivery. Supabase's default
mailer has a low rate limit and is suitable only for initial testing. Configure
custom SMTP under Supabase Authentication settings before production use.
Temporary quota failures are shown in the OMS with a clear retry/setup message.

## Acceptance Tracking

An invitation becomes accepted when Supabase Auth reports email confirmation or
the invited user starts an authenticated OMS session. Last Login uses the Auth
sign-in timestamp with the OMS session timestamp as a fallback.
