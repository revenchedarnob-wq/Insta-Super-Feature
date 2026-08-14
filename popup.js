// Cross-browser compatibility shim
const api = typeof browser !== "undefined" ? browser : chrome;

const showDownloadToggle = document.getElementById("showDownloadToggle");
const autoRedirectToggle = document.getElementById("autoRedirectToggle");
const autoUnmute = document.getElementById("autoUnmuteToggle");
const autoReelsToggle = document.getElementById("autoReelsToggle");
const startButton = document.getElementById("startStopButton");
const progressBarToggle = document.getElementById("progressBarToggle");
const anonStoryToggle = document.getElementById("anonStoryToggle");
const noSeenToggle = document.getElementById("noSeenToggle");
const stealthModeToggle = document.getElementById("stealthModeToggle");
const keyboardSeekToggle = document.getElementById("keyboardSeekToggle");
const keyboardSeek3Toggle = document.getElementById("keyboardSeek3Toggle");
const feedCarouselArrowsToggle = document.getElementById("feedCarouselArrowsToggle");
const autoFeedScrollToggle = document.getElementById("autoFeedScrollToggle");
const feedArrowNavigationToggle = document.getElementById("feedArrowNavigationToggle");
const instagramAdBlockerToggle = document.getElementById("instagramAdBlockerToggle");
const focusModeToggle = document.getElementById("focusModeToggle");
const spacePauseToggle = document.getElementById("spacePauseToggle");
const keyboardSuiteToggle = document.getElementById("keyboardSuiteToggle");
const videoSpeedToggle = document.getElementById("videoSpeedToggle");
const bestQualityToggle = document.getElementById("bestQualityToggle");
const enterLoveToggle = document.getElementById("enterLoveToggle");
const browserQuickSaveToggle = document.getElementById("browserQuickSaveToggle");
const speedButtons = Array.from(document.querySelectorAll(".speed-btn"));
const startButtonText = startButton.querySelector("span");

api.storage.sync.get("showDownload", (result) => {
    showDownloadToggle.checked = result.showDownload !== undefined ? result.showDownload : true;
});

api.storage.sync.get(["autoReelsStart", "applicationIsOn"], (result) => {
    const isAutoReels = result.autoReelsStart !== undefined ? result.autoReelsStart : true;
    const isOn = result.applicationIsOn !== undefined ? result.applicationIsOn : true;
    autoReelsToggle.checked = isAutoReels;
    startButtonText.textContent = isOn ? "Stop" : "Start";
    startButton.classList.toggle("running", isOn);
    document.querySelector(".status-pill")?.classList.toggle("off", !isOn);
});

api.storage.sync.get("autoRedirect", (result) => {
    autoRedirectToggle.checked = result.autoRedirect !== undefined ? result.autoRedirect : false;
});

api.storage.sync.get("autoUnmute", (result) => {
    autoUnmute.checked = result.autoUnmute !== undefined ? result.autoUnmute : true;
});


api.storage.sync.get("showProgressBar", (result) => {
    progressBarToggle.checked = result.showProgressBar !== undefined ? result.showProgressBar : true;
});

api.storage.sync.get("anonStoryViewer", (result) => {
    anonStoryToggle.checked = result.anonStoryViewer !== undefined ? result.anonStoryViewer : false;
});

api.storage.sync.get("noSeenMessages", (result) => {
    noSeenToggle.checked = result.noSeenMessages !== undefined ? result.noSeenMessages : false;
});

api.storage.sync.get("stealthMode", (result) => {
    stealthModeToggle.checked = result.stealthMode !== undefined ? result.stealthMode : true;
});

api.storage.sync.get(["keyboardSeek", "keyboardSeek3"], (result) => {
    const is3s = result.keyboardSeek3 !== undefined ? result.keyboardSeek3 === true : true;
    const is5s = result.keyboardSeek !== undefined ? result.keyboardSeek : false;

    // Mutual exclusion: only one arrow-seek mode can be enabled at a time.
    keyboardSeek3Toggle.checked = is3s;
    keyboardSeekToggle.checked = is3s ? false : !!is5s;

    if (is3s && is5s) {
        api.storage.sync.set({ keyboardSeek: false, keyboardSeek3: true });
    }
});

