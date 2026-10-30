// Arc 1 Checks: the tests behind the setup window. Each one answers {ok, ms, note} and says where to fix it in the Firebase console.
import { ref, set, get, remove, onValue } from 'firebase/database';
import { systemPreferences, desktopCapturer } from 'electron';
import { Link } from './Firebase.js';
import { Current } from './Account.js';

const Wrong = Text => ({ ok: false, note: Text });

async function Timed(Work) {
  const Begin = Date.now();
  try { return Object.assign({ ok: true }, await Work(), { ms: Date.now() - Begin }); }
  catch (Failure) { return { ok: false, note: Failure.message, fix: Failure.fix, ms: Date.now() - Begin }; }
}

// Authentication: ask Google's sign-in service about a made-up account; the kind of refusal tells us what is switched on
async function Auth(Config) {
  return Timed(async () => {
    const Reply = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(Config.apiKey)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'arc-check@example.invalid', password: 'arc-check-password', returnSecureToken: false }),
    });
    const Body = await Reply.json().catch(() => ({}));
    const Said = (Body.error && Body.error.message) || '';
    if (/EMAIL_NOT_FOUND|INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD/.test(Said)) return { note: 'Email and password sign-in is on' };
    if (/OPERATION_NOT_ALLOWED/.test(Said)) throw Object.assign(new Error('Email/Password sign-in is off. Turn it on under Sign-in method.'), { fix: 'providers' });
    if (/CONFIGURATION_NOT_FOUND/.test(Said)) throw Object.assign(new Error('Authentication is not set up yet. Open it and press Get started.'), { fix: 'auth' });
    if (/API key/i.test(Said) || /API_KEY/.test(Said)) throw Object.assign(new Error('Firebase rejected the API key. Paste the config again.'), { fix: 'settings' });
    throw new Error(Said || `Unexpected answer (${Reply.status})`);
  });
}

// Database: is there one at this URL, and are its rules locked?
async function Database(Config) {
  return Timed(async () => {
    const Reply = await fetch(`${Config.databaseURL}/.json?shallow=true`);
    if (Reply.status === 401 || Reply.status === 403) return { note: 'Realtime Database found; its rules are locked' };
    if (Reply.status === 404) throw Object.assign(new Error('No Realtime Database at this address. Create one.'), { fix: 'database' });
    if (Reply.ok) throw Object.assign(new Error('Reachable, but its rules are open to everyone. Publish the Arc rules.'), { fix: 'rules' });
    throw new Error(`Unexpected answer (${Reply.status})`);
  });
}

const Signed = () => { const User = Current(); return User && User.emailVerified ? User : null; };
const Entry = (User, Id) => ref(Link.Database, `devices/${User.uid}/${Id}`);

// Rules: our own folder is writable, a made-up folder and someone else's are not
async function Rules(Id) {
  const User = Signed();
  if (!User) return Wrong('Sign in with a verified email first');
  return Timed(async () => {
    try { await set(Entry(User, Id), { name: 'arc-check', t: Date.now() }); }
    catch { throw Object.assign(new Error('The database refused this account. Publish the Arc rules.'), { fix: 'rules' }); }
    const Stray = ref(Link.Database, `rooms/${User.uid}/${Id}/arc_probe`);
    let Open = false;
    try { await set(Stray, { x: 1 }); Open = true; } catch {}
    if (Open) { await remove(Stray).catch(() => {}); throw Object.assign(new Error('Anything can be written here, so the Arc rules are not published yet.'), { fix: 'rules' }); }
    let Shared = false;
    const Other = ref(Link.Database, 'devices/arc-check-other-account/x');
    try { await set(Other, { name: 'x', t: 1 }); Shared = true; } catch {}
    if (Shared) { await remove(Other).catch(() => {}); throw Object.assign(new Error('Other accounts are not walled off. Publish the Arc rules.'), { fix: 'rules' }); }
    return { note: 'Rules are in place: only you can use your folder' };
  });
}

// Ping: five round trips to the database
async function Ping(Id) {
  const User = Signed();
  if (!User) return Wrong('Sign in with a verified email first');
  return Timed(async () => {
    const Times = [];
    await set(Entry(User, Id), { name: 'arc-check', t: Date.now() });
    for (let Round = 0; Round < 5; Round++) {
      const Start = Date.now();
      await set(ref(Link.Database, `devices/${User.uid}/${Id}/t`), Date.now());
      await get(ref(Link.Database, `devices/${User.uid}/${Id}/t`));
      Times.push(Date.now() - Start);
    }
    const Offset = await new Promise(Done => { const Off = onValue(ref(Link.Database, '.info/serverTimeOffset'), Snap => { Off(); Done(Snap.val()); }); });
    const Mean = Math.round(Times.reduce((A, B) => A + B, 0) / Times.length);
    return { ms: Mean, note: `${Math.min.apply(null, Times)} to ${Math.max.apply(null, Times)} ms per round trip, clock ${Math.abs(Math.round(Offset || 0))} ms off` };
  });
}

async function Display() {
  const Mac = process.platform === 'darwin';
  if (Mac && systemPreferences.getMediaAccessStatus('screen') !== 'granted') return Object.assign(Wrong('Screen recording is not allowed yet'), { fix: 'screen' });
  return Timed(async () => {
    const Found = await desktopCapturer.getSources({ types: ['screen'] });
    if (!Found.length) throw new Error('No screen was found to capture');
    return { note: `${Found.length} screen${Found.length > 1 ? 's' : ''} found` };
  });
}

async function Keyboard() {
  if (process.platform === 'darwin' && !systemPreferences.isTrustedAccessibilityClient(false)) return Object.assign(Wrong('Mouse and keyboard control is not allowed yet'), { fix: 'keys' });
  return { ok: true, ms: 0, note: process.platform === 'darwin' ? 'Allowed in Accessibility' : 'Nothing to allow on this system' };
}

export function Checks(Id) {
  return {
    auth: () => Auth(Link.Config),
    database: () => Database(Link.Config),
    rules: () => Rules(Id),
    ping: () => Ping(Id),
    screen: Display,
    input: Keyboard,
  };
}
