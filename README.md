# Arc 1

Your Mac's screen in a browser tab. Arc 1 streams the whole display as hardware H.264 and sends mouse and keyboard back, relayed through a Firebase Realtime Database. No port forwarding, no server of your own.

```
Mac:      Capture (ScreenCaptureKit + VideoToolbox + CGEvent)  <->  Engine.js  <->  Firebase RTDB
Browser:  Source/1/A2/Viewer.html (WebCodecs decode to canvas, input batching)  <->  Firebase RTDB
```

## Run

Requires macOS 13+, Xcode command line tools (`swiftc`), and Node 18+.

```sh
cd Source/1
cp Config.Example.js Config.js   # then fill in your own Firebase project
npm install
./Start.command
```

The first run builds `A1/Capture`, creates a random room code in `A1/Room.txt` and prints a viewer link. macOS will ask for Screen Recording and Accessibility permission for the terminal. Open `A2/Viewer.html#<room>` in Chrome, Edge or Safari. A static server also works: `python3 -m http.server 5757 -d A2`.

Tuning: `WIDTH` (1366), `FPS` (30), `KBPS` (3000), `ROOM`, `ARC_DEBUG`.

## Layout

```
Software/        Arc.dmg, Arc.exe (TBD)
Source/1/        Arc 1
  A1/            host: Engine.js (capture) + Engine/ (Firebase: Room, Info, Frames, Heartbeat, Input) + Capture.swift
  A2/            viewer and connections (Viewer.html for now)
```

## Protocol

Under `rooms/<room>/`:

| path | direction | contents |
| --- | --- | --- |
| `v/<seq%96>` | host to viewer | `{s, k, t, d}` frame, `d` = base64 Annex-B H.264 |
| `hb` | viewer to host | `{sid, key, t}` heartbeat; a new `key` asks for a keyframe |
| `in/<seq%64>` | viewer to host | `{sid, s, e: [events]}` input batches |
| `info` | host to viewer | `{w, h, fps, kbps, t}` |

The host only streams while a viewer heartbeat is under 15 seconds old, drops delta frames when the uplink falls behind, and resyncs on a keyframe.

## Security

The room code is the only secret. Anyone who has it can see and control the host Mac. The code is random, generated per machine and never committed, but treat it like a password: do not share the viewer link, and delete `A1/Room.txt` to rotate it. The Firebase web config in the source is public by design; access is limited by `Rules.json`, which allows only `rooms/<8-32 char code>`.

You run Arc 1 on your own free Firebase project: create one at console.firebase.google.com, add a web app, enable the Realtime Database, deploy `Rules.json`, and put the web config in `Source/1/Config.js` (never committed).

## License

MIT