api.storage.sync.get("feedCarouselArrows", (result) => {
    feedCarouselArrowsToggle.checked = result.feedCarouselArrows !== undefined ? result.feedCarouselArrows : true;
});

api.storage.sync.get("autoFeedScroll", (result) => {
    autoFeedScrollToggle.checked = result.autoFeedScroll !== undefined ? result.autoFeedScroll : true;
});

api.storage.sync.get("feedArrowNavigation", (result) => {
    if (feedArrowNavigationToggle) feedArrowNavigationToggle.checked = result.feedArrowNavigation !== undefined ? result.feedArrowNavigation : true;
});

api.storage.sync.get("instagramAdBlocker", (result) => {
    instagramAdBlockerToggle.checked = result.instagramAdBlocker !== undefined ? result.instagramAdBlocker : true;
});

api.storage.sync.get("focusMode", (result) => {
    if (focusModeToggle) focusModeToggle.checked = result.focusMode !== undefined ? result.focusMode : false;
});


api.storage.sync.get("spacePause", (result) => {
    spacePauseToggle.checked = result.spacePause !== undefined ? result.spacePause : true;
});

api.storage.sync.get("keyboardSuite", (result) => {
    keyboardSuiteToggle.checked = result.keyboardSuite !== undefined ? result.keyboardSuite : true;
});

function updateSpeedButtons(speed) {
    const normalized = Number(speed || 1);
    speedButtons.forEach(btn => {
        btn.classList.toggle("active", Number(btn.dataset.speed) === normalized);
    });
}

api.storage.sync.get(["videoSpeedEnabled", "videoSpeed"], (result) => {
    videoSpeedToggle.checked = result.videoSpeedEnabled !== undefined ? result.videoSpeedEnabled : true;
    updateSpeedButtons(result.videoSpeed !== undefined ? result.videoSpeed : 1);
});

api.storage.sync.get("bestQualityMode", (result) => {
    bestQualityToggle.checked = result.bestQualityMode !== undefined ? result.bestQualityMode : true;
});

api.storage.sync.get("enterLoveReact", (result) => {
    enterLoveToggle.checked = result.enterLoveReact !== undefined ? result.enterLoveReact : true;
});

api.storage.sync.get("browserQuickSave", (result) => {
    if (browserQuickSaveToggle) browserQuickSaveToggle.checked = result.browserQuickSave !== undefined ? result.browserQuickSave : true;
});


showDownloadToggle.onclick = () => {
    api.runtime.sendMessage({ event: "showDownload", showDownloadValue: showDownloadToggle.checked });
};

autoRedirectToggle.onclick = () => {
    api.runtime.sendMessage({ event: "autoRedirect", autoRedirectValue: autoRedirectToggle.checked });
};

autoUnmute.onclick = () => {
    api.runtime.sendMessage({ event: "autoMute", autoUnmuteValue: autoUnmute.checked });
};


autoReelsToggle.onclick = () => {
    api.runtime.sendMessage({ event: "autoReelsStart", autoReelsValue: autoReelsToggle.checked });
};

progressBarToggle.onclick = () => {
    setSyncAndNotify({ showProgressBar: progressBarToggle.checked }, { event: "showProgressBar", showProgressBarValue: progressBarToggle.checked });
};

anonStoryToggle.onclick = () => {
    api.storage.sync.set({ anonStoryViewer: anonStoryToggle.checked });
};

noSeenToggle.onclick = () => {
    api.runtime.sendMessage({ event: "noSeenMessages", noSeenMessagesValue: noSeenToggle.checked });
};

stealthModeToggle.onclick = () => {
    api.storage.sync.set({ stealthMode: stealthModeToggle.checked });
};

