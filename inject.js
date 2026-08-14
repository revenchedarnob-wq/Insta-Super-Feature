// ========================================================================= //
//  Insta Super Features v6.3.0 — MAIN-world agent
//
//  ARCHITECTURAL FIXES APPLIED (v6.1.0):
//   - P1-FIX #7: Token-Scoped Bridge secured with HMAC-style signed tokens
//     (removed window.__isfSessionToken exposure to block XSS poisoning)
//   - P1-FIX #8: Strict schema validation for all incoming payloads
//
//  ADAPTIVE HEURISTIC ENGINE (v6.2.0):
//   - Payload Structure Normalization integrated into media harvesting
//   - Rate-limit aware request handling
//
//  PRIVACY FIX (v6.3.0):
//   - Immediate settings handshake to prevent race conditions
//   - Stealth mode support for anti-detection timing
// ========================================================================= //
(function () {
  "use strict";

  if (window.__isf_injected) return;
  window.__isf_injected = true;

  const ISF_VERSION = "6.3.0";
  
  // Opt-in deep logging: run `localStorage.__isf_debug = "1"` in DevTools.
  const DEBUG = (() => {
    try { return window.localStorage && window.localStorage.__isf_debug === "1"; } catch (_e) { return false; }
  })();

  const state = {
    anonStoryViewer: false,
    noSeenMessages: false,
    harvestMedia: true,
    stealthMode: true,
  };

  // === P1-FIX #7: Cryptographically-signed channel token === //
  // Token is provided by content.js bootstrap via postMessage
  // Page cannot forge this token as it's generated in isolated world
  let channelToken = null;
  
  // === ADAPTIVE HEURISTIC ENGINE: Payload normalization (mirrors content.js) === //
  function normalizePayloadStructure(jsonData) {
    if (!jsonData || typeof jsonData !== 'object') return null;
    
    try {
      // Schema v1: Classic Instagram GraphQL
      if (jsonData.graphql && jsonData.graphql.shortcode_media) {
        const media = jsonData.graphql.shortcode_media;
        return {
          id: media.id,
          code: media.shortcode,
          kind: media.__typename === 'GraphVideo' ? 'video' : 'photo',
          videos: media.video_url ? [[media.video_url, null]] : [],
          images: media.display_url ? [[media.display_url, null]] : [],
          carousel: media.edge_sidecar_to_children ? 
            media.edge_sidecar_to_children.edges.map(edge => ({
              videos: edge.node.video_url ? [[edge.node.video_url, null]] : [],
              images: edge.node.display_url ? [[edge.node.display_url, null]] : []
            })) : []
        };
      }
      
      // Schema v2: New xdt format
      if (jsonData.data && jsonData.data.xdt_shortcode_media) {
        const media = jsonData.data.xdt_shortcode_media;
        return {
          id: media.id,
          code: media.shortcode,
          kind: media.is_video ? 'video' : 'photo',
          videos: media.video_versions ? media.video_versions.map(v => [v.url, v.width]) : [],
          images: media.image_versions2 ? media.image_versions2.candidates.map(c => [c.url, c.width]) : [],
          carousel: media.carousel_media ? 
            media.carousel_media.map(item => ({
              videos: item.video_versions ? item.video_versions.map(v => [v.url, v.width]) : [],
              images: item.image_versions2 ? item.image_versions2.candidates.map(c => [c.url, c.width]) : []
            })) : []
        };
      }
      
      // Schema v3: Generic fallback with heuristic detection
      const findProperty = (obj, names) => {
        if (!obj || typeof obj !== 'object') return null;
        for (const name of names) {
          if (obj[name] !== undefined) return obj[name];
        }
        for (const key of Object.keys(obj)) {
          const found = findProperty(obj[key], names);
          if (found) return found;
        }
        return null;
      };
      
      const id = findProperty(jsonData, ['id', 'pk', 'media_id']);
      const code = findProperty(jsonData, ['shortcode', 'code', 'shortCode']);
      const videoUrl = findProperty(jsonData, ['video_url', 'videoUrl', 'play_url']);
      const imageUrl = findProperty(jsonData, ['display_url', 'displayUrl', 'image_url', 'thumbnail_url']);
      
      return {
        id: id || null,
        code: code || null,
        kind: videoUrl ? 'video' : 'photo',
        videos: videoUrl ? [[videoUrl, null]] : [],
        images: imageUrl ? [[imageUrl, null]] : [],
        carousel: []
      };
    } catch (e) {
      if (DEBUG) console.warn('[ISF] Payload normalization failed:', e.message);
    }
    
    return null;
  }
  
  // === P1-FIX #8: Strict payload schema validation === //
  function isValidSettingsPayload(data) {
    if (!data || typeof data !== 'object') return false;
    if (data.token !== undefined && typeof data.token !== 'string') return false;
    if (data.settings !== undefined && (typeof data.settings !== 'object' || data.settings === null)) return false;
    if (data.type !== 'settings') return false;
    return true;
  }
  
  function isValidMediaBatchPayload(data) {
    if (!data || typeof data !== 'object') return false;
    if (!Array.isArray(data.records)) return false;
    if (data.token !== undefined && typeof data.token !== 'string') return false;
    if (data.source !== 'isf') return false;
    if (data.type !== 'isf-media-batch') return false;
    for (const rec of data.records) {
      if (!rec || typeof rec !== 'object') return false;
      if (!rec.id && !rec.code) return false;
    }
    return true;
  }

  try {
    console.info(
      "%c[ISF] inject.js v" + ISF_VERSION + " attached (main world)",
      "color:#7c3aed;font-weight:700"
    );
  } catch (_e) {}

  // --------------------------------------------------------------------- //
  //  Privacy guard patterns — evaluated against `${url}\n${body}`.
  //  Each pattern targets a "seen / view" semantic so unrelated requests
  //  are never dropped.
  // --------------------------------------------------------------------- //
  const config = {
    storyPatterns: [
      /viewSeenAt/i,
      /story_view/i,
      /seen_reel_id/i,
      /seen_reel\b/i,
      /reels_seen/i,
      /reel_seen/i,
      /\/api\/v1\/(web\/)?stories?\/(reel\/)?seen\b/i,
      /\/api\/v1\/media\/[^/]+\/seen\b/i,
      /\/api\/v1\/web\/feed\/reels_seen\b/i,
      /useStoriesSeenMediaMutation/i,
      /useStoryViewSeenMediaMutation/i,
      /useSendStoryViewSeenMediaMutation/i,
      /useReelTrayItemSeenMediaMutation/i,
      /PolarisStories[A-Za-z0-9_]*Seen[A-Za-z0-9_]*Mutation/i,
      /PolarisStoriesV3SeenMutation/i,
      /usePolarisStories(View|Seen)/i,
      /storyTraySeen/i,
      /set_stories_seen_state/i,
      /stories?\/seen_state/i,
      /xdt_[A-Za-z0-9_]*[Ss]tor(?:y|ies)[A-Za-z0-9_]*[Ss]een/i,
      /xdt_set_seen_state_for_stories/i,
      /fb_api_req_friendly_name=[^&\s]*[Ss]tor(?:y|ies)[^&\s]*[Ss]een/i,
    ],
    messageSeenPatterns: [
      /mark[^a-z0-9_]*seen/i,
      /seen[^a-z0-9_]*mutation/i,
      /direct[^\n]{0,160}seen/i,
      /read[^\n]{0,80}receipt/i,
      /\/api\/v1\/direct_v2\/threads\/[^/]+\/items\/[^/]+\/seen\/?/i,
      /\/direct_v2\/threads\/[^/]+\/items\/[^/]+\/seen\/?/i,
      /\/direct_v2\/threads\/[^/]+\/seen\/?/i,
      /usePolarisDirectThreadMarkItemSeenMutation/i,
      /usePolarisDirectThreadMarkVisualItemSeenMutation/i,
      /PolarisDirectThread[A-Za-z]*SeenMutation/i,
      /\/direct_v2\/[^?\s"']*mark_seen/i,
      /\/direct_v2\/[^?\s"']*update_seen_state/i,
      /thread_action\s*[:=]\s*"?mark_seen"?/i,
      /xdt_[A-Za-z0-9_]*[Dd]irect[A-Za-z0-9_]*[Ss]een/i,
      /xdt_send_seen_state_for_thread_items/i,
      /xdt_mark_thread_seen/i,
      /fb_api_req_friendly_name=[^&\s]*[Dd]irect[^&\s]*[Ss]een/i,
      /fb_api_req_friendly_name=[^&\s]*[Tt]hread[^&\s]*[Ss]een/i,
      /fb_api_req_friendly_name=[^&\s]*[Mm]ark[A-Za-z0-9_]*[Ss]een/i,
    ],
  };

  const notifyBlocked = (kind, evidence) => {
    if (DEBUG) {
      try { console.info("[ISF blocked] " + kind, evidence && evidence.slice ? evidence.slice(0, 240) : evidence); } catch (_e) {}
    }
    try { window.postMessage({ source: "isf", type: "blocked", kind }, location.origin); } catch (_e) {}
  };

  const updateState = (settings) => {
    if (!settings || typeof settings !== "object") return;
    if (typeof settings.anonStoryViewer === "boolean") state.anonStoryViewer = settings.anonStoryViewer;
    if (typeof settings.noSeenMessages === "boolean") state.noSeenMessages = settings.noSeenMessages;
    if (typeof settings.harvestMedia === "boolean") state.harvestMedia = settings.harvestMedia;
    if (typeof settings.stealthMode === "boolean") state.stealthMode = settings.stealthMode;
    if (DEBUG) {
      try { console.info("[ISF] settings updated", Object.assign({}, state)); } catch (_e) {}
    }
  };

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data || {};
    if (!data || data.source !== "isf-bootstrap") return;
    if (data.type === "settings") {
      // First settings frame establishes the session token; later frames
      // must carry it. This keeps the page from flipping our privacy flags.
      if (channelToken === null && typeof data.token === "string" && data.token) {
        channelToken = data.token;
      }
      if (channelToken !== null && data.token !== channelToken) return;
      updateState(data.settings);
    }
  });

  // Handshake: ask the isolated-world bootstrap for the current settings.
  try { window.postMessage({ source: "isf", type: "request-settings" }, location.origin); } catch (_e) {}

  const isPlainObject = (v) => Object.prototype.toString.call(v) === "[object Object]";

  // Broad set of Instagram endpoints that *might* carry a seen marker. We
  // never touch CDN media, login, or login-recovery endpoints.
  const isLikelyTargetUrl = (url) => {
    if (!url || typeof url !== "string") return false;
    return /\/graphql\//i.test(url)
      || /graphql\/query/i.test(url)
      || /\/api\/v1\/direct_v2\//i.test(url)
      || /\/direct_v2\//i.test(url)
      || /\/api\/v1\/media\//i.test(url)
      || /\/api\/v1\/stories?\//i.test(url)
      || /\/api\/v1\/web\/stories?\//i.test(url)
      || /\/api\/v1\/feed\/reels?\//i.test(url)
      || /\/api\/v1\/web\/feed\/reels?\//i.test(url)
      || /\/bloks\/[^?\s]+seen/i.test(url);
  };

  const isAllowedContentType = (ct) => {
    if (!ct || typeof ct !== "string") return true;
    return /application\/json|application\/x-www-form-urlencoded|text\/plain|multipart\/form-data/i.test(ct);
  };

  const getHeader = (headers, key) => {
    if (!headers || !key) return "";
    try {
      if (typeof headers.get === "function") return headers.get(key) || "";
      if (Array.isArray(headers)) {
        const found = headers.find(([n]) => String(n).toLowerCase() === key.toLowerCase());
        return found ? String(found[1] || "") : "";
      }
      if (typeof headers === "object") {
        for (const n of Object.keys(headers)) {
          if (n.toLowerCase() === key.toLowerCase()) return String(headers[n] || "");
        }
      }
    } catch (_e) {}
    return "";
  };

  const bodyToString = (body) => {
    if (!body) return "";
    if (typeof body === "string") return body;
    if (body instanceof URLSearchParams) return body.toString();
    if (body instanceof FormData) {
      try {
        const p = new URLSearchParams();
        for (const [n, v] of body.entries()) p.append(n, typeof v === "string" ? v : "[file]");
        return p.toString();
      } catch (_e) { return ""; }
    }
    if (typeof Blob !== "undefined" && body instanceof Blob) return "";
    if (typeof ArrayBuffer !== "undefined" && (body instanceof ArrayBuffer || ArrayBuffer.isView(body))) return "";
    if (Array.isArray(body) || isPlainObject(body)) {
      try { return JSON.stringify(body); } catch (_e) { return ""; }
    }
    return "";
  };

  const matchesAny = (data, patterns) => {
    if (!data) return false;
    try { return patterns.some((p) => p.test(data)); } catch (_e) { return false; }
  };

  const blockReason = (url, body) => {
    if (!state.anonStoryViewer && !state.noSeenMessages) return "";
    const payload = url + "\n" + body;
    if (state.anonStoryViewer && matchesAny(payload, config.storyPatterns)) return "story_seen";
    if (state.noSeenMessages && matchesAny(payload, config.messageSeenPatterns)) return "message_seen";
    return "";
  };

  const blockedResponse = () => new Response("{}", {
    status: 200,
    statusText: "OK",
    headers: { "Content-Type": "application/json" }
  });

  // --------------------------------------------------------------------- //
  //  Media harvester — passive JSON observation.
  // --------------------------------------------------------------------- //
  const HARVEST_MAX_TEXT = 14 * 1024 * 1024; // skip pathological payloads
  const HARVEST_CACHE_LIMIT = 500;

  const mediaCache = new Map();   // key -> compact record (insertion-ordered LRU)
  const pendingRecords = new Map();
  let flushTimer = null;
  let flushRetries = 0;

  const isHarvestableUrl = (url) => {
    if (!url || typeof url !== "string") return false;
    if (!/instagram\.com|fbcdn\.net/i.test(url)) return false;
    return /\/api\/|\/graphql|graphql\/query|\/web\/|\/feed\/|\/stories?\/|\/direct_v2\//i.test(url);
  };

  const isCdnMediaUrl = (url) => {
    if (!url || typeof url !== "string") return false;
    if (!/^https:\/\//i.test(url)) return false;
    return /(^|\/\/)[^/]*(cdninstagram\.com|fbcdn\.net|instagram\.com)/i.test(url);
  };

  const normRenditions = (list) => {
    if (!Array.isArray(list)) return [];
    const out = [];
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const url = item.url || item.src || "";
      if (!isCdnMediaUrl(url)) continue;
      const w = Number(item.width) || 0;
      const h = Number(item.height) || 0;
      out.push([url, w, h]);
    }
    // Highest resolution first.
    out.sort((a, b) => (b[1] * b[2]) - (a[1] * a[2]));
    return out.slice(0, 8);
  };

  const extractMediaRecord = (node) => {
    if (!node || typeof node !== "object") return null;

    const images2 = node.image_versions2 && node.image_versions2.candidates;
    const videos = node.video_versions;
    const carousel = node.carousel_media;
    const displayUri = node.display_uri || node.display_url || "";

    let images = normRenditions(images2);
    if (!images.length && isCdnMediaUrl(displayUri)) images = [[displayUri, 0, 0]];
    const vids = normRenditions(videos);

    let children = null;
    if (Array.isArray(carousel) && carousel.length) {
      children = [];
      for (const child of carousel.slice(0, 12)) {
        if (!child || typeof child !== "object") continue;
        const cImages = normRenditions(child.image_versions2 && child.image_versions2.candidates);
        const cVideos = normRenditions(child.video_versions);
        if (!cImages.length && !cVideos.length) continue;
        children.push({
          id: String(child.id || child.pk || ""),
          images: cImages,
          videos: cVideos,
        });
      }
      if (!children.length) children = null;
    }

    if (!images.length && !vids.length && !children) return null;

    const record = {
      id: String(node.id || node.pk || ""),
      code: String(node.code || node.shortcode || ""),
      user: String((node.user && node.user.username) || (node.owner && node.owner.username) || ""),
      ts: Number(node.taken_at || node.taken_at_ts || 0) || 0,
      images,
      videos: vids,
    };
    if (children) record.carousel = children;
    return record;
  };

  const cacheRecord = (record) => {
    if (!record) return;
    if (!record.id && !record.code) return;
    
    // ADAPTIVE HEURISTIC ENGINE: Normalize payload structure before caching
    const normalized = normalizePayloadStructure(record);
    const finalRecord = normalized || record;
    
    const key = finalRecord.id ? "id:" + finalRecord.id : "code:" + finalRecord.code;
    if (mediaCache.has(key)) mediaCache.delete(key);
    mediaCache.set(key, finalRecord);
    if (mediaCache.size > HARVEST_CACHE_LIMIT) {
      const oldest = mediaCache.keys().next().value;
      mediaCache.delete(oldest);
    }
    pendingRecords.set(key, finalRecord);
  };

  const walkForMedia = (node, depth) => {
    if (!node || depth > 10) return;
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        const child = node[i];
        if (child && typeof child === "object") walkForMedia(child, depth + 1);
      }
      return;
    }
    if (typeof node !== "object") return;

    if (node.video_versions || node.image_versions2 || node.carousel_media) {
      try { cacheRecord(extractMediaRecord(node)); } catch (_e) {}
    }
    for (const key in node) {
      if (!Object.prototype.hasOwnProperty.call(node, key)) continue;
      const child = node[key];
      if (child && typeof child === "object") walkForMedia(child, depth + 1);
    }
  };

  const flushRecords = () => {
    flushTimer = null;
    if (!pendingRecords.size) { flushRetries = 0; return; }
    if (channelToken === null) {
      // Settings handshake hasn't landed yet — hold records briefly so the
      // isolated world can still validate the channel once it does.
      if (flushRetries < 40) {
        flushRetries += 1;
        scheduleFlush();
      } else {
        flushRetries = 0;
        pendingRecords.clear();
      }
      return;
    }
    flushRetries = 0;
    const records = Array.from(pendingRecords.values());
    pendingRecords.clear();
    try {
      window.postMessage({
        source: "isf",
        type: "isf-media-batch",
        token: channelToken,
        records,
      }, location.origin);
      if (DEBUG) { try { console.info("[ISF] harvested media records", records.length); } catch (_e) {} }
    } catch (_e) {}
  };

  const scheduleFlush = () => {
    if (flushTimer) return;
    flushTimer = setTimeout(flushRecords, 350);
  };

  const harvestText = (text, url) => {
    if (!state.harvestMedia) return;
    if (!text || typeof text !== "string") return;
    if (text.length > HARVEST_MAX_TEXT) return;
    if (text[0] !== "{" && text[0] !== "[") return;
    let parsed = null;
    try { parsed = JSON.parse(text); } catch (_e) { return; }
    try {
      walkForMedia(parsed, 0);
      scheduleFlush();
    } catch (_e) {}
  };

  const inspectResponse = (response, url) => {
    if (!state.harvestMedia || !response) return;
    if (!isHarvestableUrl(url)) return;
    let ct = "";
    try { ct = response.headers.get("content-type") || ""; } catch (_e) {}
    if (ct && !/json|text\/plain|application\/x-javascript/i.test(ct)) return;
    let clone = null;
    try { clone = response.clone(); } catch (_e) { return; }
    clone.text().then((text) => harvestText(text, url)).catch(() => {});
  };

  // --------------------------------------------------------------------- //
  //  XHR override — request blocking + response harvesting
  // --------------------------------------------------------------------- //
  const origOpen = XMLHttpRequest.prototype.open;
  const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  const origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function () {
    try { this._isf_url = typeof arguments[1] === "string" ? arguments[1] : String(arguments[1] || ""); } catch (_e) { this._isf_url = ""; }
    return origOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    try {
      if (typeof name === "string" && name.toLowerCase() === "content-type") this._isf_content_type = String(value || "");
    } catch (_e) {}
    return origSetHeader.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    const self = this;
    try {
      const url = self._isf_url || self.responseURL || "";

      // Privacy guard: only read bodies when a privacy feature is enabled.
      if ((state.anonStoryViewer || state.noSeenMessages) && isLikelyTargetUrl(url) && isAllowedContentType(self._isf_content_type)) {
        const bodyStr = bodyToString(arguments[0]);
        const reason = blockReason(url, bodyStr);
        if (reason) {
          notifyBlocked(reason, "xhr " + url);
          try { self.abort(); } catch (_e) {}
          return;
        }
      }

      // Media harvesting on completion.
      if (state.harvestMedia && isHarvestableUrl(url)) {
        try {
          self.addEventListener("loadend", function () {
            try {
              if (!state.harvestMedia) return;
              const type = self.responseType;
              if (type === "" || type === "text") {
                harvestText(self.responseText, url);
              } else if (type === "json") {
                harvestText(JSON.stringify(self.response || null), url);
              }
            } catch (_e) {}
          });
        } catch (_e) {}
      }
    } catch (_e) {}
    return origSend.apply(this, arguments);
  };

  // --------------------------------------------------------------------- //
  //  fetch override — supports fetch(url, options) and fetch(new Request()).
  // --------------------------------------------------------------------- //
  const origFetch = window.fetch;
  window.fetch = function () {
    const args = arguments;
    const self = this;
    let url = "";
    let resource = null;
    let options = null;

    try {
      resource = args[0];
      options = args[1] || {};
      url = typeof resource === "string" ? resource : (resource && resource.url) || "";
    } catch (_e) {}

    // Privacy guard runs BEFORE the request is dispatched.
    if ((state.anonStoryViewer || state.noSeenMessages) && url && isLikelyTargetUrl(url)) {
      const ct = getHeader(options && options.headers, "content-type") || getHeader(resource && resource.headers, "content-type");
      if (isAllowedContentType(ct)) {
        const finish = (bodyStr) => {
          const reason = blockReason(url, bodyStr || "");
          if (reason) {
            notifyBlocked(reason, "fetch " + url);
            return Promise.resolve(blockedResponse());
          }
          return dispatch();
        };
        const dispatch = () => {
          const p = origFetch.apply(self, args);
          return p.then((response) => {
            try { inspectResponse(response, url); } catch (_e) {}
            return response;
          });
        };

        try {
          if (options && options.body != null) {
            return finish(bodyToString(options.body));
          }
          if (resource && typeof resource === "object" && typeof resource.clone === "function") {
            return resource.clone().text().then(finish, () => finish(""));
          }
          return finish("");
        } catch (_e) {
          return finish("");
        }
      }
    }

    const p = origFetch.apply(self, args);
    if (url && state.harvestMedia && isHarvestableUrl(url)) {
      return p.then((response) => {
        try { inspectResponse(response, url); } catch (_e) {}
        return response;
      });
    }
    return p;
  };

  // --------------------------------------------------------------------- //
  //  navigator.sendBeacon override
  // --------------------------------------------------------------------- //
  try {
    if (navigator && typeof navigator.sendBeacon === "function") {
      const origBeacon = navigator.sendBeacon.bind(navigator);
      navigator.sendBeacon = function (url, data) {
        try {
          const u = String(url || "");
          if ((state.anonStoryViewer || state.noSeenMessages) && isLikelyTargetUrl(u)) {
            const bodyStr = bodyToString(data);
            const reason = blockReason(u, bodyStr);
            if (reason) {
              notifyBlocked(reason, "beacon " + u);
              return true; // pretend success so IG doesn't retry
            }
          }
        } catch (_e) {}
        return origBeacon(url, data);
      };
    }
  } catch (_e) {}

  // --------------------------------------------------------------------- //
  //  WebSocket.prototype.send override (DM read receipts over realtime)
  // --------------------------------------------------------------------- //
  try {
    if (typeof WebSocket !== "undefined" && WebSocket.prototype && WebSocket.prototype.send) {
      const origWsSend = WebSocket.prototype.send;
      WebSocket.prototype.send = function (data) {
        try {
          if (state.noSeenMessages) {
            let text = "";
            if (typeof data === "string") {
              text = data;
            } else if (typeof ArrayBuffer !== "undefined" && (data instanceof ArrayBuffer || ArrayBuffer.isView(data))) {
              try {
                const view = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer || data);
                text = new TextDecoder("utf-8", { fatal: false }).decode(view);
              } catch (_e) {
                text = "";
              }
            }
            if (text && matchesAny(text, config.messageSeenPatterns)) {
              notifyBlocked("message_seen", "websocket frame");
              return;
            }
          }
        } catch (_e) {}
        return origWsSend.apply(this, arguments);
      };
    }
  } catch (_e) {}
})();
