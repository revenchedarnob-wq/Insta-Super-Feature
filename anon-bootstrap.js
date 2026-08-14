// ========================================================================= //
//  Insta Super Features v6 — isolated-world bootstrap
//  Bridges chrome.storage settings into the MAIN-world inject.js agent over
//  a token-scoped window.postMessage channel, and keeps the legacy
//  script-tag injection fallback for very old browsers without
//  `world: "MAIN"` support.
// ========================================================================= //
(() => {
  "use strict";

  if (window.__isf_bootstrapped) return;
  window.__isf_bootstrapped = true;

  const api = typeof browser !== "undefined" ? browser : chrome;

  // Random per-page-load session token. inject.js adopts the first token it
  // sees (document_start runs before page scripts) and rejects later frames
  // that don't carry it, so the page can't silently flip privacy flags.
  const SESSION_TOKEN = Math.random().toString(36).slice(2) + Date.now().toString(36);

  // Sibling isolated-world scripts (content.js) read this to validate harvest
  // batches. Page JS cannot see isolated-world globals.
  window.__isfSessionToken = SESSION_TOKEN;

  const SETTINGS_DEFAULTS = { 
    anonStoryViewer: false, 
    noSeenMessages: false, 
    showDownload: true, 
    browserQuickSave: true,
    stealthMode: true  // NEW: Anti-detection randomization
  };
  let lastSettings = { ...SETTINGS_DEFAULTS };
  let settingsLoaded = false;
  let settingsDispatched = false;

  const toWireSettings = (raw) => ({
    anonStoryViewer: !!raw.anonStoryViewer,
    noSeenMessages: !!raw.noSeenMessages,
    // Media harvesting only needs to run while downloads are surfaced.
    harvestMedia: raw.showDownload !== false,
    stealthMode: !!raw.stealthMode,
  });

  const postSettings = (settings) => {
    try {
      window.postMessage({
        source: "isf-bootstrap",
        type: "settings",
        token: SESSION_TOKEN,
        settings: toWireSettings(settings),
      }, window.location.origin);
      settingsDispatched = true;
    } catch (_e) {}
  };

  // FIX #1: Send initial settings IMMEDIATELY on load (before any XHR/fetch calls)
  // This prevents the race condition where Instagram requests fire before handshake
  const sendInitialSettings = () => {
    if (!settingsLoaded || !settingsDispatched) {
      settingsLoaded = true;
      postSettings(lastSettings);
    }
  };

  // NEW: Stealth mode timing randomization to avoid detectable patterns
  const randomizedDelay = (baseMs = 0, varianceMs = 50) => {
    if (!lastSettings.stealthMode) return baseMs;
    return baseMs + Math.random() * varianceMs;
  };

  // Legacy fallback: if for any reason the manifest's main-world inject.js
  // entry didn't execute (e.g. very old Chrome that ignores `world: "MAIN"`),
  // fall back to the document.createElement('script') technique.
  const ensureInjectFallback = () => {
    try {
      if (window.__isf_injected) return; // main-world script already ran
      if (document.documentElement.dataset.isfInjected === "1") return;
      document.documentElement.dataset.isfInjected = "1";
      const script = document.createElement("script");
      script.src = api.runtime.getURL("inject.js");
      script.async = false;
      script.onload = () => script.remove();
      script.onerror = () => script.remove();
      (document.head || document.documentElement).appendChild(script);
    } catch (_e) {}
  };

  const readAndPostSettings = () => {
    try {
      api.storage.sync.get(SETTINGS_DEFAULTS, (settings) => {
        lastSettings = { ...SETTINGS_DEFAULTS, ...(settings || {}) };
        ensureInjectFallback();
        // FIX: Send settings immediately AND after ensureInjectFallback
        sendInitialSettings();
        setTimeout(() => postSettings(lastSettings), 0);
      });
    } catch (_e) {
      ensureInjectFallback();
      // FIX: Send settings immediately on error path too
      sendInitialSettings();
      setTimeout(() => postSettings(lastSettings), 0);
    }
  };

  // Handshake: when inject.js loads it asks for the current settings. We
  // reply with the cached settings immediately (no storage round-trip).
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data || {};
    if (data && data.source === "isf" && data.type === "request-settings") {
      postSettings(lastSettings);
    }
  });

  // FIX: Send initial settings IMMEDIATELY on script load (document_start)
  // This is critical for privacy features to work before any Instagram XHR calls
  sendInitialSettings();
  
  // Use randomized delay for storage read to avoid detection patterns
  setTimeout(readAndPostSettings, randomizedDelay(0, 30));

  try {
    api.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "sync") return;
      if (!changes.anonStoryViewer && !changes.noSeenMessages && !changes.showDownload && !changes.browserQuickSave) return;
      readAndPostSettings();
    });
  } catch (_e) {}
})();
