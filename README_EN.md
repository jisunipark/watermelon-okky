# 🍉 WaterMelon

**Turn YouTube tracklists into Spotify playlists, in one click.**

[한국어](./README.md)

---

Ever found an amazing music compilation on YouTube and spent ages searching each song on Spotify one by one?

WaterMelon is a Chrome extension that automatically extracts song lists from YouTube videos and creates Spotify playlists instantly.

## Who is this for?

- 🎧 Music lovers who watch YouTube compilations, mixes, and DJ sets
- 📋 Anyone tired of manually copying tracklists from video descriptions
- 🔄 People who want a seamless YouTube → Spotify bridge

## Features

### Automatic Song Detection

WaterMelon scans the YouTube page and detects songs from multiple sources:

- **Video description** — Detects timestamp patterns like `0:00 Artist - Title`
- **Pinned comments** — Reads tracklists pinned by uploaders
- **Chapter markers** — Extracts song names from YouTube chapters
- **Playlists** — Parses video titles from YouTube playlist pages

### Spotify Integration

- One-time Spotify login to get started
- Extracted songs are automatically matched via Spotify Search API
- Match confidence shown with green (matched) / yellow (uncertain) indicators

### One-Click Playlist Creation

- Hit **Slice & Sync** to create your playlist
- Playlist name auto-generated from the video title
- Open directly in Spotify when done

## How to Use

1. Install the WaterMelon extension in Chrome
2. Open a YouTube music compilation video
3. Click the WaterMelon icon
4. Connect your Spotify account
5. Review the extracted songs and hit **Slice & Sync**
6. Enjoy your new playlist on Spotify

## Supported Formats

WaterMelon recognizes these timestamp patterns in descriptions and pinned comments:

```
00:00 Radiohead - Creep
03:45 The Beatles - Yesterday
1:23:45 Pink Floyd - Comfortably Numb
[00:00] Daft Punk - Get Lucky
```

## Installation (Developers)

```bash
git clone https://github.com/your-username/watermelon-okky.git
cd watermelon-okky
npm install
npm run build
```

1. Go to `chrome://extensions` in Chrome
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the project root folder

> You need to configure your Spotify Client ID in `secrets.js`.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Popup UI | React · TypeScript · Vite |
| Styling | Tailwind CSS v4 |
| Animation | Framer Motion |
| Song Extraction | Vanilla JavaScript (Content Script) |
| Auth | Spotify OAuth (Implicit Grant) |
| Platform | Chrome Extension Manifest V3 |

## License

MIT