keyboardSeekToggle.onclick = () => {
    if (keyboardSeekToggle.checked) {
        keyboardSeek3Toggle.checked = false;
        api.runtime.sendMessage({ event: "keyboardSeekMode", keyboardSeekValue: true, keyboardSeek3Value: false });
    } else {
        api.runtime.sendMessage({ event: "keyboardSeekMode", keyboardSeekValue: false, keyboardSeek3Value: false });
    }
};

keyboardSeek3Toggle.onclick = () => {
    if (keyboardSeek3Toggle.checked) {
        keyboardSeekToggle.checked = false;
        api.runtime.sendMessage({ event: "keyboardSeekMode", keyboardSeekValue: false, keyboardSeek3Value: true });
    } else {
        api.runtime.sendMessage({ event: "keyboardSeekMode", keyboardSeekValue: false, keyboardSeek3Value: false });
    }
};

feedCarouselArrowsToggle.onclick = () => {
    api.runtime.sendMessage({ event: "feedCarouselArrows", feedCarouselArrowsValue: feedCarouselArrowsToggle.checked });
};

autoFeedScrollToggle.onclick = () => {
    api.runtime.sendMessage({ event: "autoFeedScroll", autoFeedScrollValue: autoFeedScrollToggle.checked });
};

if (feedArrowNavigationToggle) feedArrowNavigationToggle.onclick = () => {
    api.runtime.sendMessage({ event: "feedArrowNavigation", feedArrowNavigationValue: feedArrowNavigationToggle.checked });
};

instagramAdBlockerToggle.onclick = () => {
    api.runtime.sendMessage({ event: "instagramAdBlocker", instagramAdBlockerValue: instagramAdBlockerToggle.checked });
};

function sendToActiveInstagramTab(message) {
    api.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || !tabs[0] || !tabs[0].id) return;
        api.tabs.sendMessage(tabs[0].id, message, () => void api.runtime.lastError);
    });
}

function setSyncAndNotify(patch, message) {
    api.storage.sync.set(patch, () => void api.runtime.lastError);
    sendToActiveInstagramTab(message);
}

function installLiveToggleSync() {
    const bind = (el, patchFor, messageFor) => {
        if (!el) return;
        el.addEventListener("change", () => {
            const checked = !!el.checked;
            setSyncAndNotify(patchFor(checked), messageFor(checked));
        });
    };

    bind(showDownloadToggle, v => ({ showDownload: v }), v => ({ event: "showDownload", showDownloadValue: v }));
    bind(autoRedirectToggle, v => ({ autoRedirect: v }), v => ({ event: "autoRedirect", autoRedirectValue: v }));
    bind(autoUnmute, v => ({ autoUnmute: v }), v => ({ event: "autoMute", autoUnmuteValue: v }));
    bind(autoReelsToggle, v => ({ autoReelsStart: v }), v => ({ event: "autoReelsStart", autoReelsValue: v }));
    bind(progressBarToggle, v => ({ showProgressBar: v }), v => ({ event: "showProgressBar", showProgressBarValue: v }));
    bind(anonStoryToggle, v => ({ anonStoryViewer: v }), v => ({ event: "anonStoryViewer", anonStoryViewerValue: v }));
    bind(noSeenToggle, v => ({ noSeenMessages: v }), v => ({ event: "noSeenMessages", noSeenMessagesValue: v }));
    bind(stealthModeToggle, v => ({ stealthMode: v }), v => ({ event: "stealthMode", stealthModeValue: v }));
    bind(feedCarouselArrowsToggle, v => ({ feedCarouselArrows: v }), v => ({ event: "feedCarouselArrows", feedCarouselArrowsValue: v }));
    bind(autoFeedScrollToggle, v => ({ autoFeedScroll: v }), v => ({ event: "autoFeedScroll", autoFeedScrollValue: v }));
    bind(feedArrowNavigationToggle, v => ({ feedArrowNavigation: v }), v => ({ event: "feedArrowNavigation", feedArrowNavigationValue: v }));
    bind(instagramAdBlockerToggle, v => ({ instagramAdBlocker: v }), v => ({ event: "instagramAdBlocker", instagramAdBlockerValue: v }));
    bind(spacePauseToggle, v => ({ spacePause: v }), v => ({ event: "spacePause", spacePauseValue: v }));
    bind(keyboardSuiteToggle, v => ({ keyboardSuite: v }), v => ({ event: "keyboardSuite", keyboardSuiteValue: v }));
    bind(videoSpeedToggle, v => ({ videoSpeedEnabled: v }), v => ({ event: "videoSpeedEnabled", videoSpeedEnabledValue: v }));
    bind(bestQualityToggle, v => ({ bestQualityMode: v }), v => ({ event: "bestQualityMode", bestQualityModeValue: v }));
    bind(enterLoveToggle, v => ({ enterLoveReact: v }), v => ({ event: "enterLoveReact", enterLoveReactValue: v }));
    bind(browserQuickSaveToggle, v => ({ browserQuickSave: v }), v => ({ event: "browserQuickSave", browserQuickSaveValue: v }));

    if (keyboardSeekToggle) {
        keyboardSeekToggle.addEventListener("change", () => {
            if (keyboardSeekToggle.checked && keyboardSeek3Toggle) keyboardSeek3Toggle.checked = false;
            const seek5 = !!keyboardSeekToggle.checked;
            const seek3 = seek5 ? false : !!keyboardSeek3Toggle?.checked;
            setSyncAndNotify({ keyboardSeek: seek5, keyboardSeek3: seek3 }, { event: "keyboardSeekMode", keyboardSeekValue: seek5, keyboardSeek3Value: seek3 });
        });
    }
    if (keyboardSeek3Toggle) {
        keyboardSeek3Toggle.addEventListener("change", () => {
            if (keyboardSeek3Toggle.checked && keyboardSeekToggle) keyboardSeekToggle.checked = false;
            const seek3 = !!keyboardSeek3Toggle.checked;
            const seek5 = seek3 ? false : !!keyboardSeekToggle?.checked;
            setSyncAndNotify({ keyboardSeek: seek5, keyboardSeek3: seek3 }, { event: "keyboardSeekMode", keyboardSeekValue: seek5, keyboardSeek3Value: seek3 });
        });
    }
}

