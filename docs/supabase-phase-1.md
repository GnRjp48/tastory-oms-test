# Supabase Phase 1 Runbook

Phase 1 establishes the backend foundation. The current browser UI still reads LocalStorage until the frontend data-layer phase is implemented.

## Included

- Supabase local project configuration
- Email/password Auth configuration
- Password-reset redirect configuration
- Auth user profile synchronization
- Admin, Manager, Sales Staff, and Production Staff roles
- Granular permissions and JWT role claims
- Multi-business-ready schema
- Customer tags, status, preferences, and loyalty fields
- Products, variants, effective-dated pricing
- Order sources and delivery methods
- Orders, items, production history, and optimistic versions
- Business settings for company name, WhatsApp, delivery charges, tax, and receipt footer
- Inventory-ready tables
- RLS policies
- Audit logging
- Notification outbox for Hermes
- Idempotent LocalStorage migration tracking
- Admin-only user invitation Edge Function
- Database tests for schema, role boundaries, RLS, and Realtime publication

## Local Prerequisites

Install:

1. Node.js
2. Docker Desktop
3. Supabase CLI through the project dependency:

```powershell
npm install
npm run validate:phase1
npx supabase --version
```

Start and reset the local stack:

```powershell
npm run supabase:start
npm run supabase:reset
npm run supabase:lint
npm run supabase:test
```

## Cloud Projects

Create three Supabase projects:

```text
tastory-oms-dev
tastory-oms-staging
tastory-oms-production
```

Use the Singapore region when available and appropriate for the business.

Link and deploy one environment at a time:

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
npx supabase functions deploy invite-user
```

Set Edge Function secrets:

```powershell
npx supabase secrets set `
  SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY `
  AUTH_REDIRECT_URL=https://oms.tastory4u.com
```

Never place the service-role key in GitHub Pages or browser code.

## Auth Dashboard Configuration

For production:

```text
Site URL: https://oms.tastory4u.com
Redirect URL: https://oms.tastory4u.com
Redirect URL: https://oms.tastory4u.com/?auth=reset
Public signup: disabled
Email confirmations: enabled
Minimum password length: 10 or greater
```

Enable the Custom Access Token Hook:

```text
pg-functions://postgres/public/custom_access_token_hook
```

Configure a production SMTP provider before inviting staff.

## First Administrator

1. Create or invite Jane through Supabase Authentication.
2. Sign in as Jane.
3. Call:

```sql
select public.create_business_with_defaults('Tastory');
```

Call it through an authenticated Supabase client/RPC so `auth.uid()` is Jane's user ID.

The function creates:

- Tastory business
- Jane's Admin role
- Business settings
- Retail, VIP, Gym, Wholesale, and Corporate tags
- Order sources
- Delivery methods
- Production statuses

After role assignment, sign out and back in so the JWT receives current role claims.

## User Invitations

Only callers with `users.manage` may invoke:

```text
POST /functions/v1/invite-user
```

Example request body:

```json
{
  "email": "staff@example.com",
  "full_name": "Staff Member",
  "role_code": "sales_staff",
  "business_id": "BUSINESS_UUID"
}
```

The function uses the service-role key only on the server and records the role assignment.

## Security Rules

- Anonymous users have no business-table access.
- Browser clients use only the Supabase publishable key.
- RLS is enabled on every business table.
- Production Staff can update workflow only through `advance_production_status`.
- Customer lifecycle status changes are restricted to Admin and Manager through
  `set_customer_status`.
- Sales Staff can create orders and edit customer contact details, but cannot
  manage customer status, pricing, settings, or users.
- Order creation and general order edits remain reserved for transactional RPCs in the next implementation phase.
- Audit and loyalty values are maintained by database triggers.
- Notification outbox rows are not directly accessible to browser clients.

## Realtime

Realtime publication is enabled for:

```text
orders
order_items
order_status_history
inventory
```

RLS still determines which rows each subscriber may receive.

## Validation Before Staging

Run:

```powershell
npm run supabase:reset
npm run supabase:lint
```

Then verify:

- Signup is disabled
- Password reset email returns to the staging OMS
- Each role receives only its permissions
- Direct anonymous Data API calls fail
- Cross-business reads fail
- Production Staff cannot update unassigned orders
- Concurrent status updates reject stale versions
- Price and role changes create activity logs
- Duplicate migration file hashes return the existing migration run
