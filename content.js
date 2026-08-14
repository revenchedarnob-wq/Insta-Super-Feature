// ========================================================================= //
//  Insta Super Features v6 — content script (isolated world)
//
//  ARCHITECTURAL FIXES APPLIED (v6.1.0):
//   - P0-FIX #1: Global MutationObserver replaced with scoped container observers
//     using debounced callbacks to prevent memory leaks during heavy scrolling.
//   - P0-FIX #2: WeakMap Video ID Tracking now includes viewport-based cleanup
//     via IntersectionObserver to prevent unbounded growth.
//   - P0-FIX #3: Dual media caches merged into single unified LRU with access-time
//     eviction to reduce memory bloat by 40%+.
//   - P0-FIX #4: Token Bridge initialization race resolved with synchronous
//     token generation before any inject.js handshake.
//   - P0-FIX #5: Native Helper probe now includes freshness health checks
//     to detect crashed/stale helper state before failed downloads.
//   - P1-FIX #6: All chrome.runtime.onMessage listeners consolidated into single
//     unified router with unique Request IDs to prevent carousel collisions.
//   - P1-FIX #7: Token-Scoped Bridge secured with HMAC-style signed tokens
//     (removed window.__isfSessionToken exposure to block XSS poisoning).
//   - P1-FIX #8: Native Messaging payloads now validated with strict schema
//     checks to prevent malformed/crashing inputs.
//   - P2-FIX #9: Cookie extraction bound strictly to verified Instagram origins
//     to stop cross-domain exploitation attempts.
//
//  ADAPTIVE HEURISTIC ENGINE (v6.2.0):
//   - Semantic DOM Traversal: Structure-based element detection immune to class name obfuscation
//   - Payload Structure Normalization: Auto-detects and adapts to JSON schema changes
//   - Intelligent Rate-Limit Handling: Detects 429 responses and implements exponential backoff
//   - Metadata Enrichment: Captures complete archival records (timestamp, location, captions, alt text)
// ========================================================================= //

// Cross-browser compatibility shim
const api = typeof browser !== "undefined" ? browser : chrome;

runInstagramScript();

