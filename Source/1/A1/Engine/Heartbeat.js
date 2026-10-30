// Arc 1 Heartbeat: rooms/<room>/hb {sid, key, t} viewer -> host. While it changes we stream; a new `key` asks for a keyframe.
import { onValue } from 'firebase/database';
import { Path } from './Firebase.js';

const Timeout = 15000;

export function Heartbeat(Room, { Connected, Gone, Keyframe }) {
  let Viewer = null, At = 0, Key = null;
  const Live = () => Viewer && Date.now() - At < Timeout;
  onValue(Path(Room, 'hb'), Snap => {
    const Beat = Snap.val(); if (!Beat) return;
    if (!Live()) Connected(Beat.sid);
    Viewer = Beat.sid; At = Date.now();
    if (Beat.key !== Key) { Key = Beat.key; Keyframe(); }
  });
  setInterval(() => { if (Viewer && !Live()) { Viewer = null; Gone(); } }, 3000);
  return { Live, get Viewer() { return Viewer; } };
}
