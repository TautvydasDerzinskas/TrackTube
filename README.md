<div align="center">

<img src="frontend/public/assets/logo-full-light.svg" alt="TrackTube" width="500">

<h3>Turn your YouTube playlists into a high-quality music library.</h3>

<p>
For people who discover music on YouTube and have built huge collections of playlists.
TrackTube turns those playlists into a structured, self-hosted music library you actually own.
</p>

<p>
  <a href="https://github.com/TautvydasDerzinskas/TrackTube/actions/workflows/docker-publish.yml">
    <img src="https://github.com/TautvydasDerzinskas/TrackTube/actions/workflows/docker-publish.yml/badge.svg" alt="Build & Publish">
  </a>
  <img src="https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white" alt="Docker">
  <img src="https://img.shields.io/badge/React-61DAFB?logo=react&logoColor=black" alt="React">
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL">
</p>

</div>

## About

If you use **YouTube to discover music**, chances are your playlists have slowly turned into a massive music collection.

TrackTube is built specifically for that use case.

It lets you **import your YouTube playlists and turn them into a high-quality, organized music library** running on your own server.

Instead of treating YouTube playlists as the final destination for your music collection, TrackTube uses them as the starting point — helping you build a proper library with downloaded audio, metadata, artwork, analysis, and playback.

### The idea

```text
YouTube
  │
  ├── Discover music
  ├── Save to playlists
  └── Build huge collections
          │
          ▼
      TrackTube
          │
          ├── Import playlists
          ├── Find / download high-quality audio
          ├── Organize your library
          ├── Fetch metadata & artwork
          ├── Analyze tracks
          └── Play your music
          │
          ▼
   Your self-hosted
    music library
```

## Features

- 📺 **YouTube playlist focused** — use your existing YouTube playlists as your music collection
- 📥 **Playlist importing** — turn large YouTube playlists into a local music library
- 🎵 **High-quality audio** — build your library from high-quality audio sources
- 🏷️ **Metadata & artwork** — keep your collection organized and properly tagged
- 🎧 **Audio analysis** — analyze your music collection
- 🔎 **Music discovery** — keep using YouTube as your primary way of discovering music
- 🎶 **Self-hosted playback** — listen to your collection from your own server
- 📱 **Mobile application** — access your library from Android
- 🐳 **Docker-based** — deploy the entire platform on your own server

## Screenshots

<!-- Screenshots will be added here -->

## Installation

### Docker

```bash
git clone https://github.com/TautvydasDerzinskas/TrackTube.git
cd TrackTube
cp .env.example .env
```

Configure `.env`, then:

```bash
docker compose up -d
```

See the Compose files and `.env.example` for available configuration options.

## Components

| Component | Description |
|-----------|-------------|
| `frontend` | TrackTube web application |
| `backend` | TrackTube API |
| `audio-analysis` | Audio analysis service |
| `mobile` | Android application |
| `db` | PostgreSQL database |
| `slskd` | Soulseek integration |
| `bgutil-provider` | YouTube token provider |

## Tech Stack

- **Frontend:** React, TypeScript, Vite, Material UI
- **Backend:** Node.js, TypeScript, Express, Prisma
- **Database:** PostgreSQL
- **Audio analysis:** Python
- **Mobile:** React Native / Expo
- **Deployment:** Docker Compose

## License

See [LICENSE](LICENSE) for license information.