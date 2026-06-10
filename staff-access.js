(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TastoryStaffAccess = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  function isRevokedError(error) {
    return /inactive|removed|no active tastory business|active tastory business is unavailable/i
      .test(error?.message || "");
  }

  return {
    isRevokedError,
    revokedMessage: "This account is disabled or has been removed from Tastory.",
  };
});
