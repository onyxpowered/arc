// Arc 1 Viewer: signs in, lists your computers, and shows the chosen one over UASM, reconnecting by itself.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, signOut } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getDatabase, ref as dref, set as dset, onChildAdded, onChildChanged, onValue } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { Unpack } from '../Uasm.js';
import { Loading } from './Loading.js';

// the Firebase project comes from the file itself: the Arc app writes it in when it saves this file
let config = null;
try { config = JSON.parse(document.getElementById('arc-config').textContent); } catch {}
const splash = Loading(config ? config.projectId : '');
splash.Step(0.15);
let booting = true;
const settle = () => { if (booting) { booting = false; splash.Step(1); splash.Finish(); } };
if (!config) {
  document.getElementById('msg').textContent = 'This file has no Firebase project in it. Save a fresh Arc.html from the Arc app on your computer.';
  document.getElementById('form').hidden = true;
  settle();
  throw new Error('no Firebase project in this file');
}

const app = initializeApp(config);
const auth = getAuth(app), rdb = getDatabase(app);
const $ = id => document.getElementById(id);
const screen = $('screen'), sx = screen.getContext('2d', { alpha: false }), hud = $('hud'), msg = $('msg'), stat = $('stat'), form = $('form'), bar = $('bar'), devs = $('devs');
const sid = Math.random().toString(36).slice(2, 10);
const rand = () => Math.random().toString(36).slice(2, 12);
const sleep = ms => new Promise(done => setTimeout(done, ms));

let room = '', user = null, devOff = null, live = false, link = null, wantBack = false;   // room = <uid>/<device>

const setStat = (kind, text) => { $('pill').className = 'pill ' + kind; stat.textContent = text; };
const say = (t, kind = 'busy') => { msg.textContent = t; $('state').className = 'status ' + kind; hud.classList.remove('hidden'); };
const showForm = () => { form.hidden = false; devs.hidden = true; $('again').hidden = true; $('out').hidden = true; $('email').focus(); };
const AuthErrors = { 'auth/invalid-credential': 'Wrong email or password.', 'auth/email-already-in-use': 'That email already has an account. Sign in instead.', 'auth/weak-password': 'Use a password of at least 6 characters.', 'auth/invalid-email': 'That email does not look right.', 'auth/too-many-requests': 'Too many tries. Wait a moment.', 'auth/operation-not-allowed': 'Email/password sign-in is not enabled in this Firebase project.', 'auth/configuration-not-found': 'Authentication is not set up in this Firebase project.', 'auth/network-request-failed': 'No connection to Firebase.' };
const fail = e => say(AuthErrors[e.code] || e.message, 'err');

// the top bar fades while you work and returns when the pointer moves
let fadeTimer = 0;
const wake = () => { bar.classList.remove('faded'); clearTimeout(fadeTimer); if (hud.classList.contains('hidden')) fadeTimer = setTimeout(() => bar.classList.add('faded'), 3000); };
addEventListener('pointermove', wake);
$('fs').onclick = () => { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.(); };

// ---- input: batched into rooms/<room>/in/<slot>, flushed ~60 times a second ----
let evBuf = [], absPos = null, whX = 0, whY = 0, inSeq = 0;
function flush() {
  const e = evBuf; evBuf = [];
  if (absPos) { e.push(absPos); absPos = null; }
  if (whX || whY) { e.push({ t: 'w', dx: whX, dy: whY }); whX = whY = 0; }
  if (e.length) dset(dref(rdb, `rooms/${room}/in/${inSeq % 64}`), { sid, s: inSeq++, e }).catch(() => {});
}
const push = o => { if (!live) return; evBuf.push(o); flush(); };
// the canvas is object-fit: contain, so map the pointer into the letterboxed picture
function norm(e) {
  const W = innerWidth, H = innerHeight, ar = screen.width / screen.height;
  let w = W, h = W / ar; if (h > H) { h = H; w = H * ar; }
  const x0 = (W - w) / 2, y0 = (H - h) / 2;
  return { x: Math.min(1, Math.max(0, (e.clientX - x0) / w)), y: Math.min(1, Math.max(0, (e.clientY - y0) / h)) };
}
addEventListener('mousemove', e => { if (live) absPos = Object.assign({ t: 'a' }, norm(e)); });
addEventListener('mousedown', e => { if (!live || hud.contains(e.target) || bar.contains(e.target)) return; absPos = null; evBuf.push(Object.assign({ t: 'a' }, norm(e))); push({ t: 'b', d: 1, b: e.button }); e.preventDefault(); screen.focus(); });
addEventListener('mouseup', e => { if (live) push({ t: 'b', d: 0, b: e.button }); });
addEventListener('wheel', e => { if (!live) return; const k = e.deltaMode === 1 ? 16 : 1; whX += e.deltaX * k; whY += e.deltaY * k; e.preventDefault(); }, { passive: false });
addEventListener('contextmenu', e => e.preventDefault());
const key = (e, d) => { if (!live) return; e.preventDefault(); if (e.repeat) { push({ t: 'k', d: 1, code: e.code }); return; } push({ t: 'k', d, code: e.code }); };
addEventListener('keydown', e => key(e, 1), true);
addEventListener('keyup', e => key(e, 0), true);
addEventListener('blur', () => { if (live) push({ t: 'reset' }); });
setInterval(() => { if (live) flush(); }, 16);

