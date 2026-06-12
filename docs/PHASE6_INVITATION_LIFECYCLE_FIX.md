# Phase 6 Invitation Lifecycle Fix

## Root Cause

Supabase confirms an invited email when the recipient opens the invitation
link. The original staff-list function treated `email_confirmed_at` or
`last_sign_in_at` as proof that onboarding was complete, so the invitation
ledger changed from Pending to Accepted before the user created a password.

The Edge Function then refused Cancel and Resend because the Auth user was
already email-confirmed.

## Corrected Lifecycle

1. Jane sends an invitation.
2. The account and Tastory role are provisioned, but the ledger remains
   **Pending Invitation**.
3. Opening the invitation email creates the invited Auth session and displays
   password setup. It does not activate the staff record.
4. Jane may still Cancel or Resend while password setup is incomplete.
5. A successful password setup calls `complete_staff_invitation()`.
6. The Staff Management screen then shows the account as **Active**.
7. A later successful password login also completes a still-pending ledger,
   covering interrupted callback completion.

For a brand-new account, Cancel deletes the provisional Auth user and
cascades its provisional Tastory profile and role while retaining the
cancelled invitation audit record.

## Re-inviting Removed Staff

Removing staff from Tastory intentionally retains the Supabase Auth identity
and profile for historical activity and audit references. Previously, that
retained identity caused a later invitation to the same email address to fail
as a duplicate.

The invitation function now detects an inactive historical account with no
Tastory role and safely reuses it:

1. A fresh pending invitation and selected role are created.
2. A secure password setup link is sent through the password recovery flow.
3. The account remains inactive until password setup succeeds.
4. Password setup completes the invitation and restores Tastory access.
5. Cancelling the re-invitation removes the provisional role and business
   assignment while preserving the historical Auth identity and activity
   references.

Active staff and accounts that still have a Tastory role remain protected
from duplicate invitations.

The account lookup uses Supabase Auth as the authoritative source and then
checks Tastory role assignments by Auth user ID. This also supports historical
accounts whose `public.users` profile is missing, duplicated, or has a stale
email value; those accounts no longer fall through to the new-user invitation
API and trigger an "already registered" error.

## Regression Coverage

- Email confirmation no longer changes the invitation ledger.
- Password setup explicitly completes acceptance.
- Pending Cancel and Resend remain available after link-click.
- Removed staff can be invited again using the same email address.
- Auth-only and stale-profile historical accounts are detected correctly.
- Re-invitation reuses historical identity without restoring access early.
- Cancelling a re-invitation preserves historical Auth and audit references.
- Existing invitation callback session precedence remains unchanged.