if (focusModeToggle) {
    focusModeToggle.onclick = () => {
        const payload = { event: "focusMode", focusModeValue: focusModeToggle.checked };
        api.runtime.sendMessage(payload);
        sendToActiveInstagramTab(payload);
    };
}


spacePauseToggle.onclick = () => {
    api.runtime.sendMessage({ event: "spacePause", spacePauseValue: spacePauseToggle.checked });
};

keyboardSuiteToggle.onclick = () => {
    api.runtime.sendMessage({ event: "keyboardSuite", keyboardSuiteValue: keyboardSuiteToggle.checked });
};

videoSpeedToggle.onclick = () => {
    api.runtime.sendMessage({ event: "videoSpeedEnabled", videoSpeedEnabledValue: videoSpeedToggle.checked });
};

bestQualityToggle.onclick = () => {
    api.runtime.sendMessage({ event: "bestQualityMode", bestQualityModeValue: bestQualityToggle.checked });
};

enterLoveToggle.onclick = () => {
    api.runtime.sendMessage({ event: "enterLoveReact", enterLoveReactValue: enterLoveToggle.checked });
};


speedButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
        const speed = Number(btn.dataset.speed);
        videoSpeedToggle.checked = true;
        updateSpeedButtons(speed);
        api.runtime.sendMessage({ event: "videoSpeed", videoSpeedValue: speed });
    });
});

startButton.addEventListener("click", () => {
    const isTurningOn = !startButton.classList.contains("running");
    startButtonText.textContent = isTurningOn ? "Stop" : "Start";
    startButton.classList.toggle("running", isTurningOn);
    document.querySelector(".status-pill")?.classList.toggle("off", !isTurningOn);
    api.storage.sync.set({ applicationIsOn: isTurningOn });

    api.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || !tabs[0]) return;
      api.tabs.sendMessage(tabs[0].id, {
        event: "toggleMaster",
        enabled: isTurningOn,
      });
    });
});


installLiveToggleSync();