// ---- the UASM link: hello -> welcome -> frames. Anything that goes quiet restarts it from hello, with backoff. ----
const WelcomeWait = 7000;

function disconnect() {
  if (link) { link.dead = true; link.end(); link = null; }
  live = false; screen.style.display = 'none'; $('back').hidden = true;
}

async function connect(target, name) {
  disconnect();
  room = target; wantBack = false;
  try { localStorage.setItem('arc-last', target.split('/')[1]); } catch {}
  if (!('VideoDecoder' in window)) { say('This browser cannot decode video (WebCodecs missing). Use Chrome, Edge or Safari.', 'err'); return; }
  const mine = link = { dead: false, end: () => {}, want: () => {} };
  form.hidden = true; devs.hidden = true; $('out').hidden = true; $('again').hidden = true; $('back').hidden = false;
  let tries = 0;
  while (!mine.dead) {
    const streamed = await session(mine, name);
    if (mine.dead) return;
    if (!streamed) settle();                                                           // the first try failed: show the card and its status instead of the splash
    tries = streamed ? 0 : tries + 1;
    setStat('busy', 'Reconnecting');
    if (!live) say(`Waiting for ${name}…`);
    await sleep(Math.min(6000, 300 * 2 ** Math.min(tries, 5)) + Math.random() * 300);
  }
}

// one attempt: resolves (true if it streamed) when it ends for any reason
function session(mine, name) {
  return new Promise(done => {
    const timers = [], offs = [];
    let ended = false, streamed = false, epoch = 0, decoder = null, latest = null, lastSeq = -1, needKey = true, offset = Infinity, rung = -1;
    let shown = 0, rxBytes = 0, lastFrameAt = Date.now(), maxLag = 0, curLag = 0, keyReq = rand(), raf = 0, lastShown = 0, lastBytes = 0;
    const nonce = rand();

    const end = () => {
      if (ended) return;
      ended = true;
      timers.forEach(t => { clearInterval(t); clearTimeout(t); });
      offs.forEach(f => f());
      try { decoder?.close(); } catch {}
      latest?.close(); latest = null;
      cancelAnimationFrame(raf);
      live = false;
      done(streamed);
    };
    mine.end = end;

    const beat = () => dset(dref(rdb, `rooms/${room}/hb`), { sid, epoch, key: keyReq, lag: Math.round(maxLag), q: decoder ? decoder.decodeQueueSize : 0, t: Date.now() }).catch(() => {});
    const wantKey = () => { needKey = true; keyReq = rand(); beat(); };
    mine.want = () => { if (epoch) wantKey(); };

    function makeDecoder() {
      try { decoder?.close(); } catch {}
      decoder = new VideoDecoder({
        output: f => { if (ended) { f.close(); return; } latest?.close(); latest = f; },   // only the newest decoded frame is ever shown
        error: () => { if (!ended) { makeDecoder(); wantKey(); } },
      });
      decoder.configure({ codec: 'avc1.42002a', optimizeForLatency: true });
      needKey = true;
    }

    // paint at the display's pace; if frames arrive in a burst, the newest wins and the rest are dropped unseen
    function paint() {
      if (ended) return;
      if (latest) {
        if (screen.width !== latest.displayWidth || screen.height !== latest.displayHeight) { screen.width = latest.displayWidth; screen.height = latest.displayHeight; }
        sx.drawImage(latest, 0, 0); latest.close(); latest = null; shown++;
        if (!live) { live = true; streamed = true; screen.style.display = 'block'; hud.classList.add('hidden'); screen.focus(); wake(); settle(); }
      }
      raf = requestAnimationFrame(paint);
    }

    function onFrame(snap) {
      const v = snap.val();
      if (ended || !v || v.e !== epoch || v.s <= lastSeq) return;
      if (lastSeq !== -1 && v.s !== lastSeq + 1 && !needKey) wantKey();               // a gap: the delta chain is broken
      lastSeq = v.s;
      const now = Date.now();
      offset = Math.min(offset, now - v.t);                                             // clock skew cancels out; what is left is delivery delay
      curLag = now - v.t - offset; maxLag = Math.max(maxLag, curLag);
      lastFrameAt = now; rxBytes += v.n;
      const isKey = v.k === 1;
      if (isKey && v.r !== rung) { rung = v.r; makeDecoder(); }                         // a new quality rung starts a fresh decoder
      if (needKey && !isKey) return;
      if (isKey) needKey = false;
      if (!isKey && (curLag > 3000 || decoder.decodeQueueSize > 12)) { wantKey(); return; }
      try { decoder.decode(new EncodedVideoChunk({ type: isKey ? 'key' : 'delta', timestamp: v.t * 1000, data: Unpack(v.d, v.n) })); } catch { makeDecoder(); wantKey(); }
    }

    function attach() {
      if (booting) splash.Step(0.85);
      say(`Starting ${name}…`);
      makeDecoder();
      const vref = dref(rdb, `rooms/${room}/v`);
      offs.push(onChildAdded(vref, onFrame), onChildChanged(vref, onFrame));         // the host cleared the ring before welcoming us, so there is nothing old to download
      timers.push(setInterval(beat, 2000));
      timers.push(setInterval(() => {
        const quiet = Date.now() - lastFrameAt;
        if (quiet > (streamed ? 5000 : 9000)) { setStat('err', 'Waiting for host'); end(); return; }
        if (live) { setStat(maxLag > 600 ? 'busy' : 'ok', `${shown - lastShown} fps · ${(((rxBytes - lastBytes) * 8) / 1e6).toFixed(1)} Mbps · ${Math.round(curLag)} ms`); }
        lastShown = shown; lastBytes = rxBytes;
      }, 1000));
      lastFrameAt = Date.now();
      beat();
      raf = requestAnimationFrame(paint);
    }

    // 1) listen for the answer, 2) say hello with a fresh nonce, 3) frames follow on the epoch the host names
    say(`Connecting to ${name}…`); setStat('busy', 'Connecting');
    const wref = dref(rdb, `rooms/${room}/welcome`);
    offs.push(onValue(wref, snap => { const w = snap.val(); if (w && w.nonce === nonce && !epoch) { epoch = w.epoch; attach(); } }));
    let up = true;
    offs.push(onValue(dref(rdb, '.info/connected'), snap => { const now = snap.val() === true; if (up && !now) setStat('busy', 'Offline'); if (!up && now) end(); up = now; }));
    timers.push(setTimeout(() => { if (!epoch) end(); }, WelcomeWait));
    dset(dref(rdb, `rooms/${room}/hello`), { sid, nonce, key: keyReq, t: Date.now() }).then(() => { if (booting) splash.Step(0.7); }).catch(() => end());
  });
}

