// Arc 1 Engine: runs the native capture helper (whole screen, hardware H.264) and relays it through Engine/ (Firebase).
//   Capture frames: [type u8][len u32 BE][ptsMs u64 BE][payload]; type 0 = info JSON, 1 = delta, 2 = key.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Room } from './Engine/Room.js';
import { Info } from './Engine/Info.js';
import { Frames } from './Engine/Frames.js';
import { Heartbeat } from './Engine/Heartbeat.js';
import { Input } from './Engine/Input.js';

const Here = path.dirname(fileURLToPath(import.meta.url));
const Env = process.env;
const Width = +Env.WIDTH || 1366, Fps = +Env.FPS || 30, Kbps = +Env.KBPS || 3000;
const Code = Room();
const Stamp = () => new Date().toISOString().slice(11, 19);

let Child = null, Seq = Date.now(), NeedKey = true;
const Send = Message => Child?.stdin.write(JSON.stringify(Message) + '\n');
const Frame = Frames(Code);

const Beat = Heartbeat(Code, {
  Connected: Id => console.log(Stamp(), 'viewer connected', Id),
  Gone: () => { console.log(Stamp(), 'viewer gone'); Send({ t: 'reset' }); },
  Keyframe: () => { NeedKey = true; Send({ t: 'keyframe' }); },
});
const Keys = Input(Code, () => Beat.Viewer, Event => Send(Event));

function Start() {
  Child = spawn(path.join(Here, 'Capture'), ['--w', Width, '--fps', Fps, '--kbps', Kbps], { stdio: ['pipe', 'pipe', 'inherit'] });
  Child.stdin.on('error', () => {});
  let Buffer_ = Buffer.alloc(0);
  Child.stdout.on('data', Data => {
    Buffer_ = Buffer.concat([Buffer_, Data]);
    while (Buffer_.length >= 13) {
      const Length = Buffer_.readUInt32BE(1);
      if (Buffer_.length < 13 + Length) break;
      const Type = Buffer_[0], Payload = Buffer_.subarray(13, 13 + Length);
      Buffer_ = Buffer_.subarray(13 + Length);
      Packet(Type, Payload);
    }
  });
  Child.on('exit', Code_ => { console.log(Stamp(), 'helper exited', Code_, '- restarting'); Child = null; setTimeout(Start, 1500); });
}

function Packet(Type, Payload) {
  if (Type === 0) { const Stream = JSON.parse(Payload.toString()); console.log(Stamp(), 'capture', JSON.stringify(Stream)); Info(Code, Stream); return; }
  if (!Beat.Live()) { NeedKey = true; return; }
  const Key = Type === 2;
  if (NeedKey && !Key) return;                                  // wait for a keyframe after a gap
  if (Frame.Pending > 24 && !Key) { NeedKey = true; Send({ t: 'keyframe' }); return; } // uplink is behind: drop deltas, resync on a keyframe
  if (Key) NeedKey = false;
  Frame.Publish(Seq++, Key, Payload);
}

await Frame.Clear(); await Keys.Clear();
Start();
console.log(`Arc 1 host up. Room ${Code}\nViewer: file://${path.join(Here, '..', 'A2', 'Viewer.html')}#${Code}`);
const Bye = () => { try { Child?.kill(); } catch {} process.exit(0); };
process.on('SIGINT', Bye); process.on('SIGTERM', Bye);
