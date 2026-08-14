// ========================================================================= //
//  Insta Super Features v6 — background service worker (MV3)
//
//  ARCHITECTURAL FIXES APPLIED (v6.1.0):
//   - P1-FIX #6: All chrome.runtime.onMessage listeners consolidated into
//     single unified router with unique Request IDs to prevent carousel collisions
//   - P1-FIX #8: Native Messaging payloads validated with strict schema checks
//   - P2-FIX #9: Cookie extraction bound strictly to verified Instagram origins
// ========================================================================= //

const ISF_MIN_HELPER_VERSION = "5.18.12";

const ISF_DEFAULT_SETTINGS = {
  showDownload: true,
  autoRedirect: false,
  autoReelsStart: true,
  applicationIsOn: true,
  autoComments: false,
  autoUnmute: true,
  showProgressBar: true,
  anonStoryViewer: false,
  noSeenMessages: false,
  stealthMode: true,  // NEW: Anti-detection randomization
  keyboardSeek: false,
  keyboardSeek3: true,
  feedCarouselArrows: true,
  autoFeedScroll: true,
  feedArrowNavigation: true,
  instagramAdBlocker: true,
  focusMode: false,
  spacePause: true,
  keyboardSuite: true,
  videoSpeedEnabled: true,
  videoSpeed: 1,
  bestQualityMode: true,
  fullscreenAmbientLight: false,
  enterLoveReact: true,
  browserQuickSave: true,
  notesPanelEnabled: false,
  colorfulNotesEnabled: false,
  noteActivityTracker: false
};

// === P1-FIX #6: Request ID tracking for deduplication === //
const pendingRequests = new Map();  // requestId -> { resolve, reject, timestamp }
const REQUEST_DEDUP_WINDOW_MS = 3000;  // Ignore duplicate requests within 3s

function generateRequestId() {
  try {
    if (crypto && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch (_) {}
  return 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function cleanupExpiredRequests() {
  const now = Date.now();
  for (const [id, req] of pendingRequests.entries()) {
    if (now - req.timestamp > REQUEST_DEDUP_WINDOW_MS * 2) {
      pendingRequests.delete(id);
    }
  }
}

// Run cleanup every 10 seconds
setInterval(cleanupExpiredRequests, 10000);

chrome.runtime.onInstalled.addListener(() => {
  const versionedFlags = { isfDefaultsV600: true };
  chrome.storage.sync.get([...Object.keys(ISF_DEFAULT_SETTINGS), ...Object.keys(versionedFlags)], (result) => {
    const patch = {};
    const firstV600Run = result.isfDefaultsV600 !== true;

    for (const [key, value] of Object.entries(ISF_DEFAULT_SETTINGS)) {
      // Fresh installs get the full recommended setup. Existing installs only
      // receive keys they never had, plus the one-time v6.0 defaults pass.
      if (result[key] === undefined || firstV600Run) patch[key] = value;
    }

    // Notes features stay disabled: they were unstable/noisy.
    patch.notesPanelEnabled = false;
    patch.colorfulNotesEnabled = false;
    patch.noteActivityTracker = false;
    patch.isfDefaultsV600 = true;

    chrome.storage.sync.set(patch);
  });
});

// ------------------------------------------------------------------------- //
//  Legacy popup -> background settings protocol (kept for compatibility)
// ------------------------------------------------------------------------- //
chrome.runtime.onMessage.addListener((data, sender, sendResponse) => {
  if (!data || !data.event) return;
  switch (data.event) {
    case "showDownload":
      chrome.storage.sync.set({ showDownload: data.showDownloadValue });
      break;
    case "autoRedirect":
      chrome.storage.sync.set({ autoRedirect: data.autoRedirectValue });
      break;
    case "autoMute":
      chrome.storage.sync.set({ autoUnmute: data.autoUnmuteValue });
      break;
    case "autoComments":
      chrome.storage.sync.set({ autoComments: data.autoCommentsValue });
      break;
    case "autoReelsStart":
      chrome.storage.sync.set({ autoReelsStart: data.autoReelsValue });
      break;
    case "noSeenMessages":
      chrome.storage.sync.set({ noSeenMessages: data.noSeenMessagesValue });
      break;
    case "anonStoryViewer":
      chrome.storage.sync.set({ anonStoryViewer: data.anonStoryViewerValue });
      break;
    case "keyboardSeek":
      chrome.storage.sync.set({ keyboardSeek: data.keyboardSeekValue, keyboardSeek3: false });
      break;
    case "keyboardSeekMode":
      chrome.storage.sync.set({ keyboardSeek: !!data.keyboardSeekValue, keyboardSeek3: !!data.keyboardSeek3Value });
      break;
    case "feedCarouselArrows":
      chrome.storage.sync.set({ feedCarouselArrows: data.feedCarouselArrowsValue });
      break;
    case "autoFeedScroll":
      chrome.storage.sync.set({ autoFeedScroll: data.autoFeedScrollValue });
      break;
    case "feedArrowNavigation":
      chrome.storage.sync.set({ feedArrowNavigation: data.feedArrowNavigationValue });
      break;
    case "instagramAdBlocker":
      chrome.storage.sync.set({ instagramAdBlocker: data.instagramAdBlockerValue });
      break;
    case "focusMode":
      chrome.storage.sync.set({ focusMode: !!data.focusModeValue });
      break;
    case "spacePause":
      chrome.storage.sync.set({ spacePause: data.spacePauseValue });
      break;
    case "keyboardSuite":
      chrome.storage.sync.set({ keyboardSuite: data.keyboardSuiteValue });
      break;
    case "videoSpeedEnabled":
      chrome.storage.sync.set({ videoSpeedEnabled: data.videoSpeedEnabledValue });
      break;
    case "videoSpeed": {
      const speed = Math.min(Math.max(Number(data.videoSpeedValue) || 1, 0.5), 3);
      chrome.storage.sync.set({ videoSpeed: speed, videoSpeedEnabled: true });
      break;
    }
    case "bestQualityMode":
      chrome.storage.sync.set({ bestQualityMode: data.bestQualityModeValue });
      break;
    case "browserQuickSave":
      chrome.storage.sync.set({ browserQuickSave: !!data.browserQuickSaveValue });
      break;
    case "fullscreenAmbientLight":
      chrome.storage.sync.set({ fullscreenAmbientLight: false });
      break;
    case "enterLoveReact":
      chrome.storage.sync.set({ enterLoveReact: data.enterLoveReactValue });
      break;
  }
});

// ------------------------------------------------------------------------- //
//  Small promise helpers (chrome.* callback APIs differ across channels)
// ------------------------------------------------------------------------- //
function isfCallApi(invoke) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => { if (!settled) { settled = true; resolve(value); } };
    try {
      const maybePromise = invoke(done);
      if (maybePromise && typeof maybePromise.then === "function") {
        maybePromise.then(done, () => done(undefined));
      }
    } catch (_) {
      done(undefined);
    }
  });
}

