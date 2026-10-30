// Arc 1 Ladder: picks the stream quality from what the viewer reports. Steps down at once when it lags, up slowly after a calm stretch.
export const Rungs = [
  { i: 0, w: 1366, kbps: 3000, fps: 30 },
  { i: 1, w: 1366, kbps: 1800, fps: 30 },
  { i: 2, w: 1024, kbps: 1000, fps: 24 },
  { i: 3, w: 854, kbps: 500, fps: 15 },
];

export function Ladder(Change) {
  let Rung = 1, Calm = 0;
  return {
    Now: () => Rungs[Rung],
    Reset() { Rung = 1; Calm = 0; },
    // Beat: {lag: ms behind the host, q: frames waiting to decode}, every 2 s
    Report(Beat) {
      if (Beat.lag > 600 || Beat.q > 6) {
        Calm = 0;
        if (Rung < Rungs.length - 1) { Rung++; Change(Rungs[Rung]); }
      } else if (++Calm >= 6 && Rung > 0) {   // 12 calm seconds
        Calm = 0; Rung--; Change(Rungs[Rung]);
      }
    },
  };
}
