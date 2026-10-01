import { ReactNode } from 'react';
import { Avatar, Box, IconButton, Tooltip } from '@mui/material';
import { PlayArrow as PlayArrowIcon, Pause as PauseIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PlaylistVideo } from '../../api/youtube';
import { usePlayer } from '../../contexts/PlayerContext';

interface VirtualPlaylistThumbnailProps {
  icon: ReactNode;
  // Where the row itself leads (and where playback is started from, so the
  // mini player's title link comes back here).
  path: string;
  // Whether what's playing right now was started from this entry — drives
  // the play/pause icon and makes a click pause/resume instead of restarting.
  isActive: boolean;
  disabled: boolean;
  // Resolves the queue to play, already filtered to playable tracks and in
  // the same order the destination page shows them by default.
  loadQueue: () => Promise<PlaylistVideo[]>;
}

// Icon placeholder for the fixed Favourites/History/All Tracks entries, with
// the same play/pause overlay PlaylistRow's thumbnail has — except it's
// revealed by hovering the thumbnail itself rather than the whole row.
// Playback mirrors PlaylistsPage's handlePlayFirst: navigate straight away,
// start playing once the queue resolves.
export function VirtualPlaylistThumbnail({ icon, path, isActive, disabled, loadQueue }: VirtualPlaylistThumbnailProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { nowPlaying, isAudioPlaying, handleTogglePlay, isShuffle } = usePlayer();
  const isPlaying = isActive && isAudioPlaying;

  const handlePlay = async (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(path);
    try {
      const queue = await loadQueue();
      if (queue.length === 0) return;
      // Already playing from here — toggle the current track rather than
      // jumping to a new (possibly random) one.
      const startTrack = isActive
        ? (queue.find(v => v.id === nowPlaying?.videoId) ?? queue[0])
        : (isShuffle ? queue[Math.floor(Math.random() * queue.length)] : queue[0]);
      handleTogglePlay(startTrack.playlistId ?? '', startTrack, queue);
    } catch {
      // navigation already happened — nothing else to do
    }
  };

  return (
    <Box onClick={e => e.stopPropagation()}
      sx={{ position: 'relative', flexShrink: 0, '&:hover .virtual-playlist-play-overlay': { opacity: 1, pointerEvents: 'auto' } }}>
      <Avatar variant="rounded" sx={{ width: 56, height: 40, borderRadius: 1 }}>
        {icon}
      </Avatar>
      <Tooltip title={isPlaying ? t('playlists.videoList.pause') : t('playlists.videoList.play')}>
        <span>
          <IconButton
            className="virtual-playlist-play-overlay"
            disabled={disabled}
            onClick={handlePlay}
            sx={{
              position: 'absolute', inset: 0, borderRadius: 1, p: 0,
              bgcolor: 'rgba(0,0,0,0.55)', color: '#fff',
              opacity: 0, pointerEvents: 'none', transition: 'opacity 0.15s ease',
              '&:hover': { bgcolor: 'rgba(0,0,0,0.65)' },
            }}
          >
            {isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  );
}