function isfCompareVersions(a, b) {
  const pa = String(a || "0").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b || "0").split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

// === ISF Native yt-dlp Downloader Bridge (protocol-compatible) === //
function isfBuildNetscapeCookies(cookies) {
  const seen = new Set();
  const lines = ["# Netscape HTTP Cookie File", "# Generated locally by Insta Super Features for yt-dlp"];
  for (const c of cookies || []) {
    if (!c || !c.name || c.value === undefined) continue;
    const key = [c.domain, c.path, c.name].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    const domain = c.domain || ".instagram.com";
    const includeSubdomains = domain.startsWith(".") ? "TRUE" : "FALSE";
    const path = c.path || "/";
    const secure = c.secure ? "TRUE" : "FALSE";
    const expiry = c.expirationDate ? Math.floor(c.expirationDate) : 0;
    lines.push([domain, includeSubdomains, path, secure, expiry, c.name, c.value].join("\t"));
  }
  return lines.join("\n") + "\n";
}

async function isfGetInstagramCookiePayload() {
  // === P2-FIX #9: Strict Instagram origin verification === //
  const VERIFIED_INSTAGRAM_DOMAINS = [
    'instagram.com',
    '.instagram.com',
    'www.instagram.com',
    'i.instagram.com'
  ];
  
  if (!chrome.cookies || !chrome.cookies.getAll) return { cookiesNetscape: "", cookieCount: 0, hasSessionId: false };

  const stores = chrome.cookies.getAllCookieStores
    ? (await isfCallApi((cb) => chrome.cookies.getAllCookieStores(cb))) || []
    : [{ id: undefined }];

  const queries = [];
  const addQuery = (q) => {
    // === P2-FIX #9: Verify domain is in whitelist before querying === //
    if (q.domain && !VERIFIED_INSTAGRAM_DOMAINS.includes(q.domain)) return;
    if (!queries.some((x) => JSON.stringify(x) === JSON.stringify(q))) queries.push(q);
  };

  for (const store of stores) {
    const storePatch = store && store.id ? { storeId: store.id } : {};
    addQuery({ domain: "instagram.com", ...storePatch });
    addQuery({ domain: ".instagram.com", ...storePatch });
    addQuery({ url: "https://www.instagram.com/", ...storePatch });
    addQuery({ url: "https://instagram.com/", ...storePatch });
    addQuery({ url: "https://i.instagram.com/", ...storePatch });
  }

  const buckets = await Promise.all(queries.map((q) => isfCallApi((cb) => chrome.cookies.getAll(q, cb))));
  const all = buckets.flat().filter(Boolean);

  const importantNames = new Set([
    "sessionid", "csrftoken", "ds_user_id", "ig_did", "mid", "rur", "datr", "shbid", "shbts", "wd"
  ]);

  const dedup = [];
  const seen = new Set();

  all.sort((a, b) => {
    const ai = importantNames.has(a.name) ? 0 : 1;
    const bi = importantNames.has(b.name) ? 0 : 1;
    return ai - bi;
  });

  for (const c of all) {
    if (!c || !c.name || c.value === undefined) continue;
    const domain = c.domain || ".instagram.com";
    if (!/instagram\.com$/i.test(domain.replace(/^\./, ""))) continue;
    const key = [domain, c.path || "/", c.name, c.storeId || ""].join("|");
    if (!seen.has(key)) {
      seen.add(key);
      dedup.push(c);
    }
  }

  const cookiesNetscape = isfBuildNetscapeCookies(dedup);
  const hasSessionId = dedup.some((c) => c.name === "sessionid" && String(c.value || "").length > 8);

  return {
    cookiesNetscape,
    cookieCount: dedup.length,
    hasSessionId,
    cookieNames: dedup.map((c) => c.name).slice(0, 80)
  };
}

