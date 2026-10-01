import { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button, Chip, Box, CircularProgress, Alert,
} from '@mui/material';
import { Check as CheckIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { playlistsApi, Playlist, PlaylistVideo } from '../api/youtube';
import { useToast } from '../contexts/ToastContext';

interface AddToPlaylistDialogProps {
  // The playlist this was opened from, and the row in it — used once on open
  // to find which playlists already contain the track (GET .../used-in).
  playlistId: string;
  video: PlaylistVideo;
  onClose: () => void;
  // Called on close if the track was taken out of the very playlist it was
  // opened from, so that list can drop the row (same contract as
  // TrackContextMenu's onDeleted).
  onRemovedFromCurrent?: (videoId: string) => void;
}

// Lists the user's own 'created' playlists (the only kind whose contents are
// theirs to edit — see the backend's PUT/DELETE .../tracks/:youtubeId) as
// toggleable tags. Each click applies immediately; a failed request flips
// its tag back.
export function AddToPlaylistDialog({ playlistId, video, onClose, onRemovedFromCurrent }: AddToPlaylistDialogProps) {
  const { t } = useTranslation();
  const { showSuccess, showError } = useToast();
  const [playlists, setPlaylists] = useState<Playlist[] | 'loading' | 'error'>('loading');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([playlistsApi.getAll(), playlistsApi.getUsedIn(playlistId, video.id)])
      .then(([{ playlists: all }, { usedIn }]) => {
        setPlaylists(all.filter(p => p.origin === 'created'));
        setSelected(new Set(usedIn.map(p => p.id)));
      })
      .catch(() => setPlaylists('error'));
  }, [playlistId, video.id]);

  const toggle = async (playlist: Playlist) => {
    if (pending.has(playlist.id)) return;
    const name = playlist.customName ?? playlist.title;
    const adding = !selected.has(playlist.id);
    const flip = (set: Set<string>, on: boolean) => {
      const next = new Set(set);
      if (on) next.add(playlist.id); else next.delete(playlist.id);
      return next;
    };
    setSelected(prev => flip(prev, adding));
    setPending(prev => flip(prev, true));
    try {
      if (adding) await playlistsApi.addTrackToPlaylist(playlist.id, video.youtubeId);
      else await playlistsApi.removeTrackFromPlaylist(playlist.id, video.youtubeId);
      showSuccess(t(adding ? 'playlists.videoList.addToPlaylistDialog.added' : 'playlists.videoList.addToPlaylistDialog.removed', { name }));
    } catch {
      setSelected(prev => flip(prev, !adding));
      showError(t('playlists.videoList.addToPlaylistDialog.error', { name }));
    } finally {
      setPending(prev => flip(prev, false));
    }
  };

  const handleClose = () => {
    const openedFromEditable = Array.isArray(playlists) && playlists.some(p => p.id === playlistId);
    if (openedFromEditable && !selected.has(playlistId)) onRemovedFromCurrent?.(video.id);
    onClose();
  };

  return (
    <Dialog open onClose={handleClose} maxWidth="xs" fullWidth onClick={e => e.stopPropagation()}>
      <DialogTitle>{t('playlists.videoList.addToPlaylistDialog.title')}</DialogTitle>
      <DialogContent>
        {playlists === 'loading' && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={28} /></Box>
        )}
        {playlists === 'error' && <Alert severity="error">{t('playlists.videoList.addToPlaylistDialog.failedToLoad')}</Alert>}
        {Array.isArray(playlists) && playlists.length === 0 && (
          <DialogContentText>{t('playlists.videoList.addToPlaylistDialog.empty')}</DialogContentText>
        )}
        {Array.isArray(playlists) && playlists.length > 0 && (
          <>
            <DialogContentText sx={{ mb: 2 }}>
              {t('playlists.videoList.addToPlaylistDialog.hint', { title: video.title })}
            </DialogContentText>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {playlists.map(p => {
                const active = selected.has(p.id);
                return (
                  <Chip
                    key={p.id}
                    label={p.customName ?? p.title}
                    icon={active ? <CheckIcon /> : undefined}
                    color={active ? 'primary' : 'default'}
                    variant={active ? 'filled' : 'outlined'}
                    disabled={pending.has(p.id)}
                    onClick={() => toggle(p)}
                  />
                );
              })}
            </Box>
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose}>{t('common.close')}</Button>
      </DialogActions>
    </Dialog>
  );
}
