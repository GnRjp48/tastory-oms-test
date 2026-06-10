(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TastoryAuthCallback = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const PASSWORD_TYPES = new Set(["invite", "recovery"]);

  function parse(urlValue) {
    const url = new URL(urlValue);
    const query = url.searchParams;
    const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
    const type = hash.get("type") || query.get("type") || query.get("auth") || "";
    const error = hash.get("error_description") || query.get("error_description") || "";
    const accessToken = hash.get("access_token") || "";
    const refreshToken = hash.get("refresh_token") || "";
    const code = query.get("code") || "";
    const tokenHash = query.get("token_hash") || "";
    const hasCredentials = Boolean(
      (accessToken && refreshToken) ||
      code ||
      (tokenHash && type),
    );
    return {
      active: hasCredentials || Boolean(error),
      type,
      mode: type === "reset" ? "recovery" : PASSWORD_TYPES.has(type) ? type : "",
      error,
      accessToken,
      refreshToken,
      code,
      tokenHash,
    };
  }

  function authStorageKey(supabaseUrl) {
    const hostname = new URL(supabaseUrl).hostname;
    const projectRef = hostname.split(".")[0];
    return projectRef ? `sb-${projectRef}-auth-token` : "";
  }

  function clearCachedSession(storage, supabaseUrl) {
    const key = authStorageKey(supabaseUrl);
    if (!storage || !key) return;
    storage.removeItem(key);
    for (let index = 0; index < storage.length; index += 1) {
      const candidate = storage.key(index);
      if (candidate && new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.\\d+$`).test(candidate)) {
        storage.removeItem(candidate);
        index -= 1;
      }
    }
  }

  async function exchange(client, callback) {
    if (!callback.active) return { session: null, mode: "" };
    if (callback.error) throw new Error(callback.error);

    let result;
    if (callback.accessToken && callback.refreshToken) {
      result = await client.auth.setSession({
        access_token: callback.accessToken,
        refresh_token: callback.refreshToken,
      });
    } else if (callback.tokenHash && callback.type) {
      result = await client.auth.verifyOtp({
        token_hash: callback.tokenHash,
        type: callback.type,
      });
    } else if (callback.code) {
      result = await client.auth.exchangeCodeForSession(callback.code);
    } else {
      throw new Error("The authentication link is incomplete.");
    }

    if (result.error) throw result.error;
    const session = result.data?.session || null;
    if (!session) throw new Error("The authentication link did not create a session.");
    return { session, mode: callback.mode };
  }

  function cleanUrl(locationValue, mode) {
    const url = new URL(locationValue);
    url.search = mode ? `?auth=${encodeURIComponent(mode)}` : "";
    url.hash = "";
    return `${url.pathname}${url.search}`;
  }

  return {
    parse,
    authStorageKey,
    clearCachedSession,
    exchange,
    cleanUrl,
  };
});