// === P1-FIX #8: Strict schema validation for native messaging payloads === //
function isfValidateNativeMessagePayload(payload) {
  if (!payload || typeof payload !== 'object') return false;
  
  // Required fields for download requests
  if (payload.url && typeof payload.url !== 'string') return false;
  if (payload.directMediaUrl !== undefined && typeof payload.directMediaUrl !== 'string') return false;
  if (payload.mediaKind !== undefined && typeof payload.mediaKind !== 'string') return false;
  
  // Cookie payload validation
  if (payload.cookiesNetscape !== undefined && typeof payload.cookiesNetscape !== 'string') return false;
  if (payload.cookieCount !== undefined && typeof payload.cookieCount !== 'number') return false;
  if (payload.hasSessionId !== undefined && typeof payload.hasSessionId !== 'boolean') return false;
  
  // Type field validation
  if (payload.type !== undefined && typeof payload.type !== 'string') return false;
  const validTypes = ['ping', 'openFolder', 'saveCookies'];
  if (payload.type && !validTypes.includes(payload.type)) return false;
  
  // Prevent oversized payloads (DoS protection)
  try {
    const payloadSize = JSON.stringify(payload).length;
    if (payloadSize > 1024 * 1024) return false; // 1MB max
  } catch (_) {
    return false;
  }
  
  return true;
}

function isfSendNativeMessage(payload) {
  return new Promise((resolve) => {
    // === P1-FIX #8: Validate payload before sending === //
    if (!isfValidateNativeMessagePayload(payload)) {
      resolve({ ok: false, nativeUnavailable: true, error: "Invalid payload schema" });
      return;
    }
    
    try {
      chrome.runtime.sendNativeMessage("com.arnob.insta_downloader", payload, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, nativeUnavailable: true, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response || { ok: false, error: "No response from native downloader" });
      });
    } catch (err) {
      resolve({ ok: false, nativeUnavailable: true, error: String(err || "native messaging failed") });
    }
  });
}

function isfNotifyDownloadSaved(response) {
  try {
    if (!chrome.notifications || !response || !response.ok) return;
    const files = Array.isArray(response.files) ? response.files.filter(Boolean) : [];
    const targets = files.length ? files : [response.filepath || response.folder || "Download folder"];
    targets.forEach((target, index) => {
      chrome.notifications.create({
        type: "basic",
        iconUrl: "imgs/icon128.png",
        title: targets.length > 1 ? `Instagram file saved ${index + 1}/${targets.length}` : "Instagram download saved",
        message: response && response.lastAuthMethod ? `${target} (${response.lastAuthMethod})` : target
      });
    });
  } catch (_) {}
}