// Native popup scrolling restored. No custom wheel smoothing.
// === Local Downloader Setup UI ===
const downloaderSetupCard = document.getElementById("downloaderSetupCard");
const downloadSetupButton = document.getElementById("downloadSetupButton");
const downloadInstallerButton = document.getElementById("downloadInstallerButton");
const copySetupButton = document.getElementById("copySetupButton");
const checkDownloaderButton = document.getElementById("checkDownloaderButton");
const importCookiesButton = document.getElementById("importCookiesButton");
const openDownloadFolderButton = document.getElementById("openDownloadFolderButton");
const manualCookieBox = document.getElementById("manualCookieBox");
const manualCookieTextarea = document.getElementById("manualCookieTextarea");
const saveManualCookiesButton = document.getElementById("saveManualCookiesButton");
const clearManualCookiesButton = document.getElementById("clearManualCookiesButton");
const resetDefaultsButton = document.getElementById("resetDefaultsButton");
const downloaderStatusPill = document.getElementById("downloaderStatusPill");
const toggleSetupCardButton = document.getElementById("toggleSetupCardButton");
const SETUP_CARD_COLLAPSED_KEY = "isfSetupCardCollapsed";

function setSetupCardVisible(visible, message, state = "needs-setup") {
    if (!downloaderSetupCard) return;
    downloaderSetupCard.classList.toggle("hidden", !visible);
    downloaderSetupCard.classList.remove("checking", "ready", "needs-setup");
    downloaderSetupCard.classList.add(state);
    const title = downloaderSetupCard.querySelector(".setup-heading-line strong");
    const p = downloaderSetupCard.querySelector(".setup-copy > p");
    const label = state === "checking" ? "Checking" : state === "ready" ? "Ready" : "Needed";
    if (title) {
        title.textContent = state === "checking"
            ? "Checking Local Downloader…"
            : state === "ready"
                ? "Local Downloader Ready"
                : "Local Downloader Setup";
    }
    if (downloaderStatusPill) {
        downloaderStatusPill.textContent = label;
        downloaderStatusPill.className = `status-chip ${state}`;
    }
    if (p && message) p.textContent = message;
}


function applySetupCardCollapsed(collapsed) {
    if (!downloaderSetupCard) return;
    downloaderSetupCard.classList.toggle("collapsed", !!collapsed);
    if (toggleSetupCardButton) {
        toggleSetupCardButton.textContent = collapsed ? "+" : "−";
        toggleSetupCardButton.setAttribute("aria-expanded", String(!collapsed));
        toggleSetupCardButton.setAttribute("aria-label", collapsed ? "Expand setup tray" : "Minimize setup tray");
        toggleSetupCardButton.title = collapsed ? "Expand setup tray" : "Minimize setup tray";
    }
}

function loadSetupCardCollapsedPreference() {
    try {
        const saved = localStorage.getItem(SETUP_CARD_COLLAPSED_KEY);
        const collapsed = saved === null ? true : saved === "1";
        applySetupCardCollapsed(collapsed);
    } catch (_) {
        applySetupCardCollapsed(true);
    }
}

function toggleSetupCardCollapsed() {
    if (!downloaderSetupCard) return;
    const next = !downloaderSetupCard.classList.contains("collapsed");
    applySetupCardCollapsed(next);
    try {
        localStorage.setItem(SETUP_CARD_COLLAPSED_KEY, next ? "1" : "0");
    } catch (_) {}
}

