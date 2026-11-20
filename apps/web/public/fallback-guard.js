(() => {
  "use strict";
  const script = document.currentScript;
  const base = new URL("./", script && script.src ? script.src : window.location.href);
  const fallbackUrl = new URL("legacy/index.html", base);
  let appReady = false;
  let switching = false;
  function switchToLegacy(reason) {
    if (switching || window.location.pathname.includes("/legacy/")) return;
    switching = true;
    try {
      if (sessionStorage.getItem("barkoul-fallback-used") === "1") return;
      sessionStorage.setItem("barkoul-fallback-used", "1");
    } catch (_) {}
    fallbackUrl.searchParams.set("fallback", reason);
    window.location.replace(fallbackUrl.href);
  }
  window.addEventListener("barkoul:app-ready", () => {
    appReady = true;
    try { sessionStorage.removeItem("barkoul-fallback-used"); } catch (_) {}
  }, { once: true });
  window.addEventListener("error", (event) => {
    const target = event.target;
    const failedAppScript = target && target.tagName === "SCRIPT" && String(target.src || "").includes("/assets/app.js");
    const appRuntimeError = String(event.filename || "").includes("/assets/app.js");
    if (failedAppScript || appRuntimeError) switchToLegacy("runtime-error");
  }, true);
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const stack = reason && (reason.stack || reason.message) ? String(reason.stack || reason.message) : "";
    if (stack.includes("/assets/app.js") || stack.includes("assets/app.js")) switchToLegacy("unhandled-rejection");
  });
  window.setTimeout(() => { if (!appReady) switchToLegacy("startup-timeout"); }, 20000);
})();