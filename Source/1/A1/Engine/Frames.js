// Arc 1 Frames: rooms/<uid>/<device>/v/<seq%96> {s, e, r, k, t, n, d} host -> viewer ring buffer.
//   s sequence, e epoch, r quality rung, k keyframe, t host time, n byte count, d the frame as UASM text.
import { set, remove } from 'firebase/database';
import { Path } from './Firebase.js';
import { Pack } from '../../Uasm.js';

const Slots = 96;

export function Frames(Room) {
  let Pending = 0;
  return {
    get Backlog() { return Pending; },
    Publish(Seq, Epoch, Rung, Key, Payload) {
      Pending++;
      set(Path(Room, `v/${Seq % Slots}`), { s: Seq, e: Epoch, r: Rung, k: Key ? 1 : 0, t: Date.now(), n: Payload.length, d: Pack(Payload) })
        .catch(Error => console.error('write failed', Error.code || Error.message))
        .finally(() => Pending--);
    },
    Clear: () => remove(Path(Room, 'v')).catch(() => {}),
  };
}
