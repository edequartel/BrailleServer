/* /core/braille-api.js
   BrailleBridge HTTP API wrapper (minimal, defensive)
   - write(text): sends text to braille display
   - clear(): clears display
   - ping(): quick connectivity check
   - setBaseUrl(url): override base url at runtime
   - Supports multiple common payload shapes because endpoints vary by implementation.

   Usage:
     import { braille } from "../core/braille-api.js";
     await braille.write("Hallo");
     await braille.clear();

   Notes:
   - Default baseUrl is http://localhost:5000
   - Default endpoints: /braille and /clear
*/

export const braille = (() => {
  "use strict";

  // -----------------------------
  // Config (adjust once if needed)
  // -----------------------------
  let baseUrl = "http://localhost:5000";

  let endpoints = {
    write: "/braille", // POST
    clear: "/clear",   // POST (fallback GET)
    ping: "/ping"      // optional (fallback: GET /)
  };

  // -----------------------------
  // Helpers
  // -----------------------------
  function joinUrl(a, b) {
    if (!a.endsWith("/") && !b.startsWith("/")) return a + "/" + b;
    if (a.endsWith("/") && b.startsWith("/")) return a + b.slice(1);
    return a + b;
  }

  async function tryFetch(url, init) {
    try {
      const res = await fetch(url, init);
      return res;
    } catch (e) {
      return { ok: false, status: 0, _error: e };
    }
  }

  async function postJson(url, bodyObj) {
    return tryFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyObj)
    });
  }

  // -----------------------------
  // Public API
  // -----------------------------
  async function write(text, opts = {}) {
    const value = String(text ?? "");
    if (!value) return false;

    const url = joinUrl(baseUrl, endpoints.write);

    // Many backends accept different JSON shapes; try a small set.
    const payloads = [];
    if (opts.raw && typeof opts.raw === "object") payloads.push(opts.raw);

    payloads.push(
      { text: value },
      { value },
      { message: value },
      { lines: [value] } // sometimes used for multi-line endpoints
    );

    let last = null;
    for (const p of payloads) {
      const res = await postJson(url, p);
      if (res.ok) return true;
      last = res;
    }

    console.warn("braille.write failed", {
      url,
      status: last?.status,
      error: last?._error
    });
    return false;
  }

  async function clear() {
    const url = joinUrl(baseUrl, endpoints.clear);

    // Try POST then GET (some implementations use GET)
    let res = await tryFetch(url, { method: "POST" });
    if (res.ok) return true;

    res = await tryFetch(url, { method: "GET" });
    if (res.ok) return true;

    console.warn("braille.clear failed", {
      url,
      status: res?.status,
      error: res?._error
    });
    return false;
  }

  async function ping() {
    // Prefer /ping if implemented; fall back to baseUrl root.
    const urlPing = joinUrl(baseUrl, endpoints.ping);
    let res = await tryFetch(urlPing, { method: "GET" });
    if (res.ok) return true;

    const urlRoot = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
    res = await tryFetch(urlRoot, { method: "GET" });
    return !!res.ok;
  }

  function setBaseUrl(url) {
    baseUrl = String(url || "").trim() || baseUrl;
  }

  function setEndpoints(newEndpoints = {}) {
    endpoints = { ...endpoints, ...newEndpoints };
  }

  function getConfig() {
    return { baseUrl, endpoints: { ...endpoints } };
  }

  return {
    write,
    clear,
    ping,
    setBaseUrl,
    setEndpoints,
    getConfig
  };
})();