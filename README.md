# Arc 1

Your Mac's screen in a browser tab. Arc 1 streams the whole display as hardware H.264 and sends mouse and keyboard back, relayed through a Firebase Realtime Database. No port forwarding, no server of your own.

```
Mac:      Capture (ScreenCaptureKit + VideoToolbox + CGEvent)  <->  Engine.js  <->  Firebase RTDB
Browser:  Source/1/A2/Viewer.html (WebCodecs decode to canvas, input batching)  <->  Firebase RTDB
```

## Set up your own Firebase project (free)

1. Create a project at console.firebase.google.com and add a web app.
2. Build > Authentication > Get started > enable **Email/Password**.
3. Build > Realtime Database > Create database, then deploy the rules: `cd Source/1 && firebase use --add && firebase deploy --only database`.
4. Copy the web config into `Source/1/Config.js` (start from `Config.Example.js`; it is never committed).

This runs on the free Spark plan.

## Run

Requires macOS 13+, Xcode command line tools (`swiftc`), and Node 18+.

```sh
cd Source/1
cp Config.Example.js Config.js   # then fill it in
npm install
./Start.command
```

The first run builds `A1/Capture`, asks for your email and password (or creates the account), and Firebase emails a verification link. Open it, press Enter, and the host registers itself as a device. macOS will ask for Screen Recording and Accessibility permission for the terminal. Then open `A2/Viewer.html` in Chrome, Edge or Safari (`python3 -m http.server 5757 -d A2` also works), sign in with the same account, and pick your Mac from the list.

Tuning: `WIDTH` (1366), `FPS` (30), `KBPS` (3000), `ARC_DEBUG`.

## Layout

```
Software/        Arc.dmg, Arc.exe (TBD)
Source/1/        Arc 1
  A1/            host: Engine.js (capture) + Engine/ (Firebase: Room, Info, Frames, Heartbeat, Input) + Capture.swift
  A2/            viewer and connections (Viewer.html for now)
```

## Protocol

Under `rooms/<uid>/<device>/`, plus `devices/<uid>/<device>` `{name, t}` for the device list:

| path | direction | contents |
| --- | --- | --- |
| `v/<seq%96>` | host to viewer | `{s, k, t, d}` frame, `d` = base64 Annex-B H.264 |
| `hb` | viewer to host | `{sid, key, t}` heartbeat; a new `key` asks for a keyframe |
| `in/<seq%64>` | viewer to host | `{sid, s, e: [events]}` input batches |
| `info` | host to viewer | `{w, h, fps, kbps, t}` |

The host only streams while a viewer heartbeat is under 15 seconds old, drops delta frames when the uplink falls behind, and resyncs on a keyframe.

## Security

Everything lives under your account's uid, and `Rules.json` only lets that account, with a verified email, read or write it. Sign-in is email, password and the emailed verification link. The host keeps its session in `A1/Session.json` (file mode 600, never committed); delete it to sign the host out. The Firebase web config is public by design, and the rules are what protect your data. The verification link is checked once per account, not on every sign-in; a second factor on every login needs Firebase multi-factor, which requires the paid Blaze plan.

## License

MIT