function checkNativeDownloader() {
    if (!downloaderSetupCard) return;
    setSetupCardVisible(true, "Scanning local downloader and Instagram cookies…", "checking");
    api.runtime.sendMessage({ type: "ISF_CHECK_NATIVE_DOWNLOADER" }, (res) => {
        if (api.runtime.lastError || !res || !res.installed) {
            setSetupCardVisible(true, "Helper not found — downloads still work through Browser Quick Save. For highest-quality videos and full carousels, expand this card, choose one setup method, then reload and check status.", "needs-setup");
            return;
        }

        if (res.needsUpdate) {
            setSetupCardVisible(true, `Downloader helper is old (${res.helperVersion || "unknown"}); minimum is 5.18.12. Run setup again to update it. Quick Save keeps working meanwhile.`, "needs-setup");
            return;
        }

        if (!res.cookiePayload?.hasSessionId && !res.response?.manualSessionId) {
            setSetupCardVisible(true, "Downloader is installed, but no Instagram login cookie was found. Log into Instagram, then check status. Quick Save keeps working meanwhile.", "needs-setup");
            return;
        }

        const cookieSource = res.response?.manualSessionId ? "manual cookies" : "extension cookies";
        const info = res.response || {};
        const folder = info.folder || info.downloadFolder || "your download folder";
        const auth = info.lastAuthMethod && info.lastAuthMethod !== "none yet" ? ` Last used: ${info.lastAuthMethod}.` : "";
        setSetupCardVisible(true, `Ready using ${cookieSource}. Downloads save to ${folder}.${auth}`, "ready");
    });
}


async function getGeneratedSetupScript() {
    const response = await fetch(api.runtime.getURL("setup_downloader.ps1.tmpl"));
    let script = await response.text();
    return script.replaceAll("__EXTENSION_ID__", api.runtime.id);
}

async function copySetupScript() {
    try {
        const script = await getGeneratedSetupScript();
        await navigator.clipboard.writeText(script);
        setSetupCardVisible(true, "Copied. Open PowerShell, paste it, press Enter. Then reload the extension and click Check Again.");
    } catch (error) {
        setSetupCardVisible(true, "Could not copy setup script: " + error.message);
    }
}

async function downloadInstallerExe() {
    try {
        const installerUrl = api.runtime.getURL("installer/InstaSuperFeatures_Setup.exe");
        const filename = "InstaSuperFeatures_Setup.exe";

        if (api.downloads && api.downloads.download) {
            api.downloads.download({
                url: installerUrl,
                filename,
                saveAs: true,
                conflictAction: "uniquify"
            }, () => {
                const err = api.runtime.lastError;
                if (err) {
                    setSetupCardVisible(true, "Could not download installer: " + err.message, "needs-setup");
                    return;
                }
                setSetupCardVisible(true, "Installer downloaded as InstaSuperFeatures_Setup.exe. Double-click it, finish setup, reload extension, then click Check Again. The installer now auto-detects this extension ID.", "needs-setup");
            });
            return;
        }

        const a = document.createElement("a");
        a.href = installerUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setSetupCardVisible(true, "Installer downloaded as InstaSuperFeatures_Setup.exe. Double-click it, finish setup, reload extension, then click Check Again. The installer now auto-detects this extension ID.", "needs-setup");
    } catch (error) {
        setSetupCardVisible(true, "Could not download installer: " + error.message, "needs-setup");
    }
}

async function downloadSetupScript() {
    try {
        const script = await getGeneratedSetupScript();

        const blob = new Blob([script], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const filename = "InstaSuperFeatures_Setup_Local_Downloader.ps1";

        if (api.downloads && api.downloads.download) {
            api.downloads.download({ url, filename, saveAs: true }, () => {
                setTimeout(() => URL.revokeObjectURL(url), 30000);
            });
        } else {
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 30000);
        }

        setSetupCardVisible(true, "Downloaded. Run it with PowerShell, then reload extension and click Check Again.");
    } catch (error) {
        setSetupCardVisible(true, "Could not create setup script: " + error.message);
    }
}

