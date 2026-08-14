# Insta Super Features v6

A polished Chrome extension for Instagram controls, built around resilient media extraction, local downloads with a zero-setup browser fallback, privacy helpers, and useful keyboard shortcuts.

## What's new in v6

- **Browser Quick Save** — downloads photos and videos with the browser's own downloads API, using CDN rendition URLs harvested passively from Instagram's own API/GraphQL JSON. Zero setup, no helper required, and immune to GraphQL `doc_id` rotation because the extension never calls Instagram's API itself.
- **Resilient media extraction** — a MAIN-world agent observes Instagram's fetch/XHR JSON responses (`video_versions`, `image_versions2`, `carousel_media`) instead of scraping brittle DOM attributes or `blob:` video sources.
- **Token-scoped bridge** — settings and harvest messages between worlds are validated against a per-page-load session token, so page scripts can't forge privacy flags or inject fake media records.
- **Event-driven scheduler** — the hot 900ms polling loop is gone. Feature passes are driven by a debounced MutationObserver plus a slow safety tick, with work paused while the tab is hidden.
- **Semver helper check** — the native helper is only flagged when it is genuinely older than the minimum (5.18.12), never force-reinstalled on version-string drift.
- **Hardened privacy guard** — story-seen and DM-seen blocking now covers more GraphQL mutation names, REST paths, `sendBeacon`, and WebSocket frames.

## Features

- Local Instagram photo, video, Reel, and carousel downloads through the native yt-dlp helper (highest quality, full carousels), with automatic Browser Quick Save fallback — and vice versa.
- Smooth Home feed navigation with Up/Down keys.
- Auto-scroll support for Reels and Home feed media.
- Floating download button for the current visible media; press **D** to download instantly.
- Progress bar, auto-unmute, playback speed controls, and keyboard shortcuts.
- Anonymous Story Viewer and Hide DM Seen privacy helpers.
- Sponsor/ad blocker, focus mode, best-quality mode, Enter love-react.
- Clean liquid-glass popup UI with local downloader setup and download folder access.

## Downloads: how the paths work

| Path | Setup | Best for |
| --- | --- | --- |
| Browser Quick Save | None | Photos and videos, saved to your browser Downloads |
| Native yt-dlp helper | One-time PowerShell/installer setup | Highest-quality videos (DASH merge) and full carousels |

The extension probes the helper lazily (60s cache) and routes each download to the best available path automatically.

## Local Downloader

The local downloader is installed separately from the extension popup.

Use one of the setup options:

1. Download Installer (recommended)
2. Copy Script for PowerShell

After setup finishes, reload the extension and click Check Status in the popup.

## Privacy

No real cookies, session IDs, account IDs, or private data are included in the extension source. Runtime cookies and manually imported cookies stay local on the user's computer for the native downloader helper. Media harvest only reads JSON responses the page already fetched; nothing is uploaded anywhere.

## Credit

Made with love by Arnob.
