const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const migration = fs.readFileSync(
  "supabase/migrations/202606120004_invitation_acceptance_lifecycle.sql",
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
  assert.match(client, /completeInvitationAcceptance/);
});

test("pending invitations can be cancelled or resent after their link is opened", () => {
  assert.doesNotMatch(edgeFunction, /Accepted invitations cannot be cancelled/);
  assert.doesNotMatch(edgeFunction, /Accepted invitations cannot be resent/);
});
