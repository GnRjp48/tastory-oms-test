const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const migration = fs.readFileSync(
  "supabase/migrations/202606120004_invitation_acceptance_lifecycle.sql",
  "utf8",
);
const reinvitationMigration = fs.readFileSync(
  "supabase/migrations/202606120005_staff_reinvitation.sql",
  "utf8",
);
const edgeFunction = fs.readFileSync("supabase/functions/invite-user/index.ts", "utf8");
const client = fs.readFileSync("supabase-client.js", "utf8");

test("opening an invitation email does not mark the ledger accepted", () => {
  assert.doesNotMatch(migration, /email_confirmed_at is not null or au\.last_sign_in_at is not null/i);
  assert.match(migration, /when pending_invitation\.id is not null then 'pending'/i);
});

test("acceptance is completed explicitly after password setup", () => {
  assert.match(migration, /function public\.complete_staff_invitation\(\)/i);
  assert.match(reinvitationMigration, /is_active = true/i);
  assert.match(client, /completeInvitationAcceptance/);
});

test("pending invitations can be cancelled or resent after their link is opened", () => {
  assert.doesNotMatch(edgeFunction, /Accepted invitations cannot be cancelled/);
  assert.doesNotMatch(edgeFunction, /Accepted invitations cannot be resent/);
});

test("removed Auth identities can be safely re-invited", () => {
  assert.match(edgeFunction, /findAuthUserByEmail/);
  assert.match(edgeFunction, /auth\.admin\.listUsers/);
  assert.match(edgeFunction, /\.eq\("user_id", existingAuthUser\.id\)/);
  assert.match(edgeFunction, /reinviteExistingStaff/);
  assert.match(edgeFunction, /resetPasswordForEmail/);
  assert.match(edgeFunction, /reused_account: true/);
  assert.match(edgeFunction, /reused_auth_identity: true/);
  assert.match(edgeFunction, /is_active: false/);
});

test("Auth-only historical accounts do not fall through to a duplicate invite", () => {
  const authLookup = edgeFunction.indexOf("findAuthUserByEmail(adminClient, email)");
  const freshInvite = edgeFunction.indexOf("sendInvitation(adminClient, email, fullName)");
  assert.ok(authLookup >= 0);
  assert.ok(freshInvite > authLookup);
  assert.match(edgeFunction, /if \(existingAuthUser\)[\s\S]*reinviteExistingStaff/);
  assert.doesNotMatch(edgeFunction, /Unable to check existing staff profiles/);
  assert.doesNotMatch(edgeFunction, /user_roles!inner/);
});

test("cancelling a re-invitation retains the historical Auth identity", () => {
  assert.match(reinvitationMigration, /reused_auth_identity boolean/i);
  assert.match(edgeFunction, /!invitation\.reused_auth_identity/);
  assert.match(edgeFunction, /active_business_id: null/);
});
