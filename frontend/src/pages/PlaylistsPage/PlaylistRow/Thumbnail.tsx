import { Playlist } from '../../../api/youtube';
import { MosaicThumbnail } from '../../../components/MosaicThumbnail';
import { PlaylistTypeIcon } from '../utils';

export function Thumbnail({ playlist }: { playlist: Playlist }) {
  return (
    <MosaicThumbnail urls={playlist.mosaicThumbnails} seed={playlist.id}
      width={56} height={40} borderRadius={1} icon={<PlaylistTypeIcon origin={playlist.origin} />} />
  );
}
