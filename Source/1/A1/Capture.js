// Arc 1 Capture: grabs the main display (Chromium), encodes H.264 in hardware (WebCodecs) and hands frames to the Engine.
//   Engine -> here: 'live' (a viewer is watching), 'key' (send a keyframe), 'pace' (false: skip frames, the uplink is behind), 'rung' (new quality).
//   here -> Engine: 'frame' (type 2 = key, 1 = delta, data, rung), 'info', 'note'.
let Watching = false, Paced = true, WantKey = true, Encoder = null, Last = null, LastAt = 0, Aspect = 9 / 16, Rung = null;

function Encode(Picture) {
  if (!Watching || !Paced || !Encoder || Encoder.encodeQueueSize > 4) return;
  Encoder.encode(Picture, { keyFrame: WantKey });
  WantKey = false;
  LastAt = Date.now();
}

function Packet(Chunk) {
  const Data = new Uint8Array(Chunk.byteLength);
  Chunk.copyTo(Data);
  Arc.Send('frame', Chunk.type === 'key' ? 2 : 1, Data, Rung.i);
}

// a new rung changes size, bitrate and frame rate; the next frame is a keyframe
function Tune(Next) {
  Rung = Next;
  const Wide = Next.w & ~1, High = Math.round(Wide * Aspect) & ~1;
  Encoder.configure({ codec: 'avc1.42002a', width: Wide, height: High, bitrate: Next.kbps * 1000, framerate: Next.fps, hardwareAcceleration: 'prefer-hardware', avc: { format: 'annexb' }, latencyMode: 'realtime' });
  WantKey = true;
  Arc.Send('info', { w: Wide, h: High, fps: Next.fps, kbps: Next.kbps });
}

async function Begin(First) {
  const Media = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 } });
  const Track = Media.getVideoTracks()[0], Size = Track.getSettings();
  Aspect = Size.height / Size.width;
  Encoder = new VideoEncoder({ output: Packet, error: Failure => Arc.Send('note', 'encoder: ' + Failure.message) });
  Tune(First);
  Pump(new MediaStreamTrackProcessor({ track: Track }).readable.getReader());   // runs on; Begin returns once capture has started
}

async function Pump(Reader) {
  for (;;) {
    const Read = await Reader.read();
    if (!Read.value) break;
    Last?.close();
    Last = Read.value;
    Encode(Last);
  }
  Arc.Send('note', 'capture ended');
}

// a still screen delivers no frames: re-encode the last one so the stream (and late joiners) stay alive
setInterval(() => { if (Last && Watching && Date.now() - LastAt > 900) Encode(Last); }, 500);

Arc.On('live', Value => { Watching = Value; if (Value) { WantKey = true; if (Last) Encode(Last); } });
Arc.On('key', () => { WantKey = true; if (Last) Encode(Last); });
Arc.On('pace', Value => { Paced = Value; });
Arc.On('rung', Next => { if (Encoder && (!Rung || Next.i !== Rung.i)) { Tune(Next); if (Last) Encode(Last); } else if (Encoder) { WantKey = true; if (Last) Encode(Last); } });
globalThis.ArcBegin = Begin;
