import { useEffect, useRef, useState } from 'react';
import { Box, Paper, Typography, IconButton, Tooltip } from '@mui/material';
import { YouTube as YouTubeIcon, OpenInNew as OpenInNewIcon, Close as CloseIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { usePlayer } from '../contexts/PlayerContext';
import { youtubeWatchUrl } from '../pages/PlaylistsPage/utils';

const POPUP_WIDTH = 320;
const HEADER_HEIGHT = 36;
const VIDEO_HEIGHT = Math.round((POPUP_WIDTH * 9) / 16);

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

// Movable floating popup that embeds the actual YouTube player (see
// PlayerContext's youtubePopup state) so a track's original clip can be
// watched without leaving the app — replaces the old "opens youtube.com in
// a new tab" links throughout the app (TrackContextMenu, RenameTrackDialog,
// CloseHqCandidatesDialog, RemixLinks, DiscoverTracks). Mounted once in
// AppLayout, same as MiniPlayer/PendingHqCandidatesModal, so it survives
// route changes and whichever dialog/menu opened it.
export function YoutubePopup() {
  const { t } = useTranslation();
  const { youtubePopup, closeYoutubePopup } = usePlayer();
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  // Only re-seeds `pos` on a fresh open (null -> non-null) — swapping the
  // video while already open (e.g. clicking another track's link) keeps
  // wherever the user last dragged it to.
  const wasOpenRef = useRef(false);

  useEffect(() => {
    const isOpen = Boolean(youtubePopup);
    if (isOpen && !wasOpenRef.current) {
      setPos({
        x: clamp(window.innerWidth - POPUP_WIDTH - 24, 8, window.innerWidth - POPUP_WIDTH - 8),
        y: clamp(window.innerHeight - HEADER_HEIGHT - VIDEO_HEIGHT - 96, 8, window.innerHeight - HEADER_HEIGHT - 8),
      });
    }
    wasOpenRef.current = isOpen;
  }, [youtubePopup]);

  if (!youtubePopup || !pos) return null;

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const { startX, startY, origX, origY } = dragRef.current;
    setPos({
      x: clamp(origX + (e.clientX - startX), 8, window.innerWidth - POPUP_WIDTH - 8),
      y: clamp(origY + (e.clientY - startY), 8, window.innerHeight - HEADER_HEIGHT - 8),
    });
  };
  const handlePointerUp = () => {
    dragRef.current = null;
  };

  return (
    <Paper elevation={8} sx={{
      position: 'fixed', top: pos.y, left: pos.x, width: POPUP_WIDTH, zIndex: 1250,
      overflow: 'hidden', borderRadius: 2,
    }}>
      <Box
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        sx={{
          display: 'flex', alignItems: 'center', gap: 0.5, px: 1, height: HEADER_HEIGHT,
          bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider',
          cursor: 'move', userSelect: 'none',
        }}
      >
        <YouTubeIcon sx={{ fontSize: 18, color: 'error.main', flexShrink: 0 }} />
        <Typography variant="caption" noWrap sx={{ flexGrow: 1, minWidth: 0 }}>
          {youtubePopup.title}
        </Typography>
        <Tooltip title={t('playlists.youtubePopup.openOnYoutube')}>
          <IconButton
            size="small"
            component="a"
            href={youtubeWatchUrl(youtubePopup.videoId)}
            target="_blank"
            rel="noopener noreferrer"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <OpenInNewIcon sx={{ fontSize: 15 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title={t('common.close')}>
          <IconButton size="small" onClick={closeYoutubePopup} onPointerDown={(e) => e.stopPropagation()}>
            <CloseIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </Box>
      <Box sx={{ width: POPUP_WIDTH, height: VIDEO_HEIGHT, bgcolor: 'common.black' }}>
        <iframe
          key={youtubePopup.videoId}
          width="100%"
          height="100%"
          style={{ display: 'block', border: 0 }}
          src={`https://www.youtube-nocookie.com/embed/${youtubePopup.videoId}?autoplay=1`}
          title={youtubePopup.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </Box>
    </Paper>
  );
}