loadSetupCardCollapsedPreference();
if (toggleSetupCardButton) toggleSetupCardButton.addEventListener("click", toggleSetupCardCollapsed);
if (downloadInstallerButton) downloadInstallerButton.addEventListener("click", downloadInstallerExe);
if (copySetupButton) copySetupButton.addEventListener("click", copySetupScript);
if (downloadSetupButton) downloadSetupButton.addEventListener("click", downloadSetupScript);
if (checkDownloaderButton) checkDownloaderButton.addEventListener("click", checkNativeDownloader);
if (openDownloadFolderButton) {
    openDownloadFolderButton.addEventListener("click", () => {
        setSetupCardVisible(true, "Checking local helper before opening the folder…", "checking");
        api.runtime.sendMessage({ type: "ISF_CHECK_NATIVE_DOWNLOADER" }, (check) => {
            if (api.runtime.lastError || !check || !check.installed) {
                setSetupCardVisible(true, "Set up the local downloader first. Use Option 1 for the installer, or Option 2 for PowerShell.", "needs-setup");
                return;
            }
            if (check.needsUpdate) {
                setSetupCardVisible(true, `Downloader helper is old (${check.helperVersion || "unknown"}); minimum is 5.18.12. Run setup again to update it, then reload the extension.`, "needs-setup");
                return;
            }
            setSetupCardVisible(true, "Opening the configured download folder…", "checking");
            api.runtime.sendMessage({ type: "ISF_OPEN_DOWNLOAD_FOLDER" }, (res) => {
                if (api.runtime.lastError || res?.nativeUnavailable || !res) {
                    setSetupCardVisible(true, "Set up the local downloader first. Use Option 1 for the installer, or Option 2 for PowerShell.", "needs-setup");
                    return;
                }
                if (!res.ok) {
                    setSetupCardVisible(true, res.error || "Could not open the download folder.", "needs-setup");
                    return;
                }
                setSetupCardVisible(true, `Opened download folder: ${res.folder || "configured folder"}.`, "ready");
            });
        });
    });
}

function showManualCookieBox(message = "Paste cookies below, then click Save Pasted Cookies.") {
    applySetupCardCollapsed(false);
    if (manualCookieBox) manualCookieBox.classList.remove("hidden");
    if (manualCookieTextarea) {
        manualCookieTextarea.focus();
        manualCookieTextarea.select();
    }
    setSetupCardVisible(true, message, "needs-setup");
}

function saveCookieText(cookieText) {
    const text = String(cookieText || "").trim();
    if (text.length < 20) {
        setSetupCardVisible(true, "Cookie text is empty or too short. Paste Cookie-Editor JSON, raw Cookie header, or Netscape cookies.txt.", "needs-setup");
        showManualCookieBox();
        return;
    }

    setSetupCardVisible(true, "Importing cookies into the local downloader…", "checking");
    api.runtime.sendMessage({ type: "ISF_SAVE_MANUAL_COOKIES", cookieText: text }, (res) => {
        if (api.runtime.lastError || res?.nativeUnavailable || !res) {
            setSetupCardVisible(true, "Set up the local downloader first. Use Option 1 for the installer, or Option 2 for PowerShell.", "needs-setup");
            showManualCookieBox("Native downloader is not installed or setup failed. Run Copy Setup Script first.");
            return;
        }
        if (!res.ok) {
            const safeError = res?.error || "Cookie import failed. Check the format and try again.";
            setSetupCardVisible(true, safeError, "needs-setup");
            showManualCookieBox("Cookie import failed. Check the format, paste again, then click Save Pasted Cookies Locally.");
            return;
        }

        if (manualCookieTextarea) manualCookieTextarea.value = "";
        if (manualCookieBox) manualCookieBox.classList.add("hidden");

        setSetupCardVisible(true, `Cookies imported locally. manual cookies installed: true; manual sessionid found: ${!!res.hasSessionId}; cookie count: ${res.cookieCount || 0}; path: ${res.filepath || res.cookiesPath || "native cookies.txt"}.`, res.hasSessionId ? "ready" : "needs-setup");
        setTimeout(checkNativeDownloader, 800);
    });
}

async function importCookiesFromClipboard() {
    try {
        const cookieText = await navigator.clipboard.readText();
        if (!cookieText || cookieText.trim().length < 20) {
            showManualCookieBox("Clipboard is empty. Paste cookies into the box below, then click Save Pasted Cookies.");
            return;
        }
        saveCookieText(cookieText);
    } catch (error) {
        showManualCookieBox("Clipboard read was blocked by Chrome. Paste cookies into the box below, then click Save Pasted Cookies.");
    }
}

