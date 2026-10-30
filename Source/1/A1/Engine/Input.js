// Arc 1 Input: rooms/<room>/in/<seq%64> {sid, s, e: [events]} viewer -> host. Only the live viewer's batches, each once.
import { onChildAdded, onChildChanged, remove } from 'firebase/database';
import { Path } from './Firebase.js';

export function Input(Room, Viewer, Event) {
  const Seen = {};
  const Take = Snap => {
    const Batch = Snap.val();
    if (!Batch || !Array.isArray(Batch.e) || Batch.sid !== Viewer()) return;
    if ((Seen[Batch.sid] ?? -1) >= Batch.s) return;
    Seen[Batch.sid] = Batch.s;
    Batch.e.forEach(Event);
  };
  onChildAdded(Path(Room, 'in'), Take); onChildChanged(Path(Room, 'in'), Take);
  return { Clear: () => remove(Path(Room, 'in')).catch(() => {}) };
}
