import { prisma } from './prisma';
import { isPacing, getSyncPhase } from './syncService';

// How many track thumbnails a playlist's mosaic cover is built from (see the
// frontend's MosaicThumbnail) — the newest tracks, most recent first.
export const MOSAIC_SIZE = 10;

// Not every row has a stored thumbnail (yt-dlp's flat playlist listing
// doesn't always include one), but every track is a YouTube video, so its
// standard still is always there to fall back on.
function thumbnailFor(r: { youtubeId: string; thumbnailUrl: string | null }): string {
  return r.thumbnailUrl ?? `https://i.ytimg.com/vi/${r.youtubeId}/default.jpg`;
}

// Dedupes by youtubeId (All Tracks/Favourites/History can list the same
// track from several playlists). Expects rows already in "newest first" order.
export function pickMosaicThumbnails(rows: { youtubeId: string; thumbnailUrl: string | null }[]): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const r of rows) {
    if (seen.has(r.youtubeId)) continue;
    seen.add(r.youtubeId);
    urls.push(thumbnailFor(r));
    if (urls.length === MOSAIC_SIZE) break;
  }
  return urls;
}

// Newest MOSAIC_SIZE thumbnails for each playlist in one query. A synced
// playlist's rows all share the same addedAt (inserted in one batch), so
// ties fall back to playlist order — the top of the playlist.
async function mosaicThumbnailsByPlaylist(playlistIds: string[]): Promise<Map<string, string[]>> {
  const rows = await prisma.$queryRaw<{ playlistId: string; youtubeId: string; thumbnailUrl: string | null }[]>`
    SELECT "playlistId", "youtubeId", "thumbnailUrl" FROM (
      SELECT "playlistId", "youtubeId", "thumbnailUrl",
        ROW_NUMBER() OVER (PARTITION BY "playlistId" ORDER BY "addedAt" DESC, "position" ASC) AS rn
      FROM "playlist_videos"
      WHERE "playlistId" = ANY(${playlistIds}::text[])
        AND "isAvailable" = true
        AND "downloadStatus" NOT IN ('removed', 'deleted')
    ) ranked
    WHERE rn <= ${MOSAIC_SIZE}
    ORDER BY "playlistId", rn`;
  const map = new Map<string, string[]>();
  for (const r of rows) {
    const list = map.get(r.playlistId) ?? [];
    list.push(thumbnailFor(r));
    map.set(r.playlistId, list);
  }
  return map;
}

/** Attach download stats (counts, total size, total playback duration, in-flight video) to playlist rows. */
export async function withDownloadStats<T extends { id: string; videoCount: number }>(playlists: T[]) {
  if (playlists.length === 0) {
    return playlists.map((p) => (
      { ...p, downloadedCount: 0, failedCount: 0, totalSize: 0, totalDurationSec: 0, currentVideo: null, isPacing: false, syncPhase: null, mosaicThumbnails: [] as string[] }
    ));
  }

  const [stats, downloading, mosaics] = await Promise.all([
    prisma.playlistVideo.groupBy({
      by: ['playlistId', 'downloadStatus', 'isAvailable'],
      where: { playlistId: { in: playlists.map((p) => p.id) } },
      _count: { id: true },
      _sum: { fileSize: true, duration: true },
    }),
    prisma.playlistVideo.findMany({
      where: { playlistId: { in: playlists.map((p) => p.id) }, downloadStatus: 'downloading' },
      select: { playlistId: true, title: true, position: true },
    }),
    mosaicThumbnailsByPlaylist(playlists.map((p) => p.id)),
  ]);

  const map = new Map<string, { done: number; failed: number; unavailable: number }>();
  const sizeMap = new Map<string, number>();
  // Only counts actually-downloaded videos, same as totalSize above — this
  // is "how much can you actually listen to right now," not the nominal
  // length of everything nominally in the playlist.
  const durationMap = new Map<string, number>();
  for (const s of stats) {
    const entry = map.get(s.playlistId) ?? { done: 0, failed: 0, unavailable: 0 };
    if (!s.isAvailable) {
      entry.unavailable += s._count.id;
    } else if (s.downloadStatus === 'done') {
      entry.done += s._count.id;
      sizeMap.set(s.playlistId, (sizeMap.get(s.playlistId) ?? 0) + (s._sum.fileSize ?? 0));
      durationMap.set(s.playlistId, (durationMap.get(s.playlistId) ?? 0) + (s._sum.duration ?? 0));
    } else if (s.downloadStatus === 'failed') {
      entry.failed += s._count.id;
    }
    map.set(s.playlistId, entry);
  }

  const currentVideoMap = new Map<string, { title: string; position: number }>();
  for (const v of downloading) {
    currentVideoMap.set(v.playlistId, { title: v.title, position: v.position });
  }

  return playlists.map((p) => {
    const s = map.get(p.id) ?? { done: 0, failed: 0, unavailable: 0 };
    return {
      ...p,
      videoCount: Math.max(0, p.videoCount - s.unavailable),
      downloadedCount: s.done,
      failedCount: s.failed,
      totalSize: sizeMap.get(p.id) ?? 0,
      totalDurationSec: durationMap.get(p.id) ?? 0,
      currentVideo: currentVideoMap.get(p.id) ?? null,
      isPacing: isPacing(p.id),
      syncPhase: getSyncPhase(p.id),
      mosaicThumbnails: mosaics.get(p.id) ?? [],
    };
  });
}
