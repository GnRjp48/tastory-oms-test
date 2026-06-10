const test = require("node:test");
const assert = require("node:assert/strict");
const callback = require("../auth-callback.js");

test("parses invitation fragment tokens ahead of a cached session", () => {
  const result = callback.parse(
    "https://tastory4u.com/#access_token=invite-token&refresh_token=invite-refresh&type=invite",
  );
  assert.equal(result.active, true);
  assert.equal(result.mode, "invite");
  assert.equal(result.accessToken, "invite-token");
});

test("parses password recovery fragment tokens", () => {
  const result = callback.parse(
    "https://tastory4u.com/?auth=reset#access_token=recovery-token&refresh_token=recovery-refresh&type=recovery",
  );
  assert.equal(result.active, true);
  assert.equal(result.mode, "recovery");
});

test("parses PKCE callback codes", () => {
  const result = callback.parse("https://tastory4u.com/?auth=reset&code=pkce-code");
  assert.equal(result.active, true);
  assert.equal(result.code, "pkce-code");
  assert.equal(result.mode, "recovery");
});

test("parses token hash callbacks", () => {
  const result = callback.parse(
    "https://tastory4u.com/?token_hash=hashed&type=invite",
  );
  assert.equal(result.active, true);
  assert.equal(result.mode, "invite");
});

test("clears only the persisted Supabase session", () => {
  const values = new Map([
    ["sb-project-auth-token", "jane"],
    ["sb-project-auth-token.0", "jane-chunk"],
    ["sb-project-auth-token-code-verifier", "keep"],
    ["other", "keep"],
  ]);
  const storage = {
    get length() {
      return values.size;
    },
    key(index) {
      return [...values.keys()][index] || null;
    },
    removeItem(key) {
      values.delete(key);
    },
  };
  callback.clearCachedSession(storage, "https://project.supabase.co");
  assert.equal(values.has("sb-project-auth-token"), false);
  assert.equal(values.has("sb-project-auth-token.0"), false);
  assert.equal(values.get("sb-project-auth-token-code-verifier"), "keep");
  assert.equal(values.get("other"), "keep");
});

test("sets invitation tokens as the authoritative session", async () => {
  let received;
  const client = {
    auth: {
      async setSession(tokens) {
        received = tokens;
        return { data: { session: { user: { id: "invited-user" } } }, error: null };
      },
    },
  };
  const result = await callback.exchange(client, callback.parse(
    "https://tastory4u.com/#access_token=new&refresh_token=refresh&type=invite",
  ));
  assert.deepEqual(received, { access_token: "new", refresh_token: "refresh" });
  assert.equal(result.session.user.id, "invited-user");
  assert.equal(result.mode, "invite");
});

test("uses verifyOtp for token hash invitation links", async () => {
  let received;
  const client = {
    auth: {
      async verifyOtp(values) {
        received = values;
        return { data: { session: { user: { id: "invited-user" } } }, error: null };
      },
    },
  };
  await callback.exchange(client, callback.parse(
    "https://tastory4u.com/?token_hash=hashed&type=invite",
  ));
  assert.deepEqual(received, { token_hash: "hashed", type: "invite" });
});

test("exchanges password recovery PKCE codes", async () => {
  let received;
  const client = {
    auth: {
      async exchangeCodeForSession(code) {
        received = code;
        return { data: { session: { user: { id: "recovery-user" } } }, error: null };
      },
    },
  };
  const result = await callback.exchange(client, callback.parse(
    "https://tastory4u.com/?auth=reset&code=recovery-code",
  ));
  assert.equal(received, "recovery-code");
  assert.equal(result.mode, "recovery");
});

test("reports expired or invalid callback errors", async () => {
  await assert.rejects(
    callback.exchange({}, callback.parse(
      "https://tastory4u.com/?error=access_denied&error_description=Invite%20link%20expired",
    )),
    /Invite link expired/,
  );
});

test("ignores ordinary OMS navigation URLs", () => {
  const result = callback.parse("https://tastory4u.com/?page=orders");
  assert.equal(result.active, false);
  assert.equal(result.mode, "");
});

test("keeps password mode while removing credentials from the URL", () => {
  assert.equal(
    callback.cleanUrl(
      "https://tastory4u.com/?auth=reset#access_token=secret&refresh_token=secret&type=recovery",
      "recovery",
    ),
    "/?auth=recovery",
  );
});