addEventListener('online', () => link?.end());
document.addEventListener('visibilitychange', () => { if (!document.hidden) link?.want(); });
$('back').onclick = () => { disconnect(); wantBack = true; gate(); };

// ---- account: email + password, then the emailed verification link; verified accounts see their computers ----
const creds = () => [$('email').value.trim(), $('pass').value];
form.onsubmit = async e => { e.preventDefault(); const [em, pw] = creds(); say('Signing in…'); try { await signInWithEmailAndPassword(auth, em, pw); } catch (x) { fail(x); form.hidden = false; } };
$('make').onclick = async () => { const [em, pw] = creds(); say('Creating your account…'); try { const c = await createUserWithEmailAndPassword(auth, em, pw); await sendEmailVerification(c.user); } catch (x) { fail(x); form.hidden = false; } };
$('again').onclick = async () => { await user.reload(); await user.getIdToken(true); gate(); };
$('out').onclick = () => signOut(auth);

const renderDevices = snap => {
  if (link) return;                                                                    // never draw over a live stream
  const all = snap.val() || {}, ids = Object.keys(all);
  devs.replaceChildren.apply(devs, ids.map(id => {
    const d = all[id], on = Date.now() - d.t < 60000, b = document.createElement('button');
    b.type = 'button'; b.className = 'dev' + (on ? ' on' : '');
    b.innerHTML = '<i class="dot"></i><span></span><small></small>';
    b.children[1].textContent = d.name; b.children[2].textContent = on ? 'Online' : 'Offline';
    b.onclick = () => connect(`${user.uid}/${id}`, d.name);
    return b;
  }));
  say(ids.length ? 'Choose a computer.' : 'No computers yet. Open Arc on one and sign in there.', ids.length ? 'ok' : 'busy');
  let lastId = '';
  try { lastId = localStorage.getItem('arc-last') || ''; } catch {}
  if (booting) splash.Step(0.6);
  if (!wantBack && lastId && all[lastId]) connect(`${user.uid}/${lastId}`, all[lastId].name);   // a reload picks up where it left off
  else settle();
};
function gate() {
  devOff?.(); devOff = null;
  if (!user) { disconnect(); say('Sign in to see your computers.'); settle(); return showForm(); }
  form.hidden = true; $('out').hidden = false;
  if (!user.emailVerified) { devs.hidden = true; $('again').hidden = false; settle(); return say(`We sent a verification link to ${user.email}. Open it, then come back.`); }
  $('again').hidden = true; devs.hidden = false;
  devOff = onValue(dref(rdb, `devices/${user.uid}`), renderDevices);
}
onAuthStateChanged(auth, u => { const same = user && u && user.uid === u.uid; user = u; if (u && booting) splash.Step(0.4); if (!same) gate(); });
