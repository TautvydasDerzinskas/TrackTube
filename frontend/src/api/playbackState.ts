import client from './client';

export interface PersistedQueueEntry {
  playlistId: string;
  videoId: string;
}

// 'one' loops the current track; 'all' wraps the queue back to its start
// once the last track ends.
export type RepeatMode = 'off' | 'one' | 'all';

export interface PlaybackStateDTO {
  playlistId: string;
  videoId: string;
  positionSeconds: number;
  isShuffle: boolean;
  repeatMode: RepeatMode;
  // 0–1. Unlike everything else here it outlives a cleared session — see
  // get() below.
  volume: number;
  originPath: string;
  queue: PersistedQueueEntry[];
  history: PersistedQueueEntry[];
}

// What a save actually needs to send varies by call site (see
// PlayerContext.tsx) — queue/history are only included when they've
// changed, so lightweight heartbeat/track-advance writes don't resend a
// potentially large queue; the backend leaves the stored value untouched
// when they're omitted.
export type SavePlaybackStatePayload = Omit<PlaybackStateDTO, 'queue' | 'history'> & {
  queue?: PersistedQueueEntry[];
  history?: PersistedQueueEntry[];
};

export const playbackStateApi = {
  save: async (state: SavePlaybackStatePayload): Promise<void> => {
    await client.post('/playback-state', state);
  },
  // `volume` comes back even when `state` is null (nothing to resume),
  // since closing the mini player doesn't reset it.
  get: async (): Promise<{ state: PlaybackStateDTO | null; volume: number }> => {
    const { data } = await client.get<{ state: PlaybackStateDTO | null; volume: number }>('/playback-state');
    return data;
  },
  clear: async (): Promise<void> => {
    await client.post('/playback-state/clear');
  },
};