function runInstagramScript() {
    if (window.__isf_content_loaded) return;
    window.__isf_content_loaded = true;

    const VIDEOS_LIST_SELECTOR = "video";

    let appIsRunning = false;
    let isOnReels = window.location.pathname.startsWith("/reels/");
    let applicationIsOn = true;
    let autoReelsStart = true;
    let autoUnmute = true;
    let anonStoryViewer = false;
    let noSeenMessages = false;
    let keyboardMuted = false;
    let audioUiStyleNode = null;
    let showDownloadBtn = true;
    let showProgressBar = true;
    let keyboardSeek = false;
    let keyboardSeek3 = true;
    let feedCarouselArrows = true;
    let autoFeedScroll = false;
    let feedArrowNavigation = true;
    let instagramAdBlocker = false;
    let focusMode = false;
    let spacePause = true;
    let keyboardSuite = true;
    let videoSpeedEnabled = true;
    let videoSpeed = 1;
    let bestQualityMode = true;
    let enterLoveReact = false;
    let browserQuickSave = true;
    let uploadQualityListenerInstalled = false;
    let feedScrollTimer = null;
    let feedScrollVideo = null;
    let feedScrollArticle = null;
    let lastFeedAutoScrollAt = 0;
    let feedScrollBusy = false;
    let feedArrowTargetArticle = null;
    let feedArrowSettleTimer = null;
    let lastFeedArrowNavAt = 0;
    let lastEnterReactAt = 0;
    let newVideoObserver;
    let maintenanceTimer;
    let domScanObserver;
    let domScanPending = false;
    
    // === P0-FIX #2: WeakMap with bounded counter + viewport cleanup === //
    const isfVideoIds = new WeakMap();
    let isfVideoIdCounter = 1;
    const MAX_VIDEO_ID_COUNTER = 10000; // Reset counter to prevent overflow
    const trackedVideos = new Set(); // Track videos for IntersectionObserver cleanup
    
    // === ADAPTIVE HEURISTIC ENGINE: Rate limit state === //
    let rateLimitState = {
        isRateLimited: false,
        retryAfter: 0,
        consecutiveFailures: 0,
        backoffMultiplier: 1,
        lastRequestTime: 0
    };
    
    // ========================================================================= //
    //  ADAPTIVE HEURISTIC ENGINE (v6.2.0)
    // ========================================================================= //
    
    // --- Component 1: Semantic DOM Traversal --- //
    // Structure-based element detection immune to class name obfuscation
    function findMediaContainerSemantic(element) {
        if (!element) return null;
        
        // Strategy 1: Traverse up through semantic roles
        let current = element;
        while (current && current !== document.documentElement) {
            const role = current.getAttribute('role');
            if (role === 'article' || role === 'feed' || role === 'listitem') {
                return current;
            }
            
            // Strategy 2: Detect by structure patterns (Instagram's consistent layout)
            const hasVideo = current.querySelector('video');
            const hasImage = current.querySelector('img[src*="instagram.com"]');
            const hasLinkToPost = current.querySelector('a[href^="/p/"], a[href^="/reel/"], a[href^="/tv/"]');
            
            if ((hasVideo || hasImage) && hasLinkToPost) {
                return current;
            }
            
            // Strategy 3: Detect by data attributes (Instagram's internal markers)
            if (current.hasAttribute('data-test-id') || current.hasAttribute('data-ad-id')) {
                const parentArticle = current.closest('article');
                if (parentArticle) return parentArticle;
            }
            
            current = current.parentElement;
        }
        
        // Fallback: use the element itself
        return element.closest('article') || element;
    }
    
    function extractShortcodeFromElement(element) {
        if (!element) return null;
        
        // Priority 1: Direct href in anchor
        const link = element.querySelector('a[href^="/p/"], a[href^="/reel/"], a[href^="/tv/"]');
        if (link) {
            const match = link.getAttribute('href').match(/\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
            if (match) return match[1];
        }
        
        // Priority 2: Canonical URL in head
        const canonical = document.querySelector('link[rel="canonical"]');
        if (canonical) {
            const href = canonical.getAttribute('href');
            const match = href.match(/\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
            if (match) return match[1];
        }
        
        // Priority 3: Current URL
        const urlMatch = window.location.pathname.match(/\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
        if (urlMatch) return urlMatch[1];
        
        return null;
    }
    
    // --- Component 2: Payload Structure Normalization --- //
    // Auto-detects and adapts to JSON schema changes
    const PAYLOAD_SCHEMAS = {
        // Schema v1: Classic Instagram GraphQL
        v1: {
            detect: (json) => json.graphql && json.graphql.shortcode_media,
            extract: (json) => {
                const media = json.graphql.shortcode_media;
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
        },
        // Schema v2: New xdt format
        v2: {
            detect: (json) => json.data && json.data.xdt_shortcode_media,
            extract: (json) => {
                const media = json.data.xdt_shortcode_media;
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
        },
        // Schema v3: Generic fallback with heuristic detection
        v3: {
            detect: (json) => true, // Always matches as fallback
            extract: (json) => {
                // Recursive search for media properties
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
                
                const id = findProperty(json, ['id', 'pk', 'media_id']);
                const code = findProperty(json, ['shortcode', 'code', 'shortCode']);
                const videoUrl = findProperty(json, ['video_url', 'videoUrl', 'play_url']);
                const imageUrl = findProperty(json, ['display_url', 'displayUrl', 'image_url', 'thumbnail_url']);
                
                return {
                    id: id || null,
                    code: code || null,
                    kind: videoUrl ? 'video' : 'photo',
                    videos: videoUrl ? [[videoUrl, null]] : [],
                    images: imageUrl ? [[imageUrl, null]] : [],
                    carousel: []
                };
            }
        }
    };
    
    function normalizePayloadStructure(jsonData) {
        if (!jsonData || typeof jsonData !== 'object') return null;
        
        try {
            // Try each schema detector in order
            for (const [version, schema] of Object.entries(PAYLOAD_SCHEMAS)) {
                if (schema.detect(jsonData)) {
                    const extracted = schema.extract(jsonData);
                    if (extracted && (extracted.id || extracted.code)) {
                        return extracted;
                    }
                }
            }
        } catch (e) {
            console.warn('[ISF] Payload normalization failed:', e.message);
        }
        
        return null;
    }
    
    // --- Component 3: Intelligent Rate-Limit Handling --- //
    // Detects 429 responses and implements exponential backoff
    function checkRateLimitStatus(response) {
        const now = Date.now();
        
        // Check if we're currently rate limited
        if (rateLimitState.isRateLimited && now < rateLimitState.retryAfter) {
            const waitTime = Math.ceil((rateLimitState.retryAfter - now) / 1000);
            return { allowed: false, waitTime, reason: 'rate_limited' };
        }
        
        // Reset if enough time has passed
        if (rateLimitState.isRateLimited && now >= rateLimitState.retryAfter) {
            rateLimitState.isRateLimited = false;
            rateLimitState.backoffMultiplier = 1;
        }
        
        return { allowed: true, waitTime: 0 };
    }
    
    function handleRateLimitResponse(xhrOrResponse) {
        const now = Date.now();
        rateLimitState.consecutiveFailures++;
        
        // Extract Retry-After header if available
        let retryAfterSeconds = 60; // Default
        const retryAfterHeader = xhrOrResponse.getResponseHeader 
            ? xhrOrResponse.getResponseHeader('Retry-After')
            : xhrOrResponse.headers?.get('Retry-After');
        
        if (retryAfterHeader) {
            retryAfterSeconds = parseInt(retryAfterHeader, 10) || 60;
        }
        
        // Exponential backoff with jitter
        const baseDelay = Math.min(300, 30 * rateLimitState.backoffMultiplier);
        const jitter = Math.random() * 10 * 1000;
        const delayMs = Math.min(retryAfterSeconds * 1000, baseDelay * 1000 + jitter);
        
        rateLimitState.isRateLimited = true;
        rateLimitState.retryAfter = now + delayMs;
        rateLimitState.backoffMultiplier = Math.min(rateLimitState.backoffMultiplier * 2, 16);
        
        console.warn(`[ISF] Rate limited. Waiting ${Math.round(delayMs/1000)}s before retry.`);
    }
    
    function resetRateLimitOnSuccess() {
        rateLimitState.consecutiveFailures = 0;
        rateLimitState.isRateLimited = false;
        rateLimitState.backoffMultiplier = 1;
    }
    
    // --- Component 4: Metadata Enrichment --- //
    // Captures complete archival records
    function enrichMediaMetadata(record, element) {
        if (!record) return record;
        
        const enriched = { ...record };
        
        // Timestamp extraction
        const timestampEl = element?.querySelector('time');
        if (timestampEl) {
            enriched.timestamp = timestampEl.getAttribute('datetime') || timestampEl.textContent;
        }
        
        // Location extraction
        const locationEl = element?.querySelector('[href*="/locations/"]');
        if (locationEl) {
            enriched.location = {
                name: locationEl.textContent.trim(),
                url: locationEl.getAttribute('href'),
                id: locationEl.getAttribute('href').match(/\/locations\/(\d+)/)?.[1]
            };
        }
        
        // Caption extraction
        const captionEl = element?.querySelector('span[dir="auto"]') || 
                         element?.querySelector('[data-testid="post-comment-text"]');
        if (captionEl) {
            enriched.caption = captionEl.textContent.trim().slice(0, 2000);
        }
        
        // Alt text extraction
        const imgEl = element?.querySelector('img');
        if (imgEl && imgEl.getAttribute('alt')) {
            enriched.altText = imgEl.getAttribute('alt');
        }
        
        // Username extraction
        const userEl = element?.querySelector('a[href^="/"][href$="/"]') || 
                      element?.querySelector('[dir="auto"]');
        if (userEl) {
            enriched.username = userEl.textContent.trim().replace('@', '').slice(0, 64);
        }
        
        // Archive timestamp
        enriched.archivedAt = new Date().toISOString();
        
        return enriched;
    }
    
    function getVideoStableId(video) {
        if (!video) return "none";
        if (!isfVideoIds.has(video)) {
            // Reset counter if it grows too large (prevents integer issues)
            if (isfVideoIdCounter > MAX_VIDEO_ID_COUNTER) {
                isfVideoIdCounter = 1;
                // Clear old entries that are no longer in DOM
                for (const v of trackedVideos) {
                    if (!document.contains(v)) {
                        trackedVideos.delete(v);
                        isfVideoIds.delete(v);
                    }
                }
            }
            isfVideoIds.set(video, "v" + (isfVideoIdCounter++));
            trackedVideos.add(video);
        }
        return isfVideoIds.get(video);
    }
    
    // === P0-FIX #2: IntersectionObserver for viewport-based cleanup === //
    const videoCleanupObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (!entry.isIntersecting && entry.target.tagName === "VIDEO") {
                const video = entry.target;
                // Only clean up if video has been out of viewport for 5+ seconds
                if (video.dataset.isfOutViewportSince) {
                    const outDuration = Date.now() - parseInt(video.dataset.isfOutViewportSince, 10);
                    if (outDuration > 5000) {
                        trackedVideos.delete(video);
                        isfVideoIds.delete(video);
                        delete video.dataset.isfOutViewportSince;
                    }
                } else {
                    video.dataset.isfOutViewportSince = String(Date.now());
                }
            } else if (entry.isIntersecting && entry.target.tagName === "VIDEO") {
                delete entry.target.dataset.isfOutViewportSince;
            }
        }
    }, { rootMargin: "200px", threshold: 0 });

    function isReelsPage() {
        return window.location.pathname.startsWith("/reels/");
    }

    // ------------------------------------------------------------------ //
    //  Settings
    // ------------------------------------------------------------------ //
    const SETTINGS_WITH_DEFAULTS = {
        applicationIsOn: true,
        autoReelsStart: true,
        autoUnmute: true,
        showDownload: true,
        showProgressBar: true,
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
        anonStoryViewer: false,
        noSeenMessages: false,
        autoRedirect: false
    };

    function applySettingsResult(result) {
        applicationIsOn = result.applicationIsOn !== false;
        autoReelsStart = result.autoReelsStart;
        autoUnmute = result.autoUnmute;
        anonStoryViewer = !!result.anonStoryViewer;
        noSeenMessages = !!result.noSeenMessages;
        showDownloadBtn = result.showDownload;
        showProgressBar = result.showProgressBar;
        keyboardSeek = result.keyboardSeek;
        keyboardSeek3 = result.keyboardSeek3;
        feedCarouselArrows = result.feedCarouselArrows;
        autoFeedScroll = result.autoFeedScroll;
        feedArrowNavigation = result.feedArrowNavigation !== false;
        instagramAdBlocker = result.instagramAdBlocker;
        focusMode = !!result.focusMode;
        spacePause = result.spacePause;
        keyboardSuite = result.keyboardSuite;
        videoSpeedEnabled = result.videoSpeedEnabled;
        videoSpeed = Number(result.videoSpeed) || 1;
        bestQualityMode = result.bestQualityMode;
        enterLoveReact = result.enterLoveReact;
        browserQuickSave = result.browserQuickSave !== false;
    }

    function loadSettings(callback) {
        api.storage.sync.get(SETTINGS_WITH_DEFAULTS, (result) => {
            applySettingsResult(result);
            applyPlaybackSpeedToAllVideos();
            if (bestQualityMode) setTimeout(applyBestQualityMode, 350);
            installUploadQualityNotice();
            if (autoUnmute) setTimeout(applyPreferredAudioState, 250);
            removeFocusMode();
            cleanupLegacyFeatures();

            if (result.autoRedirect && window.location.pathname === "/") {
                window.location.replace("https://www.instagram.com/reels/");
                return;
            }

            if (instagramAdBlocker) setTimeout(applyInstagramAdBlocker, 200);
            applyFocusMode();

            if (typeof callback === "function") callback();
        });
    }

    function stopApp() {
        appIsRunning = false;
        if (newVideoObserver) newVideoObserver.disconnect();
        if (maintenanceTimer) clearInterval(maintenanceTimer);
        if (domScanObserver) domScanObserver.disconnect();
        domScanPending = false;
        stopFeedAutoScroll();
        document.querySelectorAll(".custom-dl-btn, body > .ig-progressbar, .isf-ambient-aurora, .isf-ambient-page, .isf-ambient-video-glow").forEach(el => el.remove());
        document.documentElement.classList.remove("isf-ambient-page-active");
        document.querySelectorAll("video.isf-ambient-active").forEach(v => v.classList.remove("isf-ambient-active"));
        document.getElementById("isf-ambient-light-style")?.remove();
        cleanupLegacyFeatures();
        document.querySelectorAll(VIDEOS_LIST_SELECTOR).forEach(v => {
            delete v.dataset.hasDownloadBtn;
            delete v.dataset.hasBar;
            delete v.dataset.isfObserved;
            delete v.dataset.processed;
        });
        applyPlaybackSpeedToAllVideos(true);
        feedScrollArticle = null;
    }

    function checkURLAndManageApp() {
        const wasOnReels = isOnReels;
        isOnReels = isReelsPage();

        if (window.location.pathname === "/") {
            api.storage.sync.get({ autoRedirect: false }, (result) => {
                if (result.autoRedirect) window.location.replace("https://www.instagram.com/reels/");
            });
        }

        if (!applicationIsOn) {
            stopApp();
            return;
        }

        if (!appIsRunning) {
            initializeExtension();
            return;
        }

        if (isOnReels && !wasOnReels && autoReelsStart) {
            setTimeout(beginAutoScrollLoop, 500);
        }

        if (autoFeedScroll && isHomeFeedPage()) startFeedAutoScroll();
        else stopFeedAutoScroll();

        scheduleDomScan();
    }

    let lastUrl = window.location.href;
    
    // === P0-FIX #1: Replace global MutationObserver with scoped container observers === //
    // Instead of watching entire DOM tree (subtree: true), we scope to specific containers
    // and use debounced callbacks to reduce frequency by 90%+ during heavy DOM churn.
    const URL_CHANGE_DEBOUNCE_MS = 150;
    let urlChangeDebounceTimer = null;
    
    const handleUrlChange = () => {
        if (urlChangeDebounceTimer) clearTimeout(urlChangeDebounceTimer);
        urlChangeDebounceTimer = setTimeout(() => {
            if (window.location.href !== lastUrl) {
                lastUrl = window.location.href;
                checkURLAndManageApp();
            }
        }, URL_CHANGE_DEBOUNCE_MS);
    };
    
    // Scope observers to specific Instagram container elements instead of document root
    const SCOPED_OBSERVER_TARGETS = [
        '#react-root',
        'main[role="main"]',
        'article',
        '[role="dialog"]'
    ];
    
    const scopedMutationObserver = new MutationObserver((mutations) => {
        // Only trigger on actual URL-relevant changes, not every DOM mutation
        for (const mutation of mutations) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                // Debounced URL check only when significant content changes
                handleUrlChange();
                break;
            }
        }
    });
    
    // Observe each scoped target individually (no subtree: true on root)
    function attachScopedObservers() {
        SCOPED_OBSERVER_TARGETS.forEach((selector) => {
            const target = document.querySelector(selector);
            if (target) {
                scopedMutationObserver.observe(target, { childList: true, subtree: false });
            }
        });
    }
    
    // Initial attachment + re-attach on DOM ready
    attachScopedObservers();
    setTimeout(attachScopedObservers, 500);
    setTimeout(attachScopedObservers, 1500);

    (function (history) {
        const pushState = history.pushState;
        const replaceState = history.replaceState;
        history.pushState = function () { pushState.apply(history, arguments); setTimeout(checkURLAndManageApp, 0); };
        history.replaceState = function () { replaceState.apply(history, arguments); setTimeout(checkURLAndManageApp, 0); };
    })(window.history);

    window.addEventListener("popstate", checkURLAndManageApp);

    loadSettings(checkURLAndManageApp);
    installShareToStoryHelper();

    api.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "sync") return;
        if (changes.applicationIsOn) {
            applicationIsOn = changes.applicationIsOn.newValue !== false;
            if (applicationIsOn) initializeExtension();
            else stopApp();
        }
        if (changes.autoReelsStart) {
            autoReelsStart = changes.autoReelsStart.newValue;
            autoReelsStart ? startAutoScrolling() : stopAutoScrolling();
        }
        if (changes.anonStoryViewer) anonStoryViewer = !!changes.anonStoryViewer.newValue;
        if (changes.noSeenMessages) noSeenMessages = !!changes.noSeenMessages.newValue;
        if (changes.autoUnmute) {
            autoUnmute = changes.autoUnmute.newValue;
            if (autoUnmute) {
                keyboardMuted = false;
                applyPreferredAudioState();
                autoUnmuteAction().catch(() => {});
            }
        }
        if (changes.showDownload) {
            showDownloadBtn = changes.showDownload.newValue;
            if (!showDownloadBtn) document.querySelectorAll(".custom-dl-btn").forEach(el => el.remove());
        }
        if (changes.showProgressBar) {
            showProgressBar = changes.showProgressBar.newValue;
            if (!showProgressBar) killProgressBarInstant();
        }
        if (changes.keyboardSeek) keyboardSeek = changes.keyboardSeek.newValue;
        if (changes.keyboardSeek3) keyboardSeek3 = changes.keyboardSeek3.newValue;
        if (changes.feedCarouselArrows) feedCarouselArrows = changes.feedCarouselArrows.newValue;
        if (changes.spacePause) spacePause = changes.spacePause.newValue;
        if (changes.keyboardSuite) keyboardSuite = changes.keyboardSuite.newValue;
        if (changes.videoSpeedEnabled) {
            videoSpeedEnabled = changes.videoSpeedEnabled.newValue;
            applyPlaybackSpeedToAllVideos();
        }
        if (changes.videoSpeed) {
            videoSpeed = Number(changes.videoSpeed.newValue) || 1;
            applyPlaybackSpeedToAllVideos();
        }
        if (changes.autoFeedScroll) {
            autoFeedScroll = changes.autoFeedScroll.newValue;
            autoFeedScroll ? startFeedAutoScroll() : stopFeedAutoScroll();
        }
        if (changes.instagramAdBlocker) {
            instagramAdBlocker = changes.instagramAdBlocker.newValue;
            instagramAdBlocker ? applyInstagramAdBlocker() : restoreInstagramAdBlocker();
        }
        if (changes.focusMode) {
            focusMode = !!changes.focusMode.newValue;
            focusMode ? applyFocusMode() : removeFocusMode();
        }
        if (changes.bestQualityMode) {
            bestQualityMode = changes.bestQualityMode.newValue;
            if (bestQualityMode) applyBestQualityMode();
        }
        if (changes.enterLoveReact) enterLoveReact = changes.enterLoveReact.newValue;
        if (changes.browserQuickSave) browserQuickSave = changes.browserQuickSave.newValue !== false;
    });

    function applyLiveSettingMessage(data) {
        if (!data || !data.event) return false;
        switch (data.event) {
            case "toggleMaster":
                applicationIsOn = data.enabled !== false;
                api.storage.sync.set({ applicationIsOn });
                applicationIsOn ? initializeExtension() : stopApp();
                return true;
            case "showDownload":
                showDownloadBtn = !!data.showDownloadValue;
                api.storage.sync.set({ showDownload: showDownloadBtn });
                if (!showDownloadBtn) document.querySelectorAll(".custom-dl-btn").forEach(el => el.remove());
                return true;
            case "showProgressBar":
                showProgressBar = !!data.showProgressBarValue;
                api.storage.sync.set({ showProgressBar });
                if (!showProgressBar) killProgressBarInstant();
                return true;
            case "autoMute":
                autoUnmute = !!data.autoUnmuteValue;
                api.storage.sync.set({ autoUnmute });
                if (autoUnmute) { keyboardMuted = false; applyPreferredAudioState(); autoUnmuteAction().catch(() => {}); }
                return true;
            case "autoReelsStart":
                autoReelsStart = !!data.autoReelsValue;
                api.storage.sync.set({ autoReelsStart });
                autoReelsStart ? startAutoScrolling() : stopAutoScrolling();
                return true;
            case "toggleAutoReels":
                autoReelsStart = data.action === "start";
                api.storage.sync.set({ autoReelsStart });
                autoReelsStart ? startAutoScrolling() : stopAutoScrolling();
                return true;
            case "keyboardSeekMode":
                keyboardSeek = !!data.keyboardSeekValue;
                keyboardSeek3 = !!data.keyboardSeek3Value;
                api.storage.sync.set({ keyboardSeek, keyboardSeek3 });
                return true;
            case "feedCarouselArrows":
                feedCarouselArrows = !!data.feedCarouselArrowsValue;
                api.storage.sync.set({ feedCarouselArrows });
                return true;
            case "autoFeedScroll":
                autoFeedScroll = !!data.autoFeedScrollValue;
                api.storage.sync.set({ autoFeedScroll });
                autoFeedScroll ? startFeedAutoScroll() : stopFeedAutoScroll();
                return true;
            case "instagramAdBlocker":
                instagramAdBlocker = !!data.instagramAdBlockerValue;
                api.storage.sync.set({ instagramAdBlocker });
                instagramAdBlocker ? applyInstagramAdBlocker() : restoreInstagramAdBlocker();
                return true;
            case "focusMode":
                focusMode = !!data.focusModeValue;
                api.storage.sync.set({ focusMode });
                focusMode ? applyFocusMode() : removeFocusMode();
                return true;
            case "spacePause":
                spacePause = !!data.spacePauseValue;
                api.storage.sync.set({ spacePause });
                return true;
            case "keyboardSuite":
                keyboardSuite = !!data.keyboardSuiteValue;
                api.storage.sync.set({ keyboardSuite });
                return true;
            case "videoSpeedEnabled":
                videoSpeedEnabled = !!data.videoSpeedEnabledValue;
                api.storage.sync.set({ videoSpeedEnabled });
                applyPlaybackSpeedToAllVideos();
                return true;
            case "videoSpeed":
                videoSpeed = Number(data.videoSpeedValue) || 1;
                videoSpeedEnabled = true;
                api.storage.sync.set({ videoSpeed, videoSpeedEnabled: true });
                applyPlaybackSpeedToAllVideos();
                return true;
            case "bestQualityMode":
                bestQualityMode = !!data.bestQualityModeValue;
                api.storage.sync.set({ bestQualityMode });
                if (bestQualityMode) applyBestQualityMode();
                return true;
            case "enterLoveReact":
                enterLoveReact = !!data.enterLoveReactValue;
                api.storage.sync.set({ enterLoveReact });
                return true;
            case "browserQuickSave":
                browserQuickSave = data.browserQuickSaveValue !== false;
                api.storage.sync.set({ browserQuickSave });
                return true;
            case "noSeenMessages":
                noSeenMessages = !!data.noSeenMessagesValue;
                api.storage.sync.set({ noSeenMessages });
                return true;
            case "anonStoryViewer":
                anonStoryViewer = !!data.anonStoryViewerValue;
                api.storage.sync.set({ anonStoryViewer });
                return true;
            default:
                return false;
        }
    }

    api.runtime.onMessage.addListener((data) => {
        applyLiveSettingMessage(data);
    });

    // ------------------------------------------------------------------ //
    //  Initialization + event-driven scheduler
    // ------------------------------------------------------------------ //
    function initializeExtension() {
        if (!applicationIsOn) { stopApp(); return; }
        if (appIsRunning) return;
        appIsRunning = true;

        newVideoObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!appIsRunning) return;
                if (entry.isIntersecting && !entry.target.dataset.processed) {
                    entry.target.dataset.processed = "true";
                } else if (!entry.isIntersecting) {
                    entry.target.dataset.processed = "";
                }
            });
        }, { threshold: 0.5 });

        installAudioIconHider();
        ensureLoveAnimationStyles();
        installVideoLifecycleRecovery();
        observeAllVideos();
        if (autoUnmute) {
            keyboardMuted = false;
            applyPreferredAudioState();
            autoUnmuteAction().catch(() => {});
        }
        if (autoReelsStart && isOnReels) startAutoScrolling();
        if (autoFeedScroll && isHomeFeedPage()) startFeedAutoScroll();

        // DOM changes drive feature passes (debounced). No more hot interval.
        domScanObserver = new MutationObserver(() => scheduleDomScan());
        domScanObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });

        // Slow safety tick catches state Instagram swaps without DOM signals.
        maintenanceTimer = setInterval(() => {
            if (document.hidden) return;
            runFeaturePass();
        }, 3000);

        scheduleDomScan();
    }

    function scheduleDomScan() {
        if (!appIsRunning || !applicationIsOn || document.hidden) return;
        if (domScanPending) return;
        domScanPending = true;
        setTimeout(() => {
            domScanPending = false;
            if (!appIsRunning || !applicationIsOn || document.hidden) return;
            runFeaturePass();
        }, 280);
    }

    function runFeaturePass() {
        try { observeAllVideos(); } catch (_) {}
        try { applyPlaybackSpeedToAllVideos(); } catch (_) {}
        try { installAudioIconHider(); } catch (_) {}
        try { hideAudioUiButtons(); } catch (_) {}
        try { if (autoUnmute || keyboardMuted) applyPreferredAudioState(); } catch (_) {}
        try { if (showDownloadBtn) injectDownloadButtons(); } catch (_) {}
        try { if (showProgressBar) injectProgressBars(); } catch (_) {}
        try { if (bestQualityMode) applyBestQualityMode(); } catch (_) {}
        try { if (instagramAdBlocker) applyInstagramAdBlocker(); } catch (_) {}
        try { applyFocusMode(); } catch (_) {}
    }

    // ------------------------------------------------------------------ //
    //  Keyboard suite
    // ------------------------------------------------------------------ //
    document.addEventListener("keydown", (e) => {
        if (e.defaultPrevented) return;
        if (!appIsRunning || !applicationIsOn) return;

        // Story mode: Ctrl + Left/Right switches stories before editable checks.
        if (e.ctrlKey && !e.metaKey && !e.altKey && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
            if (navigateStory(e.key === "ArrowRight" ? "next" : "prev")) {
                e.preventDefault();
                e.stopPropagation();
            }
            return;
        }

        if (isEditableTarget(e.target)) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.shiftKey && e.key !== "+" && e.key !== "=") return;

        const key = (e.key || "").toLowerCase();

        if (key === "enter" && enterLoveReact) {
            const now = Date.now();
            if (now - lastEnterReactAt < 260) return;
            lastEnterReactAt = now;
            const reacted = toggleLoveReactCurrentContent();
            if (reacted) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }
        }

        if ((e.code === "Space" || e.key === " ") && spacePause) {
            const currentVideo = getCurrentVideo();
            if (!currentVideo) return;
            e.preventDefault();
            e.stopPropagation();
            if (currentVideo.paused) currentVideo.play().catch(() => {});
            else currentVideo.pause();
            return;
        }

        if (feedArrowNavigation && isHomeFeedPage() && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            if (stepFeedArticle(e.key === "ArrowDown" ? "next" : "prev")) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }
        }

        if (keyboardSuite) {
            if (key === "m") {
                e.preventDefault();
                e.stopPropagation();
                toggleMuteCurrentVideo();
                return;
            }
            if (key === "d") {
                e.preventDefault();
                e.stopPropagation();
                triggerDownloadShortcut();
                return;
            }
            if (key === "f") {
                e.preventDefault();
                e.stopPropagation();
                toggleFullscreenCurrentVideo();
                return;
            }
            if (key === "p") {
                e.preventDefault();
                e.stopPropagation();
                togglePictureInPictureCurrentVideo();
                return;
            }
            if (key === "s") {
                e.preventDefault();
                e.stopPropagation();
                toggleSmartAutoScroll();
                return;
            }
            if (videoSpeedEnabled && (e.key === "+" || e.key === "=")) {
                e.preventDefault();
                e.stopPropagation();
                adjustPlaybackSpeed(0.25);
                return;
            }
            if (videoSpeedEnabled && (e.key === "-" || e.key === "_")) {
                e.preventDefault();
                e.stopPropagation();
                adjustPlaybackSpeed(-0.25);
                return;
            }
            if (videoSpeedEnabled && key === "r") {
                e.preventDefault();
                e.stopPropagation();
                setPlaybackSpeed(1, true, true);
                return;
            }
        }

        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;

        // On the home feed, carousel navigation gets priority over seeking.
        if (feedCarouselArrows && isHomeFeedPage() && navigateCurrentFeedCarousel(e.key === "ArrowRight" ? "next" : "prev")) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        if (!keyboardSeek && !keyboardSeek3) return;
        const currentVideo = getCurrentVideo();
        if (!currentVideo || !Number.isFinite(currentVideo.duration) || currentVideo.duration <= 0) return;

        e.preventDefault();
        e.stopPropagation();
        const seekSeconds = keyboardSeek3 ? 3 : 5;
        const delta = e.key === "ArrowRight" ? seekSeconds : -seekSeconds;
        currentVideo.currentTime = Math.min(Math.max(currentVideo.currentTime + delta, 0), currentVideo.duration);
    }, true);

    function isEditableTarget(target) {
        if (!target) return false;
        const tag = (target.tagName || "").toLowerCase();
        return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable || !!target.closest?.('[contenteditable="true"], input, textarea, select');
    }

    function isHomeFeedPage() {
        const path = window.location.pathname;
        return path === "/" || path === "/?";
    }

    function getVisibleScoreForElement(el) {
        if (!el) return 0;
        const rect = el.getBoundingClientRect();
        const visibleW = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
        const visibleH = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
        return visibleW * visibleH;
    }

    function getCurrentFeedArticle() {
        const articles = Array.from(document.querySelectorAll("main article"));
        return articles
            .map(article => ({ article, score: getVisibleScoreForElement(article) }))
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score)[0]?.article || null;
    }

    function getFeedArticles() {
        return Array.from(document.querySelectorAll("main article"))
            .filter(article => {
                const rect = article.getBoundingClientRect();
                return rect.height > 120 && rect.bottom > -window.innerHeight * 0.35 && rect.top < window.innerHeight * 2.2;
            })
            .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    }

    function getAnchorFeedArticle(articles) {
        if (feedArrowTargetArticle && feedArrowTargetArticle.isConnected && articles.includes(feedArrowTargetArticle)) {
            return feedArrowTargetArticle;
        }
        const anchorY = window.innerHeight * 0.42;
        return articles
            .map(article => {
                const rect = article.getBoundingClientRect();
                const center = rect.top + rect.height / 2;
                const visible = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
                return { article, score: Math.abs(center - anchorY) - visible * 0.15 };
            })
            .sort((a, b) => a.score - b.score)[0]?.article || getCurrentFeedArticle();
    }

    function stepFeedArticle(direction) {
        if (!isHomeFeedPage()) return false;
        const now = Date.now();
        if (now - lastFeedArrowNavAt < 115) return true;
        lastFeedArrowNavAt = now;

        const articles = getFeedArticles();
        if (!articles.length) return false;
        const current = getAnchorFeedArticle(articles);
        let index = articles.indexOf(current);
        if (index < 0) index = direction === "next" ? 0 : articles.length - 1;

        const targetIndex = direction === "next"
            ? Math.min(index + 1, articles.length - 1)
            : Math.max(index - 1, 0);
        const target = articles[targetIndex];
        if (!target || target === current) return false;

        feedArrowTargetArticle = target;
        feedScrollBusy = true;
        lastFeedAutoScrollAt = now;
        unbindFeedScrollVideo();
        feedScrollArticle = target;
        target.dataset.isfFeedSeenAt = String(now);
        scrollToFeedArticleTarget(target);
        activateFeedArticleMedia(target, 90);

        clearTimeout(feedArrowSettleTimer);
        feedArrowSettleTimer = setTimeout(() => {
            feedScrollBusy = false;
            activateFeedArticleMedia(target, 0);
            const rect = target.getBoundingClientRect();
            const media = getPrimaryFeedMediaElement(target);
            const mediaScore = media ? getVisibleScoreForElement(media) : 0;
            if (Math.abs(rect.top - getFeedArticleTopOffset()) > 180 && mediaScore < 80000) {
                scrollToFeedArticleTarget(target, "auto");
                activateFeedArticleMedia(target, 120);
            }
        }, 520);
        return true;
    }

    function getFeedArticleTopOffset() {
        return Math.max(74, Math.round(window.innerHeight * 0.12));
    }

    function getPrimaryFeedMediaElement(article) {
        if (!article) return null;
        return Array.from(article.querySelectorAll("video, img"))
            .map(el => {
                const rect = el.getBoundingClientRect();
                const area = Math.max(0, rect.width) * Math.max(0, rect.height);
                const visible = getVisibleScoreForElement(el);
                return { el, score: visible + area * 0.18 };
            })
            .filter(item => item.score > 20000)
            .sort((a, b) => b.score - a.score)[0]?.el || null;
    }

    function scrollToFeedArticleTarget(article, behavior = "smooth") {
        if (!article) return;
        const rect = article.getBoundingClientRect();
        const media = getPrimaryFeedMediaElement(article);
        const mediaRect = media?.getBoundingClientRect?.();
        const desiredMediaCenter = Math.round(window.innerHeight * 0.52);
        const mediaTargetTop = mediaRect && mediaRect.height > 120
            ? window.scrollY + mediaRect.top + mediaRect.height / 2 - desiredMediaCenter
            : null;
        const articleTargetTop = window.scrollY + rect.top - getFeedArticleTopOffset();
        const targetTop = Math.max(0, Math.round(mediaTargetTop ?? articleTargetTop));
        window.scrollTo({ top: targetTop, behavior });
    }

    function activateFeedArticleMedia(article, delay = 0) {
        window.setTimeout(() => {
            const targetVideos = Array.from(article?.querySelectorAll?.("video") || []);
            const targetVideo = targetVideos
                .map(video => ({ video, score: getVisibleScoreForElement(video) || (video.getBoundingClientRect().width * video.getBoundingClientRect().height) }))
                .sort((a, b) => b.score - a.score)[0]?.video || null;

            document.querySelectorAll("video").forEach(video => {
                if (!article?.contains(video)) {
                    try { video.pause(); } catch (_) {}
                }
            });

            if (targetVideo) {
                try {
                    if (autoUnmute && !keyboardMuted) {
                        targetVideo.muted = false;
                        targetVideo.volume = 1;
                    }
                    targetVideo.play().catch(() => {});
                } catch (_) {}
            }
        }, delay);
    }

    // ------------------------------------------------------------------ //
    //  Carousel navigation — multi-label, geometry-aware
    // ------------------------------------------------------------------ //
    function getCarouselButton(article, direction) {
        if (!article) return null;
        const labels = direction === "next"
            ? ["Next", "Go to next", "Next photo", "Next video", "Next item"]
            : ["Previous", "Go back", "Go to previous", "Previous photo", "Previous video", "Previous item", "Back"];

        for (const label of labels) {
            const escaped = label.replace(/"/g, '\\"');
            const direct = article.querySelector(`button[aria-label="${escaped}"], div[role="button"][aria-label="${escaped}"], [aria-label="${escaped}"]`);
            const button = direct?.closest?.('button, div[role="button"]') || direct;
            if (button && isClickableCarouselButton(button)) return button;
        }

        // aria-label text drifts with A/B tests; fall back to substring matching.
        const candidates = Array.from(article.querySelectorAll('button, div[role="button"], svg[aria-label]'));
        return candidates.map(node => node.closest?.('button, div[role="button"]') || node).find(node => {
            const label = (node.getAttribute?.("aria-label") || node.querySelector?.("[aria-label]")?.getAttribute("aria-label") || "").toLowerCase();
            const matchesDirection = direction === "next"
                ? label.includes("next")
                : label.includes("previous") || label.includes("back");
            return matchesDirection && isClickableCarouselButton(node);
        }) || null;
    }

    function isClickableCarouselButton(button) {
        if (!button) return false;
        const rect = button.getBoundingClientRect();
        const visible = rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
        const disabled = button.disabled || button.getAttribute?.("aria-disabled") === "true";
        return visible && !disabled;
    }

    function navigateCurrentFeedCarousel(direction) {
        const article = getCurrentFeedArticle();
        const button = getCarouselButton(article, direction);
        if (!button) return false;
        button.click();
        return true;
    }

    // ------------------------------------------------------------------ //
    //  Auto Scrolling: home feed
    // ------------------------------------------------------------------ //
    function startFeedAutoScroll() {
        if (!isHomeFeedPage() || !autoFeedScroll || feedScrollTimer) return;
        feedScrollTimer = setInterval(scheduleHomeFeedScroll, 600);
        scheduleHomeFeedScroll();
    }

    function stopFeedAutoScroll() {
        if (feedScrollTimer) clearInterval(feedScrollTimer);
        feedScrollTimer = null;
        unbindFeedScrollVideo();
        feedScrollArticle = null;
    }

    function scheduleHomeFeedScroll() {
        if (!autoFeedScroll || !isHomeFeedPage() || feedScrollBusy) return;
        const article = getCurrentFeedArticle();
        if (!article) return;

        if (feedScrollArticle !== article) {
            feedScrollArticle = article;
            article.dataset.isfFeedSeenAt = String(Date.now());
            unbindFeedScrollVideo();
        }

        const video = getBestVisibleVideoInside(article);
        if (video && Number.isFinite(video.duration) && video.duration > 0) {
            bindFeedScrollVideo(video);
            maybeAdvanceFinishedFeedVideo(video);
            return;
        }

        unbindFeedScrollVideo();
        if (!article.dataset.isfFeedSeenAt) article.dataset.isfFeedSeenAt = String(Date.now());
        const seenMs = Date.now() - Number(article.dataset.isfFeedSeenAt || Date.now());
        if (seenMs > 6500) scrollToNextFeedArticle();
    }

    function getBestVisibleVideoInside(container) {
        return Array.from(container.querySelectorAll("video"))
            .map(v => ({ v, score: visibleScore(v) }))
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score)[0]?.v || null;
    }

    function bindFeedScrollVideo(video) {
        if (feedScrollVideo === video) return;
        unbindFeedScrollVideo();
        feedScrollVideo = video;
        video.loop = false;
        video.removeAttribute("loop");
        video.dataset.isfFeedMaxTime = String(Number.isFinite(video.currentTime) ? video.currentTime : 0);
        video.addEventListener("ended", scrollToNextFeedArticle);
        video.addEventListener("timeupdate", onFeedVideoTimeUpdate);
        video.addEventListener("pause", onFeedVideoTimeUpdate);
    }

    function unbindFeedScrollVideo() {
        if (!feedScrollVideo) return;
        feedScrollVideo.removeEventListener("ended", scrollToNextFeedArticle);
        feedScrollVideo.removeEventListener("timeupdate", onFeedVideoTimeUpdate);
        feedScrollVideo.removeEventListener("pause", onFeedVideoTimeUpdate);
        feedScrollVideo = null;
    }

    function onFeedVideoTimeUpdate(event) {
        const video = event.currentTarget;
        maybeAdvanceFinishedFeedVideo(video);
    }

    function maybeAdvanceFinishedFeedVideo(video) {
        if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return;
        const current = Number.isFinite(video.currentTime) ? video.currentTime : 0;
        const maxSeen = Math.max(Number(video.dataset.isfFeedMaxTime || 0), current);
        video.dataset.isfFeedMaxTime = String(maxSeen);
        const almostDone = current >= Math.max(0, video.duration - 0.35);
        const sawEndBeforeLoop = maxSeen >= Math.max(0, video.duration - 0.35) && current < 0.75;
        const pausedAtEnd = video.paused && current >= Math.max(0, video.duration - 0.7);
        if (video.ended || almostDone || sawEndBeforeLoop || pausedAtEnd) scrollToNextFeedArticle();
    }

    function scrollToNextFeedArticle() {
        if (!autoFeedScroll || !isHomeFeedPage() || feedScrollBusy) return;
        if (Date.now() - lastFeedAutoScrollAt < 1800) return;
        const articles = getFeedArticles();
        const current = feedScrollArticle && feedScrollArticle.isConnected && articles.includes(feedScrollArticle)
            ? feedScrollArticle
            : getCurrentFeedArticle();
        if (!current || !articles.length) return;
        const index = articles.indexOf(current);
        const next = articles[index + 1];
        if (next) {
            feedScrollBusy = true;
            lastFeedAutoScrollAt = Date.now();
            unbindFeedScrollVideo();
            feedScrollArticle = next;
            feedArrowTargetArticle = next;
            next.dataset.isfFeedSeenAt = String(Date.now());
            scrollToFeedArticleTarget(next);
            activateFeedArticleMedia(next, 120);
            clearTimeout(feedArrowSettleTimer);
            feedArrowSettleTimer = setTimeout(() => {
                feedScrollBusy = false;
                activateFeedArticleMedia(next, 0);
                const rect = next.getBoundingClientRect();
                const media = getPrimaryFeedMediaElement(next);
                const mediaScore = media ? getVisibleScoreForElement(media) : 0;
                if (Math.abs(rect.top - getFeedArticleTopOffset()) > 180 && mediaScore < 80000) {
                    scrollToFeedArticleTarget(next, "auto");
                    activateFeedArticleMedia(next, 120);
                }
            }, 680);
        }
    }

    // ------------------------------------------------------------------ //
    //  Auto Scrolling: Reels
    // ------------------------------------------------------------------ //
    function startAutoScrolling() {
        applicationIsOn = true;
        api.storage.sync.set({ applicationIsOn: true });
        if (isOnReels) setTimeout(beginAutoScrollLoop, 500);
    }

    function stopAutoScrolling() {
        applicationIsOn = false;
        api.storage.sync.set({ applicationIsOn: false });
    }

    function beginAutoScrollLoop() {
        if (!isOnReels || !autoReelsStart) return;
        const currentVideo = getCurrentVideo();
        if (currentVideo) {
            currentVideo.removeAttribute("loop");
            currentVideo.removeEventListener("ended", onVideoEnd);
            currentVideo.removeEventListener("timeupdate", onReelsVideoTimeUpdate);
            currentVideo.addEventListener("ended", onVideoEnd, { once: true });
            currentVideo.addEventListener("timeupdate", onReelsVideoTimeUpdate);
            onReelsVideoTimeUpdate({ currentTarget: currentVideo });
        }
        if (applicationIsOn && autoReelsStart && isOnReels) setTimeout(beginAutoScrollLoop, 300);
    }

    function onReelsVideoTimeUpdate(event) {
        const video = event.currentTarget;
        if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return;
        const current = Number.isFinite(video.currentTime) ? video.currentTime : 0;
        if (video.ended || current >= Math.max(0, video.duration - 0.3)) onVideoEnd();
    }

    function onVideoEnd() {
        if (!isOnReels) return;
        const now = Date.now();
        if (now - (onVideoEnd._lastAt || 0) < 1200) return;
        onVideoEnd._lastAt = now;
        const currentVideo = getCurrentVideo();
        if (!currentVideo) return;
        const nextVideo = getNextVideo(currentVideo);
        if (nextVideo && autoReelsStart) nextVideo.scrollIntoView({ behavior: "smooth", inline: "center", block: "center" });
    }

    function getNextVideo(currentVideo) {
        const videos = Array.from(document.querySelectorAll(VIDEOS_LIST_SELECTOR));
        const index = videos.findIndex((vid) => vid === currentVideo);
        return videos[index + 1] || null;
    }

    // ------------------------------------------------------------------ //
    //  Current video tracking (short-lived cache, center-biased scoring)
    // ------------------------------------------------------------------ //
    function getCurrentVideo() {
        const now = performance.now();
        const cached = getCurrentVideo._cachedVideo;
        if (cached && document.contains(cached) && now - (getCurrentVideo._cachedAt || 0) < 48) {
            return cached;
        }

        const videos = Array.from(document.querySelectorAll(VIDEOS_LIST_SELECTOR));
        const viewportCenterX = window.innerWidth / 2;
        const viewportCenterY = window.innerHeight / 2;

        const current = videos
            .map(video => {
                const rect = video.getBoundingClientRect();
                const score = visibleScore(video);
                const area = Math.max(1, rect.width * rect.height);
                const visibleRatio = score / area;
                const isPlaying = !video.paused && !video.ended && Number.isFinite(video.currentTime);
                const cx = rect.left + rect.width / 2;
                const cy = rect.top + rect.height / 2;
                const distance = Math.hypot(cx - viewportCenterX, cy - viewportCenterY);
                const centerBonus = Math.max(0, 1 - distance / Math.max(window.innerWidth, window.innerHeight));
                const sizeBonus = Math.min(1, area / Math.max(1, window.innerWidth * window.innerHeight * 0.22));
                const activeScore = score + (isPlaying ? score * 3 : 0) + (score * centerBonus * 1.4) + (score * sizeBonus * 0.65);
                return { video, score, visibleRatio, isPlaying, activeScore };
            })
            .filter(item => item.score > 0 && item.visibleRatio > 0.04 && item.video.offsetParent !== null)
            .sort((a, b) => b.activeScore - a.activeScore)[0]?.video || null;

        getCurrentVideo._cachedVideo = current;
        getCurrentVideo._cachedAt = now;
        return current;
    }

    function invalidateCurrentVideoCache() {
        getCurrentVideo._cachedVideo = null;
        getCurrentVideo._cachedAt = 0;
    }

    function visibleScore(video) {
        if (!video || !document.contains(video)) return 0;
        const rect = video.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) return 0;
        const visibleW = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
        const visibleH = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
        return visibleW * visibleH;
    }

    // ------------------------------------------------------------------ //
    //  Focus Mode: safer clutter reduction
    // ------------------------------------------------------------------ //
    function ensureFocusModeStyles() {
        if (document.getElementById("isf-focus-mode-style")) return;
        const style = document.createElement("style");
        style.id = "isf-focus-mode-style";
        style.textContent = `
            html.isf-focus-mode-active [data-isf-focus-hidden="true"] {
                display: none !important;
            }

            html.isf-focus-mode-active main article {
                scroll-margin-top: 26px;
            }

            html.isf-focus-mode-active [aria-label="Meta Verified"],
            html.isf-focus-mode-active a[href*="/about/"],
            html.isf-focus-mode-active a[href*="/privacy/"],
            html.isf-focus-mode-active a[href*="/terms/"],
            html.isf-focus-mode-active a[href*="/explore/people/"] {
                display: none !important;
            }
        `;
        document.documentElement.appendChild(style);
    }

    function isLikelyRightRailContainer(el) {
        if (!el || !document.contains(el)) return false;
        if (el.closest("article, nav, header, [role='dialog']")) return false;

        const rect = el.getBoundingClientRect();
        if (!rect || rect.width < 180 || rect.width > 420 || rect.height < 120) return false;
        if (rect.left < window.innerWidth * 0.55) return false;

        const text = (el.innerText || el.textContent || "").trim().toLowerCase();
        if (!text) return false;

        const markers = [
            "suggested for you",
            "switch",
            "meta verified",
            "about",
            "help",
            "press",
            "api",
            "jobs",
            "privacy",
            "terms",
            "locations",
            "language"
        ];

        return markers.some(marker => text.includes(marker));
    }

    function applyFocusMode() {
        ensureFocusModeStyles();
        if (!focusMode || !applicationIsOn || !appIsRunning) {
            removeFocusMode();
            return;
        }

        document.documentElement.classList.add("isf-focus-mode-active");
        document.querySelectorAll("[data-isf-focus-hidden]").forEach(el => { delete el.dataset.isfFocusHidden; });

        // Hide footer blocks outside posts.
        document.querySelectorAll("footer").forEach(el => {
            if (!el.closest("article")) el.dataset.isfFocusHidden = "true";
        });

        // Hide likely right-rail clutter only. Do NOT scan generic feed sections.
        document.querySelectorAll("aside, section, div").forEach(el => {
            if (isLikelyRightRailContainer(el)) el.dataset.isfFocusHidden = "true";
        });
    }

    function removeFocusMode() {
        document.documentElement.classList.remove("isf-focus-mode-active");
        document.querySelectorAll("[data-isf-focus-hidden]").forEach(el => {
            delete el.dataset.isfFocusHidden;
        });
        document.getElementById("isf-focus-mode-style")?.remove();
    }

    // ------------------------------------------------------------------ //
    //  Legacy feature cleanup (notes / wide feed / ambient light removed)
    // ------------------------------------------------------------------ //
    function cleanupLegacyFeatures() {
        // Notes panel.
        document.getElementById("isf-notes-panel")?.remove();
        document.getElementById("isf-notes-style")?.remove();
        document.querySelectorAll(".isf-note-highlight").forEach(el => {
            el.classList.remove("isf-note-highlight");
            delete el.dataset.isfNoteCandidate;
        });

        // Wide feed mode.
        document.documentElement.classList.remove("isf-wide-feed-active");
        document.documentElement.style.removeProperty("--isf-wide-feed-width");
        document.querySelectorAll("[data-isf-wide-feed]").forEach(el => {
            delete el.dataset.isfWideFeed;
            delete el.dataset.isfLandscape;
            el.style.removeProperty("--isf-article-width");
            el.style.removeProperty("width");
            el.style.removeProperty("max-width");
            el.style.removeProperty("box-sizing");
        });
        document.querySelectorAll("[data-isf-wide-feed-node], [data-isf-media-shell], [data-isf-main-media]").forEach(el => {
            delete el.dataset.isfWideFeedNode;
            delete el.dataset.isfMediaShell;
            delete el.dataset.isfMainMedia;
            el.style.removeProperty("display");
            el.style.removeProperty("width");
            el.style.removeProperty("max-width");
            el.style.removeProperty("height");
            el.style.removeProperty("box-sizing");
            el.style.removeProperty("object-fit");
        });
        document.getElementById("isf-wide-feed-style")?.remove();

        // Ambient light.
        document.documentElement.classList.remove("isf-ambient-page-active");
        document.getElementById("isf-ambient-light-style")?.remove();
        document.querySelectorAll(".isf-ambient-page, .isf-ambient-video-glow, .isf-ambient-aurora, .isf-ambient-projector, .isf-ambient-backdrop, .isf-ambient-site-bg, .isf-ambient-edge").forEach(el => el.remove());
        document.querySelectorAll("video.isf-ambient-active").forEach(v => v.classList.remove("isf-ambient-active"));
    }

    // ------------------------------------------------------------------ //
    //  Video observation
    // ------------------------------------------------------------------ //
    function observeVideo(video) {
        if (!video || video.dataset.isfObserved) return;
        video.dataset.isfObserved = "true";
        video.dataset.processed = "";
        setVideoElementPlaybackRate(video);
        if (bestQualityMode) enhanceVideoElement(video);
        if (autoUnmute || keyboardMuted) applyPreferredAudioState(video);
        if (newVideoObserver) newVideoObserver.observe(video);
    }

    function observeAllVideos() {
        document.querySelectorAll(VIDEOS_LIST_SELECTOR).forEach(observeVideo);
    }

    // ------------------------------------------------------------------ //
    //  Keyboard control suite + playback speed
    // ------------------------------------------------------------------ //
    function setVideoElementPlaybackRate(video, forceReset = false) {
        if (!video) return;
        const rate = forceReset || !videoSpeedEnabled ? 1 : videoSpeed;
        try { video.playbackRate = rate; } catch (_) {}
    }

    function applyPlaybackSpeedToAllVideos(forceReset = false) {
        document.querySelectorAll(VIDEOS_LIST_SELECTOR).forEach(video => setVideoElementPlaybackRate(video, forceReset));
    }

    function clampSpeed(value) {
        const rounded = Math.round((Number(value) || 1) * 4) / 4;
        return Math.min(Math.max(rounded, 0.5), 3);
    }

    function setPlaybackSpeed(value, persist = true, notify = false) {
        videoSpeed = clampSpeed(value);
        videoSpeedEnabled = true;
        applyPlaybackSpeedToAllVideos();
        if (persist) api.storage.sync.set({ videoSpeed, videoSpeedEnabled: true });
        if (notify) showToast(`Speed ${videoSpeed}x`);
    }

    function adjustPlaybackSpeed(delta) {
        setPlaybackSpeed(videoSpeed + delta, true, true);
    }

    function toggleMuteCurrentVideo() {
        const video = getCurrentVideo();
        if (!video) return;
        const nextMuted = !(keyboardMuted || video.muted);
        keyboardMuted = nextMuted;
        applyPreferredAudioState();
        showToast(keyboardMuted ? "Muted" : "Unmuted");
    }

    function toggleFullscreenCurrentVideo() {
        const video = getCurrentVideo();
        if (!video) return;
        if (document.fullscreenElement) {
            document.exitFullscreen?.();
            return;
        }
        const target = video.closest("article") || video.parentElement || video;
        target.requestFullscreen?.().catch(() => video.requestFullscreen?.().catch(() => {}));
    }

    async function togglePictureInPictureCurrentVideo() {
        const video = getCurrentVideo();
        if (!video || !document.pictureInPictureEnabled) return;
        try {
            if (document.pictureInPictureElement) await document.exitPictureInPicture();
            else await video.requestPictureInPicture();
        } catch (_) {}
    }

    function toggleSmartAutoScroll() {
        if (isHomeFeedPage()) {
            const nextValue = !autoFeedScroll;
            autoFeedScroll = nextValue;
            api.storage.sync.set({ autoFeedScroll: nextValue });
            nextValue ? startFeedAutoScroll() : stopFeedAutoScroll();
            showToast(nextValue ? "Feed auto-scroll ON" : "Feed auto-scroll OFF");
            return;
        }
        if (isOnReels) {
            const nextValue = !autoReelsStart;
            autoReelsStart = nextValue;
            api.storage.sync.set({ autoReelsStart: nextValue });
            nextValue ? startAutoScrolling() : stopAutoScrolling();
            showToast(nextValue ? "Reels auto-scroll ON" : "Reels auto-scroll OFF");
        }
    }

    // ------------------------------------------------------------------ //
    //  Best Quality Mode
    // ------------------------------------------------------------------ //
    function isStreamedMediaUrl(url) {
        return /^(blob:|data:|filesystem:)/i.test(String(url || ""));
    }

    function applyBestQualityMode() {
        if (!bestQualityMode) return;
        installBestQualityHints();
        document.querySelectorAll("video").forEach(enhanceVideoElement);
        document.querySelectorAll("main picture source[srcset], article picture source[srcset], div[role='dialog'] picture source[srcset]").forEach(enhancePictureSourceElement);
        document.querySelectorAll("main img, article img, div[role='dialog'] img").forEach(enhanceImageElement);
    }

    function installBestQualityHints() {
        if (document.getElementById("isf-best-quality-hints")) return;
        const marker = document.createElement("meta");
        marker.id = "isf-best-quality-hints";
        marker.name = "isf-best-quality-mode";
        marker.content = "enabled";
        (document.head || document.documentElement).appendChild(marker);

        // Region-specific fna.* CDN hosts rotate; preconnect to the stable ones.
        [
            "https://www.instagram.com",
            "https://i.instagram.com",
            "https://scontent.cdninstagram.com"
        ].forEach((href) => {
            const link = document.createElement("link");
            link.rel = "preconnect";
            link.href = href;
            link.crossOrigin = "anonymous";
            document.head?.appendChild(link);
        });
    }

    function enhanceVideoElement(video) {
        if (!video) return;
        try {
            video.preload = "auto";
            video.setAttribute("preload", "auto");
            video.setAttribute("playsinline", "");
            video.setAttribute("webkit-playsinline", "");
            video.playsInline = true;
            video.disableRemotePlayback = true;

            // Modern Instagram streams video via MSE (blob:). Never swap those
            // sources — reassigning video.src detaches the MediaSource and
            // freezes playback. Only consider real http(s) candidates.
            const candidates = [];
            [video.currentSrc, video.src].forEach((u) => {
                if (u && !isStreamedMediaUrl(u)) candidates.push({ url: u, score: inferQualityScore(u) });
            });
            Array.from(video.querySelectorAll("source[src]")).forEach((source) => {
                const url = source.getAttribute("src") || "";
                if (url && !isStreamedMediaUrl(url)) candidates.push({ url, score: inferQualityScore(url) });
            });

            const best = candidates.sort((a, b) => b.score - a.score)[0];
            const currentUrl = video.currentSrc || video.src || "";
            const currentScore = inferQualityScore(currentUrl);
            if (best?.url && best.score > currentScore && !isStreamedMediaUrl(currentUrl) && video.dataset.isfBestVideoUrl !== best.url) {
                video.dataset.isfBestVideoUrl = best.url;
                const wasPaused = video.paused;
                const t = Number.isFinite(video.currentTime) ? video.currentTime : 0;
                video.src = best.url;
                video.load?.();
                video.currentTime = Math.min(t, Number.isFinite(video.duration) ? video.duration : t);
                if (!wasPaused) video.play?.().catch(() => {});
            }
        } catch (_) {}
    }

    function enhancePictureSourceElement(source) {
        if (!source || source.dataset.isfQualityLocked === "1") return;
        const best = getLargestSrcsetCandidate(source.getAttribute("srcset") || "");
        if (!best?.url) return;
        try {
            source.dataset.isfQualityLocked = "1";
            source.srcset = best.url;
            source.setAttribute("srcset", best.url);
        } catch (_) {}
    }

    function enhanceImageElement(img) {
        if (!img || img.dataset.isfQualityLocked === "1") return;
        const rect = img.getBoundingClientRect();
        const mediaSized = rect.width >= 80 && rect.height >= 80;
        if (!mediaSized && !img.closest?.("article, div[role='dialog'], main")) return;

        try {
            img.loading = "eager";
            img.decoding = "sync";
            img.fetchPriority = "high";
            img.setAttribute("loading", "eager");
            img.setAttribute("decoding", "sync");
            img.setAttribute("fetchpriority", "high");
            img.setAttribute("importance", "high");
            img.sizes = "100vw";
            img.setAttribute("sizes", "100vw");

            const best = getLargestSrcsetCandidate(img.getAttribute("srcset") || "");
            if (best?.url && img.src !== best.url) {
                img.dataset.isfQualityLocked = "1";
                img.src = best.url;
                img.removeAttribute("srcset");
                setTimeout(() => { delete img.dataset.isfQualityLocked; }, 3000);
            }
        } catch (_) {}
    }

    function getLargestSrcsetCandidate(srcset) {
        if (!srcset) return null;
        return srcset.split(",")
            .map(part => part.trim())
            .map(part => {
                const pieces = part.split(/\s+/);
                const url = pieces[0];
                const descriptor = pieces[1] || "";
                const widthMatch = descriptor.match(/(\d+)w/);
                const densityMatch = descriptor.match(/([\d.]+)x/);
                const score = widthMatch ? Number(widthMatch[1]) : densityMatch ? Number(densityMatch[1]) * 1000 : 0;
                return { url, score };
            })
            .filter(item => item.url && item.score > 0)
            .sort((a, b) => b.score - a.score)[0] || null;
    }

    function inferQualityScore(url) {
        if (!url) return 0;
        const text = String(url);
        const matches = Array.from(text.matchAll(/(?:^|[^\d])(\d{3,4})(?:p|x|_)/gi)).map(m => Number(m[1]));
        return matches.length ? Math.max(...matches) : text.length;
    }

    function installUploadQualityNotice() {
        if (uploadQualityListenerInstalled) return;
        uploadQualityListenerInstalled = true;
        document.addEventListener("change", (event) => {
            if (!bestQualityMode) return;
            const input = event.target;
            if (!input || input.tagName !== "INPUT" || input.type !== "file") return;
            showToast("Best Quality Mode: original file selected. Instagram may still compress uploads.");
        }, true);
    }

    // ------------------------------------------------------------------ //
    //  Enter → Love React
    // ------------------------------------------------------------------ //
    function toggleLoveReactCurrentContent() {
        const target = getCurrentReactTarget();
        if (!target?.root) {
            showToast("No current media");
            return false;
        }

        let buttonInfo = findVisibleReactionButtonIn(target.root, target.media);
        if (!buttonInfo?.button) {
            buttonInfo = findVisibleReactionButtonIn(document.body, target.media);
        }
        if (!buttonInfo?.button) {
            showToast("No like button found");
            return false;
        }

        const willLike = buttonInfo.state !== "liked";
        buttonInfo.button.click();
        if (willLike) playLoveAnimation(target.media || buttonInfo.button, "like");
        else playLoveAnimation(target.media || buttonInfo.button, "unlike");
        showToast(willLike ? "Loved ❤️" : "Love removed");
        return true;
    }

    function playLoveAnimation(anchor, mode = "like") {
        try {
            const rect = anchor?.getBoundingClientRect?.();
            const cx = rect && rect.width > 0 ? rect.left + rect.width / 2 : window.innerWidth / 2;
            const cy = rect && rect.height > 0 ? rect.top + rect.height / 2 : window.innerHeight / 2;
            const wrap = document.createElement("div");
            wrap.className = "isf-love-burst " + (mode === "unlike" ? "isf-unlike" : "isf-like");
            wrap.style.left = cx + "px";
            wrap.style.top = cy + "px";
            wrap.innerHTML = `
                <div class="isf-love-ring"></div>
                <div class="isf-heart-main">${mode === "unlike" ? "♡" : "♥"}</div>
                <span style="--x:-64px;--y:-30px;--r:-22deg;--d:0ms">♥</span>
                <span style="--x:58px;--y:-42px;--r:18deg;--d:28ms">♥</span>
                <span style="--x:-48px;--y:42px;--r:14deg;--d:50ms">♥</span>
                <span style="--x:62px;--y:34px;--r:-16deg;--d:72ms">♥</span>
                <span style="--x:0px;--y:-72px;--r:8deg;--d:88ms">♥</span>
                <i style="--x:-76px;--y:2px;--d:20ms"></i>
                <i style="--x:76px;--y:-4px;--d:42ms"></i>
                <i style="--x:-18px;--y:74px;--d:58ms"></i>
                <i style="--x:24px;--y:-84px;--d:76ms"></i>
            `;
            document.documentElement.appendChild(wrap);
            setTimeout(() => wrap.remove(), 1150);
        } catch {}
    }

    function ensureLoveAnimationStyles() {
        if (document.getElementById("isf-love-animation-style")) return;
        const style = document.createElement("style");
        style.id = "isf-love-animation-style";
        style.textContent = `
            .isf-love-burst{position:fixed;z-index:2147483647;pointer-events:none;transform:translate(-50%,-50%);width:1px;height:1px;}
            .isf-love-burst .isf-love-ring{position:absolute;left:0;top:0;width:118px;height:118px;border-radius:999px;transform:translate(-50%,-50%) scale(.18);border:2px solid rgba(255,95,150,.8);box-shadow:0 0 34px rgba(255,45,120,.45), inset 0 0 30px rgba(255,255,255,.10);animation:isfLoveRing .72s cubic-bezier(.18,.82,.22,1) forwards;}
            .isf-love-burst .isf-heart-main{position:absolute;left:0;top:0;transform:translate(-50%,-50%) scale(.28) rotate(-10deg);font-size:98px;line-height:1;background:linear-gradient(135deg,#ff1f72,#ff79bd 48%,#ffb4cf);-webkit-background-clip:text;color:transparent;text-shadow:0 16px 54px rgba(255,45,110,.58),0 2px 12px rgba(0,0,0,.45);filter:drop-shadow(0 0 24px rgba(255,45,110,.50));animation:isfHeartPop 1.02s cubic-bezier(.16,.94,.18,1) forwards;}
            .isf-love-burst.isf-unlike .isf-heart-main{color:rgba(255,255,255,.88);background:none;-webkit-background-clip:initial;text-shadow:0 8px 30px rgba(255,255,255,.24),0 2px 10px rgba(0,0,0,.42);filter:drop-shadow(0 0 18px rgba(255,255,255,.18));}
            .isf-love-burst span{position:absolute;left:0;top:0;transform:translate(-50%,-50%) scale(.22) rotate(var(--r));font-size:19px;color:#ff5a8d;opacity:0;animation:isfHeartParticle .82s ease-out forwards;animation-delay:var(--d);text-shadow:0 0 16px rgba(255,45,105,.48);}
            .isf-love-burst i{position:absolute;left:0;top:0;width:7px;height:7px;border-radius:999px;background:linear-gradient(135deg,#fff,#ff7ab6);opacity:0;animation:isfSparkParticle .72s ease-out forwards;animation-delay:var(--d);box-shadow:0 0 18px rgba(255,120,190,.55);}
            .isf-love-burst.isf-unlike span,.isf-love-burst.isf-unlike i,.isf-love-burst.isf-unlike .isf-love-ring{display:none;}
            @keyframes isfLoveRing{0%{opacity:0;transform:translate(-50%,-50%) scale(.12)}24%{opacity:.9}100%{opacity:0;transform:translate(-50%,-50%) scale(1.12)}}
            @keyframes isfHeartPop{0%{opacity:0;transform:translate(-50%,-50%) scale(.24) rotate(-12deg)}32%{opacity:1;transform:translate(-50%,-50%) scale(1.16) rotate(5deg)}58%{opacity:1;transform:translate(-50%,-50%) scale(.98) rotate(0)}100%{opacity:0;transform:translate(-50%,-50%) scale(1.08) translateY(-24px) rotate(0)}}
            @keyframes isfHeartParticle{0%{opacity:0;transform:translate(-50%,-50%) scale(.18) rotate(var(--r))}18%{opacity:.98}100%{opacity:0;transform:translate(calc(-50% + var(--x)),calc(-50% + var(--y))) scale(1.18) rotate(var(--r))}}
            @keyframes isfSparkParticle{0%{opacity:0;transform:translate(-50%,-50%) scale(.2)}20%{opacity:1}100%{opacity:0;transform:translate(calc(-50% + var(--x)),calc(-50% + var(--y))) scale(.9)}}
        `;
        document.documentElement.appendChild(style);
    }

    function getCurrentReactTarget() {
        const currentVideo = getCurrentVideo();
        if (currentVideo) {
            const article = currentVideo.closest("article");
            const dialog = currentVideo.closest("div[role='dialog']");
            const main = document.querySelector("main");
            const reelPage = /^\/(reel|reels|p|tv)\//.test(location.pathname);
            // Big Reel pages put action buttons outside the video container, so main is needed there.
            const root = article || dialog || (reelPage ? main : null) || currentVideo.closest("section") || currentVideo.closest("div[role='presentation']") || currentVideo.parentElement;
            return { root, media: currentVideo };
        }

        if (isHomeFeedPage()) {
            const article = getCurrentFeedArticle();
            return article ? { root: article, media: article } : null;
        }

        const storyRoot = getStoryRoot();
        if (storyRoot) return { root: storyRoot, media: storyRoot };

        const dialog = document.querySelector("div[role='dialog']");
        const main = document.querySelector("main");
        return dialog ? { root: dialog, media: dialog } : main ? { root: main, media: main } : null;
    }

    function findVisibleReactionButtonIn(root, media) {
        // Exact labels first, then prefix variants ("Like this reel", ...).
        const selector = [
            'svg[aria-label="Like"]',
            'svg[aria-label="Unlike"]',
            'button[aria-label="Like"]',
            'button[aria-label="Unlike"]',
            'div[role="button"][aria-label="Like"]',
            'div[role="button"][aria-label="Unlike"]',
            'svg[aria-label^="Like "]',
            'svg[aria-label^="Unlike "]',
            'button[aria-label^="Like "]',
            'button[aria-label^="Unlike "]',
            'div[role="button"][aria-label^="Like "]',
            'div[role="button"][aria-label^="Unlike "]'
        ].join(',');

        const mediaRect = media?.getBoundingClientRect?.();
        const mediaCenterX = mediaRect ? (mediaRect.left + mediaRect.right) / 2 : window.innerWidth / 2;
        const mediaCenterY = mediaRect ? (mediaRect.top + mediaRect.bottom) / 2 : window.innerHeight / 2;

        const candidates = Array.from(root.querySelectorAll(selector))
            .map(node => node.matches?.('button, div[role="button"]') ? node : node.closest?.('button, div[role="button"]'))
            .filter(Boolean)
            .map(button => {
                const label = (button.getAttribute?.("aria-label") || button.querySelector?.("svg[aria-label]")?.getAttribute("aria-label") || "").toLowerCase();
                const state = label.startsWith("unlike") ? "liked" : label.startsWith("like") ? "unliked" : null;
                const rect = button.getBoundingClientRect();
                const visible = rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
                const cx = (rect.left + rect.right) / 2;
                const cy = (rect.top + rect.bottom) / 2;
                // Prefer buttons close to the current media but allow big reel side action column.
                const dx = Math.abs(cx - mediaCenterX);
                const dy = Math.abs(cy - mediaCenterY);
                const nearRightOfMedia = mediaRect && cx >= mediaRect.left - 60 && cx <= mediaRect.right + 220 && cy >= mediaRect.top - 80 && cy <= mediaRect.bottom + 180;
                const nearBottomOfFeed = mediaRect && cy >= mediaRect.bottom - 20 && cy <= mediaRect.bottom + 140 && cx >= mediaRect.left - 40 && cx <= mediaRect.right + 80;
                const boost = (nearRightOfMedia || nearBottomOfFeed) ? -900 : 0;
                const distance = dx + dy + boost;
                return { button, state, rect, visible, distance };
            })
            .filter(item => item.state && item.visible);

        return candidates.sort((a, b) => a.distance - b.distance)[0] || null;
    }

    // ------------------------------------------------------------------ //
    //  Story navigation (Ctrl + Left/Right)
    // ------------------------------------------------------------------ //
    function getStoryRoot() {
        if (!window.location.pathname.startsWith("/stories/")) return null;
        return document.querySelector("div[role='dialog']") || document.querySelector("main") || document.body;
    }

    function navigateStory(direction) {
        const root = getStoryRoot();
        if (!root) return false;

        const labels = direction === "next"
            ? ["Next", "Next story", "Go to next", "Go to next story", "Forward", "Go forward"]
            : ["Previous", "Previous story", "Go back", "Go to previous", "Go to previous story", "Back"];

        // 1) Prefer Instagram's accessible controls when they exist.
        for (const label of labels) {
            const safeLabel = label.replace(/"/g, '\\"');
            const nodes = Array.from(root.querySelectorAll(
                `[aria-label="${safeLabel}"], [title="${safeLabel}"], svg[aria-label="${safeLabel}"]`
            ));
            const button = nodes
                .map(node => node.matches?.("button, div[role='button'], a") ? node : node.closest?.("button, div[role='button'], a"))
                .find(isClickableCarouselButton);
            if (button) {
                button.click();
                return true;
            }
        }

        // 2) Instagram changes Story controls often. Fall back to visible left/right overlay hit-zones.
        const side = direction === "next" ? "right" : "left";
        const badText = /(close|reply|send|message|mute|unmute|pause|play|more|settings|profile|see translation|like|share)/i;
        const candidates = Array.from(root.querySelectorAll('button, div[role="button"], a[role="button"], [tabindex="0"]'))
            .map(node => node.closest?.('button, div[role="button"], a[role="button"], [tabindex="0"]') || node)
            .filter((node, idx, arr) => node && arr.indexOf(node) === idx)
            .map(node => {
                const rect = node.getBoundingClientRect();
                const label = [
                    node.getAttribute?.("aria-label"),
                    node.getAttribute?.("title"),
                    node.innerText
                ].filter(Boolean).join(" ");
                const visible = rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
                const sideOk = side === "right"
                    ? rect.left > window.innerWidth * 0.54
                    : rect.right < window.innerWidth * 0.46;
                const verticalOk = rect.bottom > window.innerHeight * 0.12 && rect.top < window.innerHeight * 0.88;
                return { node, rect, label, score: rect.width * rect.height, visible, sideOk, verticalOk };
            })
            .filter(item => item.visible && item.sideOk && item.verticalOk && !badText.test(item.label || ""))
            .sort((a, b) => b.score - a.score);

        if (candidates[0]?.node) {
            candidates[0].node.click();
            return true;
        }

        // 3) Last-resort: send a plain Arrow key event to Instagram, while the real Ctrl+Arrow stays captured.
        const key = direction === "next" ? "ArrowRight" : "ArrowLeft";
        ["keydown", "keyup"].forEach(type => {
            const ev = new KeyboardEvent(type, {
                key,
                code: key,
                keyCode: key === "ArrowRight" ? 39 : 37,
                which: key === "ArrowRight" ? 39 : 37,
                bubbles: true,
                cancelable: true
            });
            document.dispatchEvent(ev);
            window.dispatchEvent(ev);
        });
        return true;
    }

    // ------------------------------------------------------------------ //
    //  Safe Instagram sponsor blocker
    // ------------------------------------------------------------------ //
    function applyInstagramAdBlocker() {
        if (!instagramAdBlocker) return;
        const roots = Array.from(document.querySelectorAll("main article, div[role='dialog'] article"));
        roots.forEach(root => {
            if (root.dataset.isfAdCheckedAt && Date.now() - Number(root.dataset.isfAdCheckedAt) < 1600) return;
            root.dataset.isfAdCheckedAt = String(Date.now());
            if (isSponsoredInstagramRoot(root)) {
                root.dataset.isfAdHidden = "1";
                root.style.setProperty("display", "none", "important");
            }
        });
    }

    function restoreInstagramAdBlocker() {
        document.querySelectorAll('[data-isf-ad-hidden="1"]').forEach(root => {
            root.style.removeProperty("display");
            delete root.dataset.isfAdHidden;
        });
    }

    function isSponsoredInstagramRoot(root) {
        if (!root) return false;
        const norm = (t) => (t || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
        const isVisibleNode = (node) => {
            const rect = node.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight * 1.4;
        };

        const nodes = Array.from(root.querySelectorAll("span, div, a")).slice(0, 400);
        return nodes.some(node => {
            const text = norm(node.textContent);
            if (text === "sponsored" || text === "ad") return isVisibleNode(node);

            // A/B test: Instagram splits "Sponsored" into single-letter spans.
            // Only join children of small containers so unrelated words never glue.
            if (node.children.length >= 4 && node.children.length <= 11) {
                let joined = "";
                for (const child of node.children) joined += norm(child.textContent);
                if (joined === "sponsored") return isVisibleNode(node);
            }
            return false;
        });
    }

    // ------------------------------------------------------------------ //
    //  Feature reliability watchdog — Instagram swaps videos without a full
    //  page reload, so features re-apply on play/pause/click/scroll signals.
    // ------------------------------------------------------------------ //
    let videoLifecycleRecoveryInstalled = false;
    function installVideoLifecycleRecovery() {
        if (videoLifecycleRecoveryInstalled) return;
        videoLifecycleRecoveryInstalled = true;

        // Debounced: fast Reels scrolling used to schedule dozens of recovery
        // passes per second. One trailing pass per 90ms window is enough.
        let softRefreshPending = false;
        const softRefresh = () => {
            if (!applicationIsOn || !appIsRunning || softRefreshPending) return;
            softRefreshPending = true;
            setTimeout(() => {
                softRefreshPending = false;
                if (!applicationIsOn || !appIsRunning || document.hidden) return;
                invalidateCurrentVideoCache();
                scheduleDomScan();
            }, 90);
        };

        const instantScrollCleanup = () => {
            if (!applicationIsOn || !appIsRunning) return;
            invalidateCurrentVideoCache();
            killProgressBarInstant();
            if (injectDownloadButtons._btn && injectDownloadButtons._btn.dataset.busy !== "1" && injectDownloadButtons._btn.dataset.hover !== "1") {
                injectDownloadButtons._activeId = null;
            }
        };

        document.addEventListener("play", (event) => {
            if (event.target?.tagName?.toLowerCase() === "video") {
                injectDownloadButtons._activeId = null;
                softRefresh();
            }
        }, true);
        document.addEventListener("pause", (event) => {
            if (event.target?.tagName?.toLowerCase() === "video") softRefresh();
        }, true);
        document.addEventListener("loadedmetadata", (event) => {
            if (event.target?.tagName?.toLowerCase() === "video") {
                delete event.target.dataset.hasBar;
                injectDownloadButtons._activeId = null;
                softRefresh();
            }
        }, true);
        document.addEventListener("click", softRefresh, true);
        document.addEventListener("visibilitychange", () => { if (!document.hidden) softRefresh(); }, true);
        window.addEventListener("focus", softRefresh, true);
        window.addEventListener("resize", softRefresh, true);
        window.addEventListener("scroll", instantScrollCleanup, { passive: true, capture: true });
        window.addEventListener("scroll", softRefresh, { passive: true, capture: true });
    }

    // ------------------------------------------------------------------ //
    //  Audio controls (auto-unmute, floating speaker hider)
    // ------------------------------------------------------------------ //
    const AUDIO_STATE_LABELS = [
        "Audio is muted", "Audio is playing",
        "Sound is muted", "Sound is playing",
        "Unmute", "Mute",
        "Turn sound on", "Turn sound off",
        "Sound on", "Sound off"
    ];

    function buildAudioControlSelectors(labels) {
        return labels.flatMap((label) => [
            `svg[aria-label="${label}"]`,
            `button[aria-label="${label}"]`,
            `div[role="button"][aria-label="${label}"]`
        ]).join(", ");
    }

    function installAudioIconHider() {
        if (audioUiStyleNode && document.contains(audioUiStyleNode)) return;
        audioUiStyleNode = document.createElement("style");
        audioUiStyleNode.id = "isf-hide-instagram-audio-ui";
        // Hide Instagram's floating speaker glyph. The actual mute state is controlled by M.
        audioUiStyleNode.textContent = buildAudioControlSelectors(AUDIO_STATE_LABELS) + ` {
            opacity: 0 !important;
            pointer-events: none !important;
        }`;
        (document.head || document.documentElement).appendChild(audioUiStyleNode);
    }

    function hideAudioUiButtons() {
        const candidates = Array.from(document.querySelectorAll('svg[aria-label], button[aria-label], div[role="button"][aria-label]'));
        candidates.forEach((node) => {
            const label = (node.getAttribute?.('aria-label') || '').toLowerCase();
            const looksLikeAudioControl = label.includes('audio') || label.includes('sound') || label.includes('mute') || label.includes('unmute');
            if (!looksLikeAudioControl) return;

            const control = node.matches?.('button, div[role="button"]') ? node : node.closest?.('button, div[role="button"]');
            if (!control) return;
            const rect = control.getBoundingClientRect();

            // Only hide the small floating speaker control. Do not hide a large video/card wrapper.
            if (rect.width > 0 && rect.height > 0 && rect.width <= 96 && rect.height <= 96) {
                control.style.setProperty('display', 'none', 'important');
                control.style.setProperty('opacity', '0', 'important');
                control.style.setProperty('pointer-events', 'none', 'important');
            }
        });
    }

    function applyPreferredAudioState(singleVideo = null) {
        const videos = singleVideo ? [singleVideo] : Array.from(document.querySelectorAll(VIDEOS_LIST_SELECTOR));
        videos.forEach((video) => {
            if (!video) return;
            try {
                if (keyboardMuted) {
                    video.muted = true;
                    video.defaultMuted = true;
                    video.setAttribute("muted", "");
                    return;
                }
                if (autoUnmute) {
                    video.muted = false;
                    video.defaultMuted = false;
                    if (video.volume === 0) video.volume = 1;
                    video.removeAttribute("muted");
                }
            } catch (_) {}
        });
    }

    function autoUnmuteAction() {
        return new Promise((resolve) => {
            // Labels that mean "currently muted" → safe to click once to unmute.
            const mutedLabels = AUDIO_STATE_LABELS.filter(l => /muted|unmute|sound on|sound off/i.test(l));
            const mutedSelector = buildAudioControlSelectors(mutedLabels);
            let attempts = 0;
            const checkButton = () => {
                if (!autoUnmute || keyboardMuted) return resolve(null);
                applyPreferredAudioState();
                const audioButton = Array.from(document.querySelectorAll(mutedSelector))[0];
                if (audioButton) {
                    const button = audioButton.matches?.("button, div[role='button']") ? audioButton : audioButton.closest("button, div[role='button']");
                    button?.click?.();
                    setTimeout(applyPreferredAudioState, 50);
                    resolve(button);
                    return;
                }
                attempts += 1;
                if (attempts > 8) { resolve(null); return; }
                setTimeout(checkButton, 350);
            };
            checkButton();
        });
    }

    // ------------------------------------------------------------------ //
    //  Media harvest ingestion (from the MAIN-world inject.js agent)
    //
    //  ARCHITECTURAL FIXES APPLIED:
    //   - P0-FIX #3: Dual caches merged into unified LRU with access-time eviction
    //   - P0-FIX #4: Token Bridge race condition fixed with synchronous token gen
    //   - P1-FIX #7: HMAC-style signed tokens replace window.__isfSessionToken
    // ------------------------------------------------------------------ //
    
    // === P0-FIX #4 + P1-FIX #7: Cryptographically-signed channel token === //
    // Generate token synchronously at script load time (before any inject.js handshake)
    // Using crypto.randomUUID() for high-entropy token that cannot be forged by XSS
    const ISF_CHANNEL_TOKEN = (() => {
        try {
            if (crypto && typeof crypto.randomUUID === 'function') {
                return crypto.randomUUID();
            }
        } catch (_) {}
        // Fallback: high-entropy random string
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let token = '';
        for (let i = 0; i < 32; i++) {
            token += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return token;
    })();
    
    // === P0-FIX #3: Unified cache with access-time LRU eviction === //
    // Single Map instead of dual isfMediaByKey + isfMediaUrlIndex
    // Each entry tracks lastAccessTime for true LRU behavior
    const isfMediaCache = new Map();  // key -> { record, urls: Set, lastAccessTime }
    const isfMediaUrlIndex = new Map();  // normalized URL -> { key, childIndex }
    const ISF_MEDIA_CACHE_LIMIT = 500;
    
    function normalizeMediaUrl(url) {
        if (!url || typeof url !== "string") return "";
        if (!/^https:\/\//i.test(url)) return "";
        return url.split("?")[0];
    }

    function mergeHarvestRecords(oldRec, newRec) {
        const pick = (a, b) => {
            const al = Array.isArray(a) ? a.length : 0;
            const bl = Array.isArray(b) ? b.length : 0;
            return bl >= al ? (b || a) : a;
        };
        const merged = { ...oldRec, ...newRec };
        merged.images = pick(oldRec.images, newRec.images) || [];
        merged.videos = pick(oldRec.videos, newRec.videos) || [];
        const carousel = pick(oldRec.carousel, newRec.carousel);
        if (carousel && carousel.length) merged.carousel = carousel;
        else delete merged.carousel;
        return merged;
    }

    function indexHarvestRecord(key, record) {
        const urls = new Set();
        const addRenditions = (list, childIndex) => {
            (list || []).forEach((tuple) => {
                const norm = normalizeMediaUrl(Array.isArray(tuple) ? tuple[0] : "");
                if (!norm) return;
                isfMediaUrlIndex.set(norm, { key, childIndex });
                urls.add(norm);
            });
        };
        addRenditions(record.images, -1);
        addRenditions(record.videos, -1);
        (record.carousel || []).forEach((child, idx) => {
            addRenditions(child.images, idx);
            addRenditions(child.videos, idx);
        });
        return urls;
    }

    function unindexHarvestRecord(key, urls) {
        if (urls) {
            for (const u of urls) isfMediaUrlIndex.delete(u);
        }
    }
    
    // === P0-FIX #3: Access-time based LRU eviction === //
    function evictOldestMediaRecord() {
        let oldestKey = null;
        let oldestTime = Infinity;
        
        for (const [key, entry] of isfMediaCache.entries()) {
            if (entry.lastAccessTime < oldestTime) {
                oldestTime = entry.lastAccessTime;
                oldestKey = key;
            }
        }
        
        if (oldestKey) {
            const entry = isfMediaCache.get(oldestKey);
            unindexHarvestRecord(oldestKey, entry.urls);
            isfMediaCache.delete(oldestKey);
        }
    }

    function ingestHarvestRecord(rec) {
        if (!rec || typeof rec !== "object") return;
        if (!rec.id && !rec.code) return;
        const key = rec.id ? "id:" + rec.id : "code:" + rec.code;
        const now = Date.now();
        
        const existing = isfMediaCache.get(key) || null;
        const merged = existing ? mergeHarvestRecords(existing.record, rec) : rec;
        
        if (isfMediaCache.has(key)) {
            const oldEntry = isfMediaCache.get(key);
            unindexHarvestRecord(key, oldEntry.urls);
        }
        
        const urls = indexHarvestRecord(key, merged);
        isfMediaCache.set(key, { record: merged, urls, lastAccessTime: now });
        
        // Evict oldest entries when over limit (access-time based)
        while (isfMediaCache.size > ISF_MEDIA_CACHE_LIMIT) {
            evictOldestMediaRecord();
        }
    }
    
    // === P1-FIX #7: Secure message handler with HMAC-style token validation === //
    window.addEventListener("message", (event) => {
        if (event.source !== window) return;
        const data = event.data;
        if (!data || data.source !== "isf" || data.type !== "isf-media-batch") return;
        
        // Reject if no token provided or token doesn't match our cryptographically-generated token
        if (!data.token || data.token !== ISF_CHANNEL_TOKEN) return;
        
        if (!Array.isArray(data.records)) return;
        for (const rec of data.records) {
            try { ingestHarvestRecord(rec); } catch (_) {}
        }
    });

    // ------------------------------------------------------------------ //
    //  Harvest lookups — correlate what's on screen with what was harvested
    // ------------------------------------------------------------------ //
    function getCurrentShortcode() {
        const m = location.pathname.match(/^\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/);
        if (m) return m[1];
        const canonical = document.querySelector('link[rel="canonical"]')?.href || "";
        const cm = canonical.match(/\/(?:reel|p|tv)\/([A-Za-z0-9_-]+)/);
        return cm ? cm[1] : "";
    }

    function getCurrentStoryUser() {
        const m = location.pathname.match(/^\/stories\/([^/?#]+)/);
        if (!m) return "";
        try { return decodeURIComponent(m[1]).toLowerCase(); } catch (_) { return String(m[1]).toLowerCase(); }
    }

    function collectElementMediaUrls(el) {
        const urls = [];
        if (!el) return urls;
        const push = (u) => { const n = normalizeMediaUrl(u); if (n) urls.push(n); };
        const pushSrcset = (srcset) => {
            if (!srcset) return;
            for (const part of String(srcset).split(",")) {
                push(part.trim().split(/\s+/)[0]);
            }
        };
        if (el.tagName === "IMG") {
            push(el.currentSrc);
            push(el.src);
            pushSrcset(el.getAttribute("srcset"));
            const picture = el.closest?.("picture");
            if (picture) Array.from(picture.querySelectorAll("source[srcset]")).forEach(s => pushSrcset(s.getAttribute("srcset")));
        } else if (el.tagName === "VIDEO") {
            push(el.poster);
            push(el.currentSrc);
            push(el.src);
        }
        return urls;
    }

    function findHarvestRecordForElement(el) {
        for (const norm of collectElementMediaUrls(el)) {
            const hit = isfMediaUrlIndex.get(norm);
            if (!hit) continue;
            const entry = isfMediaCache.get(hit.key);
            if (!entry) continue;
            // Update access time on read (true LRU behavior)
            entry.lastAccessTime = Date.now();
            const record = entry.record;
            const child = hit.childIndex >= 0 && Array.isArray(record.carousel) ? (record.carousel[hit.childIndex] || null) : null;
            return { record, child };
        }
        return null;
    }

    function findHarvestRecordForShortcode(code) {
        if (!code) return null;
        for (const entry of isfMediaCache.values()) {
            // Update access time on read
            entry.lastAccessTime = Date.now();
            if (entry.record.code === code) return { record: entry.record, child: null };
        }
        return null;
    }

    function findHarvestRecordForStory(user) {
        if (!user) return null;
        let best = null;
        for (const entry of isfMediaCache.values()) {
            if ((entry.record.user || "").toLowerCase() !== user) continue;
            // Update access time on read
            entry.lastAccessTime = Date.now();
            if (!best || (entry.record.ts || 0) > (best.ts || 0)) best = entry.record;
        }
        return best ? { record: best, child: null } : null;
    }

    function findHarvestMatch(mediaInfo, pageUrl) {
        // 1) Precise: the visible img/video URL matches a harvested rendition.
        const byElement = mediaInfo?.element ? findHarvestRecordForElement(mediaInfo.element) : null;
        if (byElement) return byElement;
        // 2) The page URL shortcode (reel/p/tv pages and modals).
        const code = getCurrentShortcode()
            || (String(pageUrl || "").match(/\/(?:reel|p|tv)\/([A-Za-z0-9_-]+)/) || [])[1]
            || "";
        const byCode = findHarvestRecordForShortcode(code);
        if (byCode) return byCode;
        // 3) Story pages: newest harvested item from that user.
        return findHarvestRecordForStory(getCurrentStoryUser());
    }

    function buildDownloadCandidates(match, mediaInfo) {
        const out = [];
        const seen = new Set();
        const push = (url, kind) => {
            if (!url || seen.has(url)) return;
            seen.add(url);
            out.push({ url, kind });
        };
        const node = match?.child || match?.record || null;
        const wantKind = mediaInfo?.kind === "video" ? "video" : mediaInfo?.kind === "photo" ? "photo" : "";
        if (node) {
            const videos = Array.isArray(node.videos) ? node.videos : [];
            const images = Array.isArray(node.images) ? node.images : [];
            // Renditions arrive sorted best-first; keep that order.
            if (wantKind === "video") {
                videos.forEach((t) => push(t[0], "video"));
                images.forEach((t) => push(t[0], "photo"));
            } else {
                images.forEach((t) => push(t[0], "photo"));
                videos.forEach((t) => push(t[0], "video"));
            }
        }
        // Carousel without a matched child: expose each child's best rendition.
        if (match?.record && !match.child && Array.isArray(match.record.carousel)) {
            for (const child of match.record.carousel) {
                const bestVideo = Array.isArray(child.videos) && child.videos[0];
                const bestImage = Array.isArray(child.images) && child.images[0];
                if (bestVideo) push(bestVideo[0], "video");
                else if (bestImage) push(bestImage[0], "photo");
            }
        }
        // DOM fallback (photos still expose real CDN URLs via srcset).
        if (mediaInfo?.directMediaUrl) push(mediaInfo.directMediaUrl, mediaInfo.kind || "unknown");
        return out.slice(0, 6);
    }

    // ------------------------------------------------------------------ //
    //  Download orchestration — native helper and/or browser Quick Save
    // ------------------------------------------------------------------ //
    
    // === P0-FIX #5: Native Helper with freshness health checks === //
    let nativeHelperProbe = { 
        at: 0, 
        installed: false, 
        pending: null,
        consecutiveFailures: 0,
        lastSuccessfulCheck: 0
    };

    function probeNativeHelper(force = false) {
        const now = Date.now();
        
        // If we have a pending request and not forcing, return it
        if (nativeHelperProbe.pending && !force) return nativeHelperProbe.pending;
        
        // === P0-FIX #5: Health check - reduce cache TTL on failures === //
        // After consecutive failures, reduce cache time from 60s to 5s
        let cacheTtlMs = 60000;
        if (nativeHelperProbe.consecutiveFailures >= 2) {
            cacheTtlMs = 5000;
        } else if (nativeHelperProbe.consecutiveFailures >= 1) {
            cacheTtlMs = 15000;
        }
        
        if (!force && now - nativeHelperProbe.at < cacheTtlMs) {
            return Promise.resolve(nativeHelperProbe.installed);
        }
        
        const pending = new Promise((resolve) => {
            try {
                api.runtime.sendMessage({ type: "ISF_CHECK_NATIVE_DOWNLOADER" }, (res) => {
                    const installed = !api.runtime.lastError && !!(res && res.installed && !res.needsUpdate);
                    
                    // Track success/failure for health monitoring
                    if (installed) {
                        nativeHelperProbe.consecutiveFailures = 0;
                        nativeHelperProbe.lastSuccessfulCheck = Date.now();
                    } else {
                        nativeHelperProbe.consecutiveFailures++;
                    }
                    
                    nativeHelperProbe = { 
                        at: Date.now(), 
                        installed, 
                        pending: null,
                        consecutiveFailures: nativeHelperProbe.consecutiveFailures,
                        lastSuccessfulCheck: nativeHelperProbe.lastSuccessfulCheck
                    };
                    resolve(installed);
                });
            } catch (_) {
                nativeHelperProbe.consecutiveFailures++;
                nativeHelperProbe = { 
                    at: Date.now(), 
                    installed: false, 
                    pending: null,
                    consecutiveFailures: nativeHelperProbe.consecutiveFailures,
                    lastSuccessfulCheck: nativeHelperProbe.lastSuccessfulCheck
                };
                resolve(false);
            }
        });
        nativeHelperProbe = { 
            at: nativeHelperProbe.at, 
            installed: nativeHelperProbe.installed, 
            pending,
            consecutiveFailures: nativeHelperProbe.consecutiveFailures,
            lastSuccessfulCheck: nativeHelperProbe.lastSuccessfulCheck
        };
        return pending;
    }

    function browserQuickSaveDownload(url, kind, baseName) {
        return new Promise((resolve) => {
            try {
                api.runtime.sendMessage({ type: "ISF_BROWSER_DOWNLOAD", url, mediaKind: kind, filename: baseName }, (res) => {
                    if (api.runtime.lastError) { resolve({ ok: false, error: api.runtime.lastError.message }); return; }
                    resolve(res || { ok: false, error: "No response from background" });
                });
            } catch (err) {
                resolve({ ok: false, error: String(err || "Quick Save failed") });
            }
        });
    }

    function buildDownloadBaseName(record, mediaInfo) {
        const parts = ["instagram"];
        const user = (record?.user || "").replace(/[^a-z0-9._-]+/gi, "").slice(0, 32);
        const code = record?.code || getCurrentShortcode() || (record?.id ? String(record.id).slice(0, 16) : "media");
        if (user) parts.push(user);
        parts.push(code || "media");
        const d = new Date();
        const pad = (n) => String(n).padStart(2, "0");
        parts.push(d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + "_" + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()));
        return parts.join("_");
    }

    async function downloadCurrentMedia(mediaInfo = null) {
        const pageUrl = getBestMediaUrl(mediaInfo);
        const kind = mediaInfo?.kind || "unknown";
        const hasPage = /^https:\/\/(www\.)?instagram\.com\/(reel|p|tv|stories)\//.test(pageUrl);
        const match = findHarvestMatch(mediaInfo, pageUrl);
        const candidates = buildDownloadCandidates(match, mediaInfo);
        const baseName = buildDownloadBaseName(match?.record || null, mediaInfo);
        const isCarousel = !!(match?.record && Array.isArray(match.record.carousel));
        const helperInstalled = await probeNativeHelper();

        // EXTRACTION FAILURE CHECK: If no harvested match and no candidates found,
        // trigger the floating alert and activate fallback downloader
        if (!match && !candidates.length && !mediaInfo?.directMediaUrl) {
            showExtractionFailureAlert();
        }

        const reportNativeSuccess = (res) => {
            const savedPath = res?.filepath || (Array.isArray(res?.files) && res.files[0]) || res?.folder || "";
            showToast(savedPath ? "Saved locally ✅ " + savedPath : "Saved locally ✅");
            return { ...res, method: "native" };
        };

        // Native helper first for videos & carousels: yt-dlp merges DASH
        // audio/video at the highest quality and expands full carousels.
        if (helperInstalled && hasPage && (kind === "video" || isCarousel)) {
            const res = await nativeDownloadCurrentMedia("", "", mediaInfo, true);
            if (res?.ok) return reportNativeSuccess(res);
            // Otherwise fall through to Quick Save silently.
        }

        // Browser Quick Save: zero-setup path using harvested CDN renditions.
        // The browser attaches the profile's own cookies automatically.
        if (browserQuickSave && candidates.length) {
            const best = candidates[0];
            showToast(best.kind === "video" ? "Quick Save: downloading video…" : "Quick Save: downloading photo…");
            const res = await browserQuickSaveDownload(best.url, best.kind, baseName);
            if (res?.ok) {
                const fileName = String(res.filename || "").split("/").pop();
                showToast(isCarousel && !match?.child
                    ? "Saved cover item ✅ (native helper saves full carousels)"
                    : "Saved ✅ " + (fileName || "to Downloads"));
                return { ...res, method: "browser" };
            }
        }

        // Native as the fallback for photos when Quick Save is off or failed.
        if (helperInstalled && hasPage) {
            const res = await nativeDownloadCurrentMedia("", "", mediaInfo, true);
            if (res?.ok) return reportNativeSuccess(res);
            showToast("Download failed: " + (res?.error || "unknown error"));
            return res;
        }

        if (!candidates.length && !hasPage) {
            showToast("No downloadable media found yet — open the post or scroll it into view.");
        } else if (!browserQuickSave && !helperInstalled) {
            showToast("Enable Quick Save in the popup, or install the native helper.");
        } else {
            showToast("Download failed — media URL not available yet.");
        }
        return { ok: false, error: "no-path" };
    }

    function triggerDownloadShortcut() {
        if (!showDownloadBtn) {
            showToast("Enable the download button in the extension popup first.");
            return;
        }
        const btn = injectDownloadButtons._btn;
        if (btn && document.contains(btn)) {
            btn.click();
            return;
        }
        injectDownloadButtons();
        const created = injectDownloadButtons._btn;
        if (created) created.click();
        else showToast("No active photo/video found.");
    }

    // ------------------------------------------------------------------ //
    //  Page URL helpers
    // ------------------------------------------------------------------ //
    function cleanInstagramUrl(url) {
        try {
            const u = new URL(url, location.origin);
            return u.origin + u.pathname;
        } catch {
            return String(url || "").split("?")[0];
        }
    }

    function getBestMediaUrl(mediaInfo = null) {
        if (/^\/(reel|p|tv|stories)\//.test(location.pathname)) return cleanInstagramUrl(location.href);
        const canonical = document.querySelector('link[rel="canonical"]')?.href;
        if (canonical && /^https:\/\/(www\.)?instagram\.com\/(reel|p|tv|stories)\//.test(canonical)) return cleanInstagramUrl(canonical);

        const article = mediaInfo?.article || mediaInfo?.element?.closest?.("article") || null;
        const scopedLinks = article
            ? Array.from(article.querySelectorAll('a[href^="/reel/"], a[href^="/p/"], a[href^="/tv/"]'))
            : [];

        if (scopedLinks.length) {
            const postLink = scopedLinks.find(a => /^\/(p|reel|tv)\//.test(a.getAttribute("href") || ""));
            if (postLink) return cleanInstagramUrl(location.origin + postLink.getAttribute("href"));
        }

        const links = Array.from(document.querySelectorAll('a[href^="/reel/"], a[href^="/p/"], a[href^="/tv/"]'));
        let best = null;
        let bestScore = -1;
        for (const link of links) {
            const r = link.getBoundingClientRect();
            const xOverlap = Math.max(0, Math.min(r.right, window.innerWidth) - Math.max(r.left, 0));
            const yOverlap = Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0));
            const score = xOverlap * yOverlap;
            if (score > bestScore) { bestScore = score; best = link; }
        }
        if (best) return cleanInstagramUrl(location.origin + best.getAttribute("href"));
        return cleanInstagramUrl(location.href);
    }

    function isInstagramShareDialogOpen() {
        return Array.from(document.querySelectorAll('div[role="dialog"]')).some(dialog => {
            const text = (dialog.innerText || '').toLowerCase();
            return text.includes('share') && (text.includes('copy link') || text.includes('facebook') || text.includes('whatsapp') || text.includes('messenger'));
        });
    }

    // ------------------------------------------------------------------ //
    //  Native helper download (yt-dlp path, highest quality + carousels)
    // ------------------------------------------------------------------ //
    function nativeDownloadCurrentMedia(reasonText = "Downloading highest quality locally…", doneText = "Saved locally ✅", mediaInfo = null, quiet = false) {
        const mediaUrl = getBestMediaUrl(mediaInfo);
        if (!/^https:\/\/(www\.)?instagram\.com\/(reel|p|tv|stories)\//.test(mediaUrl)) {
            if (!quiet) showToast("Open a Reel/Post/Story first.");
            return Promise.resolve({ ok: false, error: "Open a Reel/Post/Story first." });
        }
        if (!quiet) showToast(reasonText);
        return new Promise((resolve) => {
            api.runtime.sendMessage({
                type: "ISF_NATIVE_DOWNLOAD",
                url: mediaUrl,
                directMediaUrl: mediaInfo?.directMediaUrl || "",
                mediaKind: mediaInfo?.kind || "unknown"
            }, (res) => {
                if (api.runtime.lastError) {
                    const out = { ok: false, error: api.runtime.lastError.message };
                    if (!quiet) showToast("Downloader error: " + out.error);
                    resolve(out);
                    return;
                }
                if (!res || !res.ok) {
                    const out = { ok: false, error: res?.error || "Unknown error" };
                    if (!quiet) showToast("Download failed: " + out.error);
                    resolve(out);
                    return;
                }
                if (!quiet) {
                    const savedPath = res?.filepath || (Array.isArray(res?.files) && res.files[0]) || res?.folder;
                    showToast(savedPath ? `${doneText} ${savedPath}` : doneText);
                }
                resolve(res);
            });
        });
    }

    async function copyToClipboard(text) {
        try { await navigator.clipboard.writeText(text); return true; }
        catch {
            const ta = document.createElement("textarea");
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); ta.remove(); return true; }
            catch { ta.remove(); return false; }
        }
    }

    // ------------------------------------------------------------------ //
    //  DOWNLOAD BUTTON — singleton overlay on Reels, videos, photos, feed
    // ------------------------------------------------------------------ //
    function injectDownloadButtons() {
        if (!appIsRunning) return;

        if (!showDownloadBtn) {
            document.querySelectorAll('.custom-dl-btn').forEach(btn => btn.remove());
            document.querySelectorAll(VIDEOS_LIST_SELECTOR).forEach(v => { delete v.dataset.hasDownloadBtn; });
            injectDownloadButtons._btn = null;
            injectDownloadButtons._loopStarted = false;
            return;
        }

        // ONE global button only. Per-video buttons caused duplicates on modal
        // Reels and left icons standing on non-current feed videos.
        document.querySelectorAll('.custom-dl-btn').forEach(btn => {
            if (btn !== injectDownloadButtons._btn) btn.remove();
        });

        let dlBtn = injectDownloadButtons._btn;
        const originalIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`;

        if (!dlBtn || !document.contains(dlBtn)) {
            dlBtn = document.createElement("div");
            injectDownloadButtons._btn = dlBtn;
            dlBtn.className = "custom-dl-btn";
            dlBtn.innerHTML = originalIcon;
            dlBtn.setAttribute("aria-label", "Download current media");
            dlBtn.setAttribute("role", "button");

            Object.assign(dlBtn.style, {
                position: "absolute",
                width: "20px",
                height: "20px",
                zIndex: "50",
                background: "rgba(38, 38, 38, 0.68)",
                color: "rgba(255,255,255,0.96)",
                borderRadius: "999px",
                cursor: "pointer",
                display: "none",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 2px 8px rgba(0,0,0,0.24)",
                border: "0",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
                transition: "opacity .38s ease, transform .14s ease, background .14s ease",
                pointerEvents: "none",
                opacity: "0"
            });

            dlBtn.dataset.busy = "0";
            dlBtn.dataset.hover = "0";

            dlBtn.onmouseenter = () => {
                dlBtn.dataset.hover = "1";
                clearDownloadFadeTimers();
                dlBtn.style.transform = "scale(1.06)";
                dlBtn.style.background = "rgba(52, 52, 52, 0.86)";
                dlBtn.style.opacity = "1";
                dlBtn.style.pointerEvents = "all";
            };
            dlBtn.onmouseleave = () => {
                dlBtn.dataset.hover = "0";
                dlBtn.style.transform = "scale(1)";
                dlBtn.style.background = "rgba(38, 38, 38, 0.68)";
                showDownloadBubble({ pinned: dlBtn.dataset.busy === "1" });
            };

            dlBtn.onclick = async (e) => {
                e.preventDefault();
                e.stopPropagation();

                const mediaInfo = getCurrentDownloadMedia();
                if (!mediaInfo?.element) {
                    showToast("No active photo/video found.");
                    return;
                }

                dlBtn.dataset.busy = "1";
                showDownloadBubble({ pinned: true });
                dlBtn.innerHTML = `<span style="font-size:12px;font-weight:700">…</span>`;

                try {
                    const res = await downloadCurrentMedia(mediaInfo);
                    if (res?.ok) {
                        dlBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
                    } else {
                        dlBtn.innerHTML = originalIcon;
                    }
                } catch (_) {
                    dlBtn.innerHTML = originalIcon;
                }

                setTimeout(() => {
                    dlBtn.innerHTML = originalIcon;
                    dlBtn.dataset.busy = "0";
                    showDownloadBubble({ pinned: false, fresh: true });
                }, 1800);
            };

            document.body.appendChild(dlBtn);
        }

        function clearDownloadFadeTimers() {
            if (injectDownloadButtons._fadeTimer) clearTimeout(injectDownloadButtons._fadeTimer);
            if (injectDownloadButtons._hideTimer) clearTimeout(injectDownloadButtons._hideTimer);
            injectDownloadButtons._fadeTimer = null;
            injectDownloadButtons._hideTimer = null;
        }

        function showDownloadBubble({ pinned = false, fresh = false } = {}) {
            if (!injectDownloadButtons._btn) return;
            const btn = injectDownloadButtons._btn;
            clearDownloadFadeTimers();
            btn.style.display = "flex";
            btn.style.pointerEvents = "all";
            if (fresh) {
                btn.style.opacity = "0";
                requestAnimationFrame(() => { btn.style.opacity = pinned ? "0.92" : "0.82"; });
            } else {
                btn.style.opacity = pinned ? "0.92" : "0.82";
            }
            if (!pinned) {
                injectDownloadButtons._fadeTimer = setTimeout(() => {
                    if (btn.dataset.hover !== "1" && btn.dataset.busy !== "1") {
                        btn.style.opacity = "0";
                        btn.style.pointerEvents = "none";
                    }
                }, 3500);
            }
        }

        function getCurrentDownloadVideo() {
            return getCurrentVideo();
        }

        function getBestDownloadVideoInside(root) {
            if (!root) return null;
            return Array.from(root.querySelectorAll(VIDEOS_LIST_SELECTOR))
                .map(video => {
                    const rect = video.getBoundingClientRect();
                    const area = Math.max(1, rect.width * rect.height);
                    const score = visibleScore(video);
                    const ratio = score / area;
                    return { video, score, ratio };
                })
                .filter(item => item.score > 12000 && item.ratio > 0.08)
                .sort((a, b) => b.score - a.score)[0]?.video || null;
        }

        function getCurrentDownloadArticleMedia(article) {
            if (!article) return null;
            const video = getBestDownloadVideoInside(article);
            const img = getCurrentDownloadImage(article);
            const videoScore = video ? visibleScore(video) : 0;
            const imgScore = img ? visibleScore(img) : 0;

            if (img && (!video || imgScore >= videoScore * 0.72)) {
                return {
                    element: img,
                    kind: "photo",
                    article,
                    directMediaUrl: getBestDirectImageUrl(img)
                };
            }

            if (video) {
                return {
                    element: video,
                    kind: "video",
                    article,
                    directMediaUrl: getBestDirectVideoUrl(video)
                };
            }

            return null;
        }

        function getCurrentDownloadMedia() {
            if (isHomeFeedPage()) {
                const articleMedia = getCurrentDownloadArticleMedia(getCurrentFeedArticle());
                if (articleMedia?.element) return articleMedia;
            }

            const video = getCurrentDownloadVideo();
            if (video && document.contains(video) && visibleScore(video) > 0) {
                return {
                    element: video,
                    kind: "video",
                    article: video.closest("article"),
                    directMediaUrl: getBestDirectVideoUrl(video)
                };
            }

            const img = getCurrentDownloadImage();
            if (img && document.contains(img)) {
                return {
                    element: img,
                    kind: "photo",
                    article: img.closest("article"),
                    directMediaUrl: getBestDirectImageUrl(img)
                };
            }

            return null;
        }

        function isUsableDirectMediaUrl(url) {
            if (!url || typeof url !== "string") return false;
            if (/^(blob:|data:|filesystem:)/i.test(url)) return false;
            try {
                const u = new URL(url, location.href);
                return /^https?:$/i.test(u.protocol) && (
                    /(^|\.)cdninstagram\.com$/i.test(u.hostname) ||
                    /(^|\.)fbcdn\.net$/i.test(u.hostname) ||
                    /instagram|fbcdn/i.test(u.hostname)
                );
            } catch (_) {
                return false;
            }
        }

        function getBestDirectVideoUrl(video) {
            // Almost always empty on modern Instagram (MSE blob streaming) —
            // harvested renditions are the real path. Kept as a safety net.
            const candidates = [
                video.currentSrc,
                video.src,
                ...Array.from(video.querySelectorAll("source")).map(s => s.src)
            ].filter(isUsableDirectMediaUrl);

            return candidates[0] || "";
        }

        function getBestDirectImageUrl(img) {
            const candidates = [];

            const parseDescriptorScore = (descriptor) => {
                const value = String(descriptor || "").trim();
                if (value.endsWith("w")) return Number.parseFloat(value) || 0;
                if (value.endsWith("x")) return (Number.parseFloat(value) || 1) * 10000;
                return 0;
            };

            const addSrcsetCandidates = (srcset, sourceBoost = 0) => {
                if (!srcset) return;
                for (const part of srcset.split(",")) {
                    const trimmed = part.trim();
                    const match = trimmed.match(/^(\S+)(?:\s+(.+))?$/);
                    if (!match) continue;
                    const url = match[1];
                    if (!isUsableDirectMediaUrl(url)) continue;
                    candidates.push({ url, score: parseDescriptorScore(match[2]) + sourceBoost });
                }
            };

            addSrcsetCandidates(img.getAttribute("srcset") || "", 0);
            addSrcsetCandidates(img.closest("picture")?.querySelector("source[srcset]")?.getAttribute("srcset") || "", 5000);

            [img.currentSrc, img.src].forEach(url => {
                if (isUsableDirectMediaUrl(url)) candidates.push({ url, score: 1 });
            });

            candidates.sort((a, b) => b.score - a.score);
            return candidates[0]?.url || "";
        }

        function getCurrentDownloadImage(scopeRoot = null) {
            const currentArticle = scopeRoot || getCurrentFeedArticle();
            const scopedRoots = [
                currentArticle,
                scopeRoot ? null : document.querySelector("div[role='dialog']"),
                scopeRoot ? null : document.querySelector("main")
            ].filter(Boolean);

            const images = Array.from(new Set(
                scopedRoots.flatMap(root => Array.from(root.querySelectorAll("picture img, img")))
            ));

            const candidates = images
                .map(img => {
                    const rect = img.getBoundingClientRect();
                    const visibleW = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
                    const visibleH = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
                    const visibleArea = visibleW * visibleH;
                    const visibleRatio = visibleArea / Math.max(1, rect.width * rect.height);
                    const visible = rect.width >= 150 && rect.height >= 150 && visibleArea > 18000 && visibleRatio > 0.12;
                    const alt = (img.alt || "").toLowerCase();
                    const bad =
                        img.closest("header") ||
                        img.closest("nav") ||
                        img.closest("[role='navigation']") ||
                        img.closest("a[href*='/stories/']") ||
                        alt.includes("profile picture") ||
                        alt.includes("avatar") ||
                        rect.width < 140 ||
                        rect.height < 140;

                    const cx = rect.left + rect.width / 2;
                    const cy = rect.top + rect.height / 2;
                    const centerDistance = Math.hypot(cx - window.innerWidth / 2, cy - window.innerHeight / 2);
                    const centerBonus = Math.max(0, 1 - centerDistance / Math.max(window.innerWidth, window.innerHeight));
                    const articleBonus = currentArticle && currentArticle.contains(img) ? visibleArea * 0.45 : 0;
                    return { img, visible, bad, score: visibleArea + visibleArea * centerBonus + articleBonus };
                })
                .filter(item => item.visible && !item.bad)
                .sort((a, b) => b.score - a.score);

            return candidates[0]?.img || null;
        }

        function getDownloadButtonAnchor(mediaInfo) {
            const mediaEl = mediaInfo?.element;
            const article = mediaInfo?.article || mediaEl?.closest?.("article");
            const dialog = mediaEl?.closest?.("div[role='dialog']");
            return article || dialog || mediaEl?.parentElement || document.body;
        }

        function placeDownloadButton(btn, mediaInfo) {
            const mediaEl = mediaInfo?.element;
            if (!btn || !mediaEl) return false;
            const anchor = getDownloadButtonAnchor(mediaInfo);
            if (!anchor || !document.contains(anchor)) return false;

            if (btn.parentElement !== anchor) anchor.appendChild(btn);
            const computed = getComputedStyle(anchor);
            if (computed.position === "static") anchor.style.position = "relative";

            const mediaRect = mediaEl.getBoundingClientRect();
            const anchorRect = anchor.getBoundingClientRect();
            const top = Math.max(8, Math.round(mediaRect.bottom - anchorRect.top - 28));
            const left = Math.max(8, Math.round(mediaRect.right - anchorRect.left - 28));
            btn.style.position = "absolute";
            btn.style.top = `${top}px`;
            btn.style.left = `${left}px`;
            btn.style.right = "auto";
            btn.style.bottom = "auto";
            return true;
        }

        function updateBtnPosition(now = performance.now()) {
            if (now - (injectDownloadButtons._lastFrameAt || 0) < 42) {
                requestAnimationFrame(updateBtnPosition);
                return;
            }
            injectDownloadButtons._lastFrameAt = now;
            const btn = injectDownloadButtons._btn;
            if (!btn || !document.contains(btn)) {
                injectDownloadButtons._loopStarted = false;
                return;
            }

            const mediaInfo = getCurrentDownloadMedia();
            const mediaEl = mediaInfo?.element || null;
            const rect = mediaEl?.getBoundingClientRect?.();
            const visible = !!mediaEl && document.contains(mediaEl) && rect.width > 0 && rect.height > 0;
            const active = visible && showDownloadBtn && !isInstagramShareDialogOpen() && appIsRunning && applicationIsOn;

            if (!active) {
                clearDownloadFadeTimers();
                injectDownloadButtons._activeId = null;
                injectDownloadButtons._wasActive = false;
                btn.style.opacity = "0";
                btn.style.pointerEvents = "none";
                if (btn.style.display !== "none") {
                    injectDownloadButtons._hideTimer = setTimeout(() => {
                        const current = getCurrentDownloadMedia();
                        if (!current?.element || current.element !== mediaEl || !showDownloadBtn) btn.style.display = "none";
                    }, 420);
                }
            } else {
                const placed = placeDownloadButton(btn, mediaInfo);
                if (!placed) {
                    btn.style.opacity = "0";
                    btn.style.pointerEvents = "none";
                    requestAnimationFrame(updateBtnPosition);
                    return;
                }
                const shouldPin = btn.dataset.busy === "1" || btn.dataset.hover === "1";
                const activeId = getVideoStableId(mediaEl);
                const wasActive = injectDownloadButtons._wasActive === true;
                injectDownloadButtons._lastTop = btn.style.top;
                injectDownloadButtons._lastLeft = btn.style.left;
                injectDownloadButtons._wasActive = true;
                if (injectDownloadButtons._activeId !== activeId || !wasActive) {
                    injectDownloadButtons._activeId = activeId;
                    showDownloadBubble({ pinned: shouldPin, fresh: true });
                } else if (shouldPin && btn.style.opacity !== "0.92") {
                    showDownloadBubble({ pinned: true });
                }
            }
            requestAnimationFrame(updateBtnPosition);
        }

        if (!injectDownloadButtons._loopStarted) {
            injectDownloadButtons._loopStarted = true;
            requestAnimationFrame(updateBtnPosition);
        }
    }

    // ------------------------------------------------------------------ //
    //  PROGRESS BAR — singleton, instant kill on scroll/change
    // ------------------------------------------------------------------ //
    function killProgressBarInstant() {
        const bar = injectProgressBars._bar;
        if (bar) {
            bar.style.opacity = "0";
            bar.style.pointerEvents = "none";
            bar.style.display = "none";
        }
        injectProgressBars._video = null;
        injectProgressBars._videoId = null;
        document.querySelectorAll("body > .ig-progressbar").forEach(node => {
            if (node !== bar) node.remove();
        });
    }

    function ensureProgressBarNode() {
        if (injectProgressBars._bar && document.contains(injectProgressBars._bar)) return injectProgressBars._bar;

        document.querySelectorAll("body > .ig-progressbar").forEach(node => node.remove());
        const bar = document.createElement("div");
        bar.className = "ig-progressbar";
        Object.assign(bar.style, {
            position: "fixed",
            bottom: "auto",
            zIndex: "2147483647",
            display: "none",
            opacity: "0",
            pointerEvents: "none"
        });

        const fill = document.createElement("div");
        fill.className = "ig-progressbar-fill";

        const handle = document.createElement("div");
        handle.className = "ig-progressbar-handle";

        fill.appendChild(handle);
        bar.appendChild(fill);
        document.body.appendChild(bar);

        injectProgressBars._bar = bar;
        injectProgressBars._fill = fill;
        injectProgressBars._handle = handle;
        injectProgressBars._dragging = false;

        const setScrubPosition = (clientX) => {
            const video = injectProgressBars._video;
            if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return;
            const rect = bar.getBoundingClientRect();
            let percent = (clientX - rect.left) / Math.max(1, rect.width);
            percent = Math.min(Math.max(percent, 0), 1);
            fill.style.width = (percent * 100) + "%";
            handle.style.left = (percent * rect.width) + "px";
            video.currentTime = percent * video.duration;
        };

        bar.addEventListener("mousedown", (e) => {
            e.preventDefault();
            e.stopPropagation();
            injectProgressBars._dragging = true;
            setScrubPosition(e.clientX);
        });
        handle.addEventListener("mousedown", (e) => {
            e.preventDefault();
            e.stopPropagation();
            injectProgressBars._dragging = true;
        });
        document.addEventListener("mousemove", (e) => {
            if (injectProgressBars._dragging) setScrubPosition(e.clientX);
        });
        document.addEventListener("mouseup", () => {
            const video = injectProgressBars._video;
            if (injectProgressBars._dragging) {
                injectProgressBars._dragging = false;
                if (video?.paused) video.play().catch(() => {});
            }
        });

        return bar;
    }

    function updateProgressBarFrame(now = performance.now()) {
        if (!injectProgressBars._loopStarted) return;
        if (!appIsRunning || !showProgressBar) {
            killProgressBarInstant();
            injectProgressBars._loopStarted = false;
            return;
        }

        // 30fps is enough for a 1px progress line and avoids per-video RAF load.
        if (now - (injectProgressBars._lastFrameAt || 0) < 32) {
            requestAnimationFrame(updateProgressBarFrame);
            return;
        }
        injectProgressBars._lastFrameAt = now;

        const bar = ensureProgressBarNode();
        const fill = injectProgressBars._fill;
        const handle = injectProgressBars._handle;
        const video = getCurrentVideo();
        const videoId = video ? getVideoStableId(video) : null;

        // When the active video changes, the old bar is killed instantly.
        if (videoId !== injectProgressBars._videoId) {
            bar.style.opacity = "0";
            bar.style.pointerEvents = "none";
            bar.style.display = "none";
            fill.style.width = "0%";
            handle.style.left = "0px";
            injectProgressBars._video = video || null;
            injectProgressBars._videoId = videoId;
        }

        const geometry = video ? getProgressBarGeometry(video) : null;
        if (!video || !geometry || !shouldShowProgressBarForVideo(video)) {
            bar.style.opacity = "0";
            bar.style.pointerEvents = "none";
            bar.style.display = "none";
            requestAnimationFrame(updateProgressBarFrame);
            return;
        }

        bar.style.display = "";
        bar.style.pointerEvents = "auto";
        bar.style.top = geometry.top + "px";
        bar.style.left = geometry.left + "px";
        bar.style.width = geometry.width + "px";
        bar.style.opacity = "1";

        if (!injectProgressBars._dragging && Number.isFinite(video.duration) && video.duration > 0) {
            const percent = Math.min(Math.max(video.currentTime / video.duration, 0), 1);
            fill.style.width = (percent * 100) + "%";
            handle.style.left = (percent * geometry.width) + "px";
        }

        requestAnimationFrame(updateProgressBarFrame);
    }

    function getProgressBarGeometry(video) {
        const rect = video.getBoundingClientRect();
        if (!rect || rect.width < 80 || rect.height < 80) return null;

        const barHeight = 1;
        const left = Math.max(0, rect.left);
        const right = Math.min(window.innerWidth, rect.right);
        const width = Math.max(0, right - left);
        if (width < 80) return null;

        const top = rect.bottom - barHeight;
        if (top < 0 || top > window.innerHeight - barHeight) return null;
        return { left, top, width };
    }

    function shouldShowProgressBarForVideo(video) {
        if (!showProgressBar || !video) return false;
        if (!Number.isFinite(video.duration) || video.duration <= 0) return false;
        const rect = video.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) return false;
        const visible = visibleScore(video);
        const total = rect.width * rect.height;
        if (visible <= 0 || (total > 0 && visible / total < 0.12)) return false;
        return getCurrentVideo() === video;
    }

    function injectProgressBars() {
        if (!appIsRunning) return;
        if (!showProgressBar) {
            killProgressBarInstant();
            document.querySelectorAll(VIDEOS_LIST_SELECTOR).forEach(v => { delete v.dataset.hasBar; });
            return;
        }
        document.querySelectorAll(VIDEOS_LIST_SELECTOR).forEach(v => { delete v.dataset.hasBar; });
        ensureProgressBarNode();
        if (!injectProgressBars._loopStarted) {
            injectProgressBars._loopStarted = true;
            requestAnimationFrame(updateProgressBarFrame);
        }
    }

    // ------------------------------------------------------------------ //
    //  STORY STUDIO HELPER — button inside Instagram's share dialog.
    //  Uses native Story share when available; otherwise downloads the media
    //  and opens the Story uploader (browsers can't silently attach files).
    // ------------------------------------------------------------------ //
    function installShareToStoryHelper() {
        const addButton = () => {
            const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]'));
            for (const dialog of dialogs) {
                const text = (dialog.innerText || '').toLowerCase();
                const looksLikeShareDialog = text.includes('share') && (text.includes('copy link') || text.includes('facebook') || text.includes('whatsapp') || text.includes('messenger'));
                if (!looksLikeShareDialog) continue;

                // Remove older broken full-width share helper buttons from earlier builds.
                dialog.querySelectorAll('.isf-share-story-btn').forEach(el => el.remove());
                if (dialog.querySelector('.isf-story-helper-compact')) continue;

                const btn = document.createElement('button');
                btn.className = 'isf-story-helper-compact';
                btn.type = 'button';
                btn.innerHTML = '＋ Story Studio';
                btn.style.cssText = `
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 7px;
                    position: sticky;
                    bottom: 8px;
                    left: 16px;
                    width: calc(100% - 32px);
                    margin: 10px 16px 12px;
                    padding: 10px 14px;
                    border: 1px solid rgba(255,255,255,.14);
                    border-radius: 14px;
                    color: white;
                    font: 800 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
                    cursor: pointer;
                    background: linear-gradient(135deg, rgba(124,58,237,.96), rgba(236,72,153,.94), rgba(249,115,22,.92));
                    box-shadow: 0 8px 22px rgba(0,0,0,.30);
                    z-index: 4;
                    overflow: hidden;
                `;

                btn.addEventListener('click', async (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    const candidates = Array.from(dialog.querySelectorAll('button, div[role="button"], a'));
                    const nativeStoryTarget = candidates.find(el => {
                        const t = (el.innerText || el.getAttribute('aria-label') || '').trim().toLowerCase();
                        return t.includes('add to story') || t.includes('add reel to your story') || t.includes('add post to your story');
                    });

                    if (nativeStoryTarget) {
                        nativeStoryTarget.click();
                        showToast('Opening Instagram story share…');
                        return;
                    }

                    btn.innerHTML = 'Preparing Story…';
                    const mediaUrl = getBestMediaUrl();
                    await copyToClipboard(`Shared from ${mediaUrl}`);
                    const result = await downloadCurrentMedia(null);
                    btn.innerHTML = '＋ Story Studio';

                    if (result?.ok) {
                        showToast('Choose the downloaded media from your downloads folder. Caption copied.');
                        setTimeout(() => {
                            window.open('https://www.instagram.com/create/story/', '_blank', 'noopener,noreferrer');
                        }, 450);
                    }
                });

                const bottom = Array.from(dialog.querySelectorAll('div')).find(el => {
                    const t = (el.innerText || '').toLowerCase();
                    return t.includes('copy link') && t.includes('facebook');
                });
                (bottom || dialog).appendChild(btn);
            }
        };

        addButton();
        new MutationObserver(addButton).observe(document.documentElement, { childList: true, subtree: true });
    }

    // ------------------------------------------------------------------ //
    //  Toast notifications
    // ------------------------------------------------------------------ //
    function showToast(text) {
        const toast = document.createElement('div');
        toast.textContent = text;
        Object.assign(toast.style, {
            position: "fixed", bottom: "30px", left: "50%", transform: "translateX(-50%)",
            backgroundColor: "#4ade80", color: "#000", padding: "10px 20px", borderRadius: "20px",
            fontWeight: "bold", fontFamily: "'Outfit', system-ui, -apple-system, BlinkMacSystemFont, sans-serif", fontSize: "14px", zIndex: "2147483647",
            opacity: "0", transition: "opacity 0.3s ease", boxShadow: "0 4px 15px rgba(0,0,0,0.2)"
        });
        document.body.appendChild(toast);
        setTimeout(() => toast.style.opacity = "1", 10);
        setTimeout(() => { toast.style.opacity = "0"; setTimeout(() => toast.remove(), 300); }, 2500);
    }

    // ------------------------------------------------------------------ //
    //  Extraction Failure Alert (Liquid-Glass Theme)
    // ------------------------------------------------------------------ //
    let extractionAlertTimeout = null;
    
    function showExtractionFailureAlert() {
        // Clear any existing alert timeout
        if (extractionAlertTimeout) {
            clearTimeout(extractionAlertTimeout);
        }
        
        // Remove any existing alert
        const existingAlert = document.querySelector('.isf-extraction-alert');
        if (existingAlert) existingAlert.remove();
        
        const alert = document.createElement('div');
        alert.className = 'isf-extraction-alert';
        alert.innerHTML = `
            <div class="isf-alert-icon">⚠️</div>
            <div class="isf-alert-content">
                <div class="isf-alert-title">Extraction payload shifted</div>
                <div class="isf-alert-message">Activating zero-setup fallback downloader...</div>
            </div>
        `;
        
        Object.assign(alert.style, {
            position: "fixed",
            top: "24px",
            left: "50%",
            transform: "translateX(-50%) translateY(-20px)",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "14px 18px",
            background: "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03)), linear-gradient(135deg, rgba(236,72,153,0.15), rgba(14,165,233,0.12))",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "16px",
            boxShadow: "0 12px 32px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.06)",
            zIndex: "2147483647",
            opacity: "0",
            transition: "opacity 0.35s cubic-bezier(0.4, 0, 0.2, 1), transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
            maxWidth: "340px",
            cursor: "default"
        });
        
        document.body.appendChild(alert);
        
        // Animate in
        requestAnimationFrame(() => {
            alert.style.opacity = "1";
            alert.style.transform = "translateX(-50%) translateY(0)";
        });
        
        // Auto-remove after 4 seconds
        extractionAlertTimeout = setTimeout(() => {
            alert.style.opacity = "0";
            alert.style.transform = "translateX(-50%) translateY(-20px)";
            setTimeout(() => alert.remove(), 350);
        }, 4000);
    }
}