if (importCookiesButton) importCookiesButton.addEventListener("click", importCookiesFromClipboard);
if (saveManualCookiesButton) {
    saveManualCookiesButton.addEventListener("click", () => {
        saveCookieText(manualCookieTextarea?.value || "");
    });
}
if (clearManualCookiesButton) {
    clearManualCookiesButton.addEventListener("click", () => {
        if (manualCookieTextarea) manualCookieTextarea.value = "";
        if (manualCookieBox) manualCookieBox.classList.add("hidden");
    });
}


// === Recommended defaults + quick reset ===
const recommendedDefaults = {
    showDownload: true,
    autoRedirect: false,
    autoReelsStart: true,
    applicationIsOn: true,
    autoComments: false,
    autoUnmute: true,
    showProgressBar: true,
    anonStoryViewer: false,
    noSeenMessages: false,
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

function applyRecommendedDefaults() {
    api.storage.sync.set(recommendedDefaults, () => {
        showDownloadToggle.checked = true;
        autoRedirectToggle.checked = false;
        autoReelsToggle.checked = true;
        autoUnmute.checked = true;
        progressBarToggle.checked = true;
        anonStoryToggle.checked = false;
        noSeenToggle.checked = false;
        keyboardSeekToggle.checked = false;
        keyboardSeek3Toggle.checked = true;
        feedCarouselArrowsToggle.checked = true;
        autoFeedScrollToggle.checked = true;
        if (feedArrowNavigationToggle) feedArrowNavigationToggle.checked = true;
        instagramAdBlockerToggle.checked = true;
        spacePauseToggle.checked = true;
        keyboardSuiteToggle.checked = true;
        videoSpeedToggle.checked = true;
        bestQualityToggle.checked = true;
        enterLoveToggle.checked = true;
        if (browserQuickSaveToggle) browserQuickSaveToggle.checked = true;
        updateSpeedButtons(1);
        startButtonText.textContent = "Stop";
        startButton.classList.add("running");

        sendToActiveInstagramTab({ event: "toggleMaster", enabled: true });
        sendToActiveInstagramTab({ event: "showDownload", showDownloadValue: true });
        sendToActiveInstagramTab({ event: "showProgressBar", showProgressBarValue: true });
        sendToActiveInstagramTab({ event: "autoMute", autoUnmuteValue: true });
        sendToActiveInstagramTab({ event: "autoReelsStart", autoReelsValue: true });
        sendToActiveInstagramTab({ event: "keyboardSeekMode", keyboardSeekValue: false, keyboardSeek3Value: true });
        sendToActiveInstagramTab({ event: "feedCarouselArrows", feedCarouselArrowsValue: true });
        sendToActiveInstagramTab({ event: "autoFeedScroll", autoFeedScrollValue: true });
        sendToActiveInstagramTab({ event: "feedArrowNavigation", feedArrowNavigationValue: true });
        sendToActiveInstagramTab({ event: "instagramAdBlocker", instagramAdBlockerValue: true });
        sendToActiveInstagramTab({ event: "focusMode", focusModeValue: false });
        sendToActiveInstagramTab({ event: "spacePause", spacePauseValue: true });
        sendToActiveInstagramTab({ event: "keyboardSuite", keyboardSuiteValue: true });
        sendToActiveInstagramTab({ event: "videoSpeedEnabled", videoSpeedEnabledValue: true });
        sendToActiveInstagramTab({ event: "videoSpeed", videoSpeedValue: 1 });
        sendToActiveInstagramTab({ event: "bestQualityMode", bestQualityModeValue: true });
        sendToActiveInstagramTab({ event: "enterLoveReact", enterLoveReactValue: true });
        sendToActiveInstagramTab({ event: "browserQuickSave", browserQuickSaveValue: true });
    });
}

if (resetDefaultsButton) {
    resetDefaultsButton.addEventListener("click", () => {
        applyRecommendedDefaults();
        resetDefaultsButton.textContent = "Defaults Applied";
        setTimeout(() => { resetDefaultsButton.textContent = "Reset Recommended Defaults"; }, 1500);
    });
}

checkNativeDownloader();

