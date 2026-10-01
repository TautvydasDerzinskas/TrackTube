import { ReactNode, useMemo } from 'react';
import { Avatar, Box } from '@mui/material';

interface MosaicThumbnailProps {
  // Newest-first track thumbnails (up to 10 — see the backend's MOSAIC_SIZE).
  urls: string[];
  // Anything stable per playlist (its id, or a fixed key for the virtual
  // lists) — together with `urls` it seeds the layout, so a cover stays put
  // across renders and only reshuffles once its tracks actually change.
  seed: string;
  width: number;
  height: number;
  // In theme sx units, same as the Avatar it replaces.
  borderRadius: number;
  // The playlist's type icon (synced, generated, created, favourites, ...) —
  // drawn on top of the mosaic, and on its own for an empty playlist.
  icon: ReactNode;
}

interface Tile { x: number; y: number; w: number; h: number }

// Small, fast, deterministic PRNG (mulberry32) seeded from an FNV-1a string
// hash — Math.random would reshuffle the cover on every render.
function seededRandom(seed: string): () => number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Random guillotine split: keep cutting one of the larger tiles in two
// (across its longer side, off-centre) until there's one tile per image.
// Always picking among the biggest keeps tiles roughly even in size, so no
// thumbnail ends up as an unreadable sliver.
function buildLayout(count: number, width: number, height: number, rand: () => number): Tile[] {
  const tiles: Tile[] = [{ x: 0, y: 0, w: width, h: height }];
  while (tiles.length < count) {
    tiles.sort((a, b) => b.w * b.h - a.w * a.h);
    const index = Math.floor(rand() * Math.min(2, tiles.length));
    const tile = tiles[index];
    const ratio = 0.35 + rand() * 0.3;
    const [first, second]: Tile[] = tile.w >= tile.h
      ? [{ ...tile, w: tile.w * ratio }, { ...tile, x: tile.x + tile.w * ratio, w: tile.w * (1 - ratio) }]
      : [{ ...tile, h: tile.h * ratio }, { ...tile, y: tile.y + tile.h * ratio, h: tile.h * (1 - ratio) }];
    tiles.splice(index, 1, first, second);
  }
  // Snapped to whole pixels (each edge rounded, so neighbours still share
  // it exactly) — fractional edges anti-alias into visible hairline seams.
  return tiles.map(t => {
    const x = Math.round(t.x);
    const y = Math.round(t.y);
    return { x, y, w: Math.round(t.x + t.w) - x, h: Math.round(t.y + t.h) - y };
  });
}

export const MOSAIC_SIZE = 10;

// Client-side counterpart of the backend's pickMosaicThumbnails, for pages
// that already hold the track list: first MOSAIC_SIZE distinct tracks with a
// track, in the order given (pass them newest/most-recent first). A track
// without a stored thumbnail falls back to its video's standard still, same
// as the backend.
export function pickMosaicThumbnails(videos: { youtubeId: string; thumbnailUrl: string | null }[]): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const v of videos) {
    if (seen.has(v.youtubeId)) continue;
    seen.add(v.youtubeId);
    urls.push(v.thumbnailUrl ?? `https://i.ytimg.com/vi/${v.youtubeId}/default.jpg`);
    if (urls.length === MOSAIC_SIZE) break;
  }
  return urls;
}

const YOUTUBE_THUMB = /^https?:\/\/i\d?\.ytimg\.com\/vi(?:_webp)?\/([\w-]{11})\//;

// Every tile is tiny, so YouTube's smallest still (default.jpg, 120×90, a
// few KB) is plenty — far less to download and decode than the hq/maxres
// image a track usually stores. That still is 4:3 with the 16:9 video
// letterboxed into it, so the image is positioned to cover the tile with
// its 16:9 band only, cropping the black bars out. Anything that isn't a
// YouTube thumbnail is just used as-is.
function tileImage(url: string, tile: Tile): { src: string; style: React.CSSProperties } {
  const match = YOUTUBE_THUMB.exec(url);
  if (!match) return { src: url, style: { inset: 0, width: '100%', height: '100%', objectFit: 'cover' } };
  const scale = Math.max(tile.w / 16, tile.h / 9);
  const imgW = 16 * scale;
  const imgH = 12 * scale;
  return {
    src: `https://i.ytimg.com/vi/${match[1]}/default.jpg`,
    style: { left: (tile.w - imgW) / 2, top: (tile.h - imgH) / 2, width: imgW, height: imgH },
  };
}

// Playlist cover built from its newest tracks' thumbnails, laid out as a
// randomised mosaic of seamless tiles so it reads as one image. Composed in
// the browser from images it already caches rather than rendered server-side,
// so nothing gets generated or stored, and the cover simply follows the
// tracks as they change.
export function MosaicThumbnail({ urls, seed, width, height, borderRadius, icon }: MosaicThumbnailProps) {
  const key = urls.join('|');
  const tiles = useMemo(() => {
    const rand = seededRandom(`${seed}|${key}`);
    const layout = buildLayout(urls.length, width, height, rand);
    // Shuffle which thumbnail lands in which tile too, not just the cuts.
    const shuffled = [...urls];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return layout.map((tile, i) => ({ tile, ...tileImage(shuffled[i], tile) }));
    // `key` stands in for `urls` so a new-but-equal array doesn't recompute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, key, width, height]);

  if (urls.length === 0) {
    return (
      <Avatar variant="rounded" sx={{ width, height, borderRadius }}>
        {icon}
      </Avatar>
    );
  }

  return (
    <Box sx={{ position: 'relative', width, height, borderRadius, overflow: 'hidden', bgcolor: 'action.selected', flexShrink: 0 }}>
      {tiles.map(({ tile, src, style }, i) => (
        <Box key={i} sx={{ position: 'absolute', left: tile.x, top: tile.y, width: tile.w, height: tile.h, overflow: 'hidden' }}>
          <img src={src} alt="" loading="lazy" decoding="async" draggable={false}
            style={{ position: 'absolute', display: 'block', ...style }}
            onError={e => { e.currentTarget.style.visibility = 'hidden'; }} />
        </Box>
      ))}
      {/* Light wash + drop shadow keep the icon legible on any mix of
          thumbnails without hiding the mosaic behind it. */}
      <Box sx={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        bgcolor: 'rgba(0,0,0,0.25)', color: '#fff', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))',
      }}>
        {icon}
      </Box>
    </Box>
  );
}
