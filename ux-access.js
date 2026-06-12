(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TastoryUxAccess = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const CREATE_ORDER_ROLES = ["admin", "manager", "sales_staff"];
  const ADMIN_PAGES = ["staff", "pricing"];

  function isAuthenticated(session) {
    return Boolean(session?.user?.id);
  }

  function canAccessPage(page, session, roles = []) {
    if (!isAuthenticated(session)) return false;
    if (ADMIN_PAGES.includes(page)) return roles.includes("admin");
    if (page === "new-order") return CREATE_ORDER_ROLES.some((role) => roles.includes(role));
    return true;
  }

  function isExpiredSessionError(error) {
    return /jwt.*expired|session.*expired|refresh token|invalid.*session|not authenticated/i
      .test(error?.message || "");
  }

  return {
    canAccessPage,
    isAuthenticated,
    isExpiredSessionError,
  };
});
