// Arc 1 Heartbeat: the UASM link. A viewer says hello, we answer welcome on a new epoch, and its heartbeat keeps the stream alive.
//   rooms/<uid>/<device>/hello   {sid, nonce, key, t}              viewer -> host: start (or restart) streaming to me
//   rooms/<uid>/<device>/welcome {nonce, epoch, w, h, fps, kbps, t} host -> viewer: the answer; frames carry this epoch
//   rooms/<uid>/<device>/hb      {sid, epoch, key, lag, q, t}       viewer -> host every 2 s; a changed `key` asks for a keyframe
import { onValue, set } from 'firebase/database';
import { Path } from './Firebase.js';

const Timeout = 9000;

export function Heartbeat(Room, Hooks) {
  let Viewer = null, At = 0, Nonce = null, Epoch = 0, Key = null, Stream = {};
  const Live = () => Viewer !== null && Date.now() - At < Timeout;

  onValue(Path(Room, 'hello'), Snap => {
    const Hello = Snap.val();
    if (!Hello || Hello.nonce === Nonce) return;                       // each hello carries a fresh nonce, so a reload can never look like "no change"
    Nonce = Hello.nonce; Viewer = Hello.sid; At = Date.now(); Key = Hello.key; Epoch = Date.now();
    const Mine = Epoch;
    Hooks.Hello(Hello.sid, Epoch).then(() => {
      if (Mine === Epoch) set(Path(Room, 'welcome'), Object.assign({}, Stream, { nonce: Hello.nonce, epoch: Epoch, t: Date.now() })).catch(() => {});
    });
  });

  onValue(Path(Room, 'hb'), Snap => {
    const Beat = Snap.val();
    if (!Beat || Beat.sid !== Viewer || Beat.epoch !== Epoch) return;
    At = Date.now();
    if (Beat.key !== Key) { Key = Beat.key; Hooks.Keyframe(); }
    Hooks.Feedback(Beat);
  });

  setInterval(() => { if (Viewer !== null && !Live()) { Viewer = null; Hooks.Gone(); } }, 3000);

  return { Live, Who: () => Viewer, Era: () => Epoch, Describe: Described => { Stream = Described; } };
}
