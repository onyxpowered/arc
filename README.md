# Arc 1

Your computer in any browser. Install Arc on a Mac or Windows PC, sign in once, and it streams the whole screen as H.264 and takes mouse and keyboard back, relayed through your own free Firebase project. Arc also writes `Arc.html`, a single file you can open in any browser anywhere to reach that computer.

```
Computer:  Arc app (Electron: Chromium capture + WebCodecs H.264, native input)  <->  Firebase  <->  Arc.html (any browser)
```

## Set up your own Firebase project (free)

1. Create a project at console.firebase.google.com and add a web app.
2. Build > Authentication > Get started > enable **Email/Password**.
3. Build > Realtime Database > Create database, then deploy the rules: `cd Source/1 && firebase use --add && firebase deploy --only database`.
4. Copy the web config into `Source/1/Config.js` (start from `Config.Example.js`; it is never committed).

This runs on the free Spark plan.

## Build the apps

Requires Node 18+. On macOS, Xcode command line tools (`swiftc`) build the input helper.

```sh
cd Source/1
cp Config.Example.js Config.js   # then fill it in
npm install
node ../Source.js                # verify hashes, then compress into Source/1/Build
node ../Source.js pack           # also package Software/Arc.dmg and Software/Arc.exe
```

`Source.js` first checks every file against `Source/Hashes.json` and validates the tree; after you edit anything, run `node Source/Source.js seal`. It then compresses the code with the bundled Compressor (identifiers renamed to codes made only from A, R and C) and writes the app into `Source/1/Build`. The packaged apps are unsigned, and are not committed because they exceed GitHub's file size limit.

To try the app without packaging, after a build: `node_modules/.bin/electron Build`.

## Use it

1. Open Arc on the computer you want to reach.
2. Create an account (or sign in) and open the verification link Firebase emails you.
3. Allow screen recording and, on macOS, mouse and keyboard control.
4. Press **Save Arc.html**. Open that file in any browser, sign in, and pick the computer.

## Layout

```
Software/        Arc.dmg and Arc.exe, built by Source.js pack (not committed)
Source/
  Source.js      hash check, validation, Compressor build, packaging
  Hashes.json    sha256 of every source file
  Compressor/    the identifier compressor
  1/             Arc 1
    A1/          the computer: Engine.js (Electron main) + Engine/ (Firebase, Account, Device, Frames, Heartbeat, Input, Info, Keys, Export), Capture, Bridge, Keys.swift
    A2/          connections: Setup (app window) and Viewer (the exported Arc.html)
```

## UASM

UASM, Unicode Assembly, is how Arc moves video through a database that only stores text. A frame is raw H.264 bytes; UASM packs every 4 bytes into 5 of 85 printable characters (none needs a JSON escape), so a frame costs 25% extra instead of base64's 33%. The viewer unpacks it back to the same bytes before decoding. (Packing into higher Unicode characters would cost more: the database counts UTF-8 bytes, and every character above ASCII takes two to three.) The codec is `Source/1/Uasm.js`.

Under `rooms/<uid>/<device>/`:

| path | direction | contents |
| --- | --- | --- |
| `hello` | viewer to host | `{sid, nonce, key, t}` start, or restart, streaming to me |
| `welcome` | host to viewer | `{nonce, epoch, w, h, fps, kbps, t}` the answer; frames carry this epoch |
| `v/<seq%96>` | host to viewer | `{s, e, r, k, t, n, d}` sequence, epoch, quality rung, keyframe, host time, byte count, UASM data |
| `hb` | viewer to host | `{sid, epoch, key, lag, q, t}` every 2 s; a changed `key` asks for a keyframe |
| `in/<seq%64>` | viewer to host | `{sid, s, e: [events]}` input batches |

Plus `devices/<uid>/<device>` `{name, t}`, refreshed every 20 s, which is the list of your computers.

**Reconnecting.** Every attempt starts with a hello carrying a fresh random nonce. The host answers by clearing the frame ring, starting a new epoch and sending a keyframe, and only then writes `welcome`. The viewer starts listening for frames after the welcome, so a reload downloads nothing stale and can never look like "no change" to the host. If anything goes quiet (no welcome in 7 s, no frames in 5 s, the network drops or returns), the viewer starts over from hello with backoff, and a reload resumes the last computer on its own.

**Smooth under lag.** The host never encodes frames it cannot send: when its upload backs up, capture skips frames at the source, so the delta chain stays intact and the picture slows down instead of freezing. The viewer decodes every frame but paints only the newest one on each display refresh. It reports its delivery lag every 2 s, and the host steps quality down a rung at once (1366 px 3000 kbps, 1366 px 1800, 1024 px 1000, 854 px 500) and back up after 12 calm seconds.

## Security

Everything lives under your account's uid, and `Rules.json` only lets that account, with a verified email, read or write it. Sign-in is email, password and the emailed verification link. The host keeps its session in `A1/Session.json` (file mode 600, never committed); delete it to sign the host out. The Firebase web config is public by design, and the rules are what protect your data. The verification link is checked once per account, not on every sign-in; a second factor on every login needs Firebase multi-factor, which requires the paid Blaze plan.

## License

MIT
