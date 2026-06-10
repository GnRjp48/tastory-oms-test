# Phase 3 Staff Removal Behavior

## Workflow

1. An Admin selects `Remove from Tastory` in Staff Management.
2. `app.js` calls `TastoryCloud.removeStaff`.
3. `supabase-client.js` invokes the authenticated
   `remove_staff_member(requested_user_id)` database RPC.
4. The RPC verifies Admin permission and last-Admin safeguards.
5. It deletes the Tastory `user_roles` membership, clears
   `users.active_business_id`, and marks the profile inactive.
6. It records a `staff_removed` event in `activity_logs`.

No Edge Function is used for staff removal.

## Records After Removal

| Record | Result |
| --- | --- |
| `auth.users` identity | Retained |
| `public.users` profile | Retained and inactive |
| Tastory `public.user_roles` row | Deleted |
| `public.businesses` record | Unchanged |
| Historical `activity_logs` | Retained |
| New `staff_removed` activity | Added |

The Auth identity is retained deliberately. Orders, production assignments,
and audit records reference the public user profile, so deleting the Auth user
could either fail on references or erase historical attribution through
cascading deletes.

## Access After Removal

The retained identity may still authenticate with Supabase Auth, but it no
longer has a Tastory business or role. RLS therefore blocks business data.
The OMS also calls `touch_staff_session` during startup, on window focus, when
returning to the foreground, and every 60 seconds. An inactive or removed user
is signed out and returned to the login screen.

## Production Recommendation

Keep these actions distinct:

- `Disable account`: retain role and membership for later reactivation.
- `Remove from Tastory`: revoke Tastory membership while retaining history.
- `Delete permanently`: do not expose until a formal retention policy and a
  service-role deletion workflow define how referenced historical data must be
  reassigned or anonymized.

Permanent account deletion is not part of the current OMS implementation.