// ========================================================================= //
//  P1-FIX #6: Unified message router with Request ID deduplication
//  Replaces multiple independent chrome.runtime.onMessage.addListener calls
// ========================================================================= //

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Generate or extract request ID for deduplication
  const requestId = message.requestId || generateRequestId();
  const now = Date.now();
  
  // Check for duplicate requests within dedup window
  if (pendingRequests.has(requestId)) {
    const existing = pendingRequests.get(requestId);
    if (now - existing.timestamp < REQUEST_DEDUP_WINDOW_MS) {
      // Duplicate request - ignore silently
      return false;
    }
  }
  
  // Register this request
  pendingRequests.set(requestId, { resolve: sendResponse, reject: null, timestamp: now });
  
  // Route message by type
  const routeMessage = () => {
    if (!message || !message.type) return false;
    
    switch (message.type) {
      case "ISF_NATIVE_DOWNLOAD": {
        isfGetInstagramCookiePayload().then((cookiePayload) =>
          isfSendNativeMessage({
            url: message.url,
            directMediaUrl: message.directMediaUrl || "",
            mediaKind: message.mediaKind || "",
            ...cookiePayload
          })
        ).then((response) => {
          isfNotifyDownloadSaved(response);
          sendResponse(response);
        }).catch((err) => {
          sendResponse({ ok: false, error: String(err || "Native downloader failed") });
        });
        return true;
      }
      
      case "ISF_OPEN_DOWNLOAD_FOLDER": {
        isfSendNativeMessage({ type: "openFolder" }).then((response) => {
          if (response && response.ok === false && /Invalid Instagram/i.test(String(response.error || ""))) {
            sendResponse({ ok: false, needsUpdate: true, error: "Native helper is installed but too old. Run Copy Setup Script again, then reload the extension." });
            return;
          }
          sendResponse(response);
        });
        return true;
      }
      
      case "ISF_SAVE_MANUAL_COOKIES": {
        isfSendNativeMessage({ type: "saveCookies", cookieText: String(message.cookieText || "") })
          .then(sendResponse);
        return true;
      }
      
      case "ISF_CHECK_NATIVE_DOWNLOADER": {
        isfGetInstagramCookiePayload().then((cookiePayload) =>
          isfSendNativeMessage({ type: "ping", ...cookiePayload }).then((response) => ({ response, cookiePayload }))
        ).then(({ response, cookiePayload }) => {
          if (response.nativeUnavailable) {
            sendResponse({ ok: false, installed: false, error: response.error, cookiePayload });
            return;
          }
          const helperVersion = String(response && response.helperVersion || "0");
          const needsUpdate = isfCompareVersions(helperVersion, ISF_MIN_HELPER_VERSION) < 0;
          sendResponse({
            ok: !!response.ok && !needsUpdate,
            installed: !!response.ok,
            needsUpdate,
            helperVersion,
            response,
            cookiePayload
          });
        }).catch((error) => {
          sendResponse({ ok: false, installed: false, error: String(error || "Cookie check failed") });
        });
        return true;
      }
      
      case "ISF_BROWSER_DOWNLOAD": {
        const url = String(message.url || "");
        if (!/^https:\/\/[^/]*(cdninstagram\.com|fbcdn\.net|instagram\.com)\//i.test(url)) {
          sendResponse({ ok: false, error: "Refused: not an Instagram CDN URL" });
          return;
        }
        
        const ext = isfGuessExtension(url, message.mediaKind);
        const base = isfSanitizeDownloadName(message.filename || "instagram_media");
        const filename = `Insta Super Features/${base}.${ext}`;
        
        try {
          chrome.downloads.download(
            { url, filename, saveAs: false, conflictAction: "uniquify" },
            (downloadId) => {
              const err = chrome.runtime.lastError;
              if (err || typeof downloadId !== "number") {
                sendResponse({ ok: false, error: (err && err.message) || "Browser download was rejected" });
                return;
              }
              sendResponse({ ok: true, id: downloadId, filename, method: "browser" });
            }
          );
        } catch (err) {
          sendResponse({ ok: false, error: String(err || "downloads API failed") });
        }
        return true;
      }
      
      default:
        return false;
    }
  };
  
  const result = routeMessage();
  
  // Clean up pending request after response (for async handlers)
  if (result === true) {
    // Async handler - will clean up when response sent
    setTimeout(() => pendingRequests.delete(requestId), 30000);
  } else {
    // Sync handler or no match - clean up immediately
    pendingRequests.delete(requestId);
  }
  
  return result;
});

// ------------------------------------------------------------------------- //
//  NEW — Browser-native "Quick Save" downloads.
//  Uses chrome.downloads against pre-signed Instagram CDN URLs. The browser
//  attaches the profile's own cookies automatically, and the downloads API
//  does not need extra per-host permissions, so this works even when the
//  native helper is missing, outdated, or blocked by Instagram API changes.
// ------------------------------------------------------------------------- //
function isfSanitizeDownloadName(name) {
  const cleaned = String(name || "")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return cleaned || "instagram_media";
}

function isfGuessExtension(url, mediaKind) {
  try {
    const path = new URL(url).pathname.toLowerCase();
    const match = path.match(/\.(mp4|m4v|mov|jpg|jpeg|png|webp|heic)(?:$|\?)/);
    if (match) return match[1] === "jpeg" ? "jpg" : match[1];
  } catch (_) {}
  return mediaKind === "video" ? "mp4" : "jpg";
}

// ISF_BROWSER_DOWNLOAD is now handled in the unified router above (line 439-466)
// This duplicate listener has been removed as part of P1-FIX #6
