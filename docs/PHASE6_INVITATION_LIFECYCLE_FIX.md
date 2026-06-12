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

Cancel deletes the provisional Auth user and cascades its provisional Tastory
profile and role while retaining the cancelled invitation audit record.

## Regression Coverage

- Email confirmation no longer changes the invitation ledger.
- Password setup explicitly completes acceptance.
- Pending Cancel and Resend remain available after link-click.
- Existing invitation callback session precedence remains unchanged.
