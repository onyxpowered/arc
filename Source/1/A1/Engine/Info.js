// Arc 1 Info: rooms/<room>/info {w, h, fps, kbps, t} describes the stream to the viewer.
import { set } from 'firebase/database';
import { Path } from './Firebase.js';

export const Info = (Room, Stream) => set(Path(Room, 'info'), { ...Stream, t: Date.now() }).catch(() => {});
