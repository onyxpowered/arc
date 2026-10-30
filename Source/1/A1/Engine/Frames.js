// Arc 1 Frames: rooms/<room>/v/<seq%96> {s, k, t, d} host -> viewer ring buffer, d = base64 Annex-B.
import { set, remove } from 'firebase/database';
import { Path } from './Firebase.js';

const Slots = 96;

export function Frames(Room) {
  let Pending = 0;
  return {
    get Pending() { return Pending; },
    Publish(Seq, Key, Payload) {
      Pending++;
      set(Path(Room, `v/${Seq % Slots}`), { s: Seq, k: Key ? 1 : 0, t: Date.now(), d: Payload.toString('base64') })
        .catch(Error => console.error('write failed', Error.code || Error.message))
        .finally(() => Pending--);
    },
    Clear: () => remove(Path(Room, 'v')).catch(() => {}),
  };
}
