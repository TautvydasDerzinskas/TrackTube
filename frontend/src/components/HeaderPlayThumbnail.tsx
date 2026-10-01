import { ReactNode } from 'react';
import { Avatar, Box, IconButton, Tooltip } from '@mui/material';
import { PlayArrow as PlayArrowIcon, Pause as PauseIcon } from '@mui/icons-material';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PlaylistVideo } from '../api/youtube';
import { usePlayer } from '../contexts/PlayerContext';

interface HeaderPlayThumbnailProps {
  icon: ReactNode;
  // The page's playable tracks, already filtered/sorted the way the list
  // below shows them — that's the queue the button plays.
  tracks: PlaylistVideo[];
}

// Header icon square for the virtual All Tracks/Favourites/History pages,
// with the same play/pause button PlaylistDetailPage's header has — except
// only revealed while hovering the square itself. Counts as "this page is
// playing" when playback was started from this page and the current track
// is one of the ones listed here (so the Favourites view of All Tracks
// doesn't claim a non-favourite that's playing).
export function HeaderPlayThumbnail({ icon, tracks }: HeaderPlayThumbnailProps) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { nowPlaying, isAudioPlaying, handleTogglePlay, isShuffle } = usePlayer();
  const currentTrack = nowPlaying?.originPath === pathname
    ? tracks.find(v => v.id === nowPlaying.videoId)
    : undefined;
  const isPlaying = Boolean(currentTrack) && isAudioPlaying;

  const handlePlay = () => {
    if (tracks.length === 0) return;
    // Already playing from here — pause/resume the current track rather
    // than jumping to a new (possibly random) one.
    const startTrack = currentTrack
      ?? (isShuffle ? tracks[Math.floor(Math.random() * tracks.length)] : tracks[0]);
    handleTogglePlay(startTrack.playlistId ?? '', startTrack, tracks);
  };

  return (
    <Box sx={{ position: 'relative', flexShrink: 0, '&:hover .header-play-overlay': { opacity: 1, pointerEvents: 'auto' } }}>
      <Avatar variant="rounded" sx={{ width: 96, height: 72, borderRadius: 2 }}>
        {icon}
      </Avatar>
      <Tooltip title={isPlaying ? t('playlists.videoList.pause') : t('playlists.videoList.play')}>
        <span>
          <IconButton className="header-play-overlay" disabled={tracks.length === 0} onClick={handlePlay}
            sx={{
              position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
              bgcolor: 'rgba(0,0,0,0.55)', color: '#fff',
              opacity: 0, pointerEvents: 'none', transition: 'opacity 0.15s ease',
              '&:hover': { bgcolor: 'rgba(0,0,0,0.65)' },
            }}>
            {isPlaying ? <PauseIcon sx={{ fontSize: 28 }} /> : <PlayArrowIcon sx={{ fontSize: 28 }} />}
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  );
}
