// Arc 1 Setup: the window that sets up your Firebase project, signs in, and establishes this computer.
import { Loading } from './Loading.js';

const Pick = Id => document.getElementById(Id);
const Splash = Loading('');
Splash.Step(0.1);

let Now = null, Where = null, Named = '', Was = false;
const Opened = new Set(), Seen = {}, Busy = new Set();

const Tests = [
  { Name: 'config', Title: 'Project settings' },
  { Name: 'auth', Title: 'Authentication' },
  { Name: 'database', Title: 'Realtime Database' },
  { Name: 'rules', Title: 'Security rules' },
  { Name: 'ping', Title: 'Ping' },
  { Name: 'screen', Title: 'Screen capture' },
  { Name: 'encoder', Title: 'Video encoder' },
  { Name: 'input', Title: 'Mouse and keyboard' },
];

// ---- tests ----
async function Probe(Name) {
  if (Name === 'config') return Now.project ? { ok: true, ms: 0, note: `Project ${Now.project.id}` } : { ok: false, ms: 0, note: 'Paste your web app config first' };
  if (Name === 'encoder') {
    const Begin = performance.now();
    try {
      const Hard = await VideoEncoder.isConfigSupported({ codec: 'avc1.42002a', width: 1366, height: 768, bitrate: 3e6, framerate: 30, hardwareAcceleration: 'prefer-hardware', avc: { format: 'annexb' }, latencyMode: 'realtime' });
      return { ok: !!Hard.supported, ms: Math.round(performance.now() - Begin), note: Hard.supported ? 'H.264 encoding is available' : 'This system cannot encode H.264' };
    } catch (Failure) { return { ok: false, ms: 0, note: Failure.message }; }
  }
  return Arc.Call('check', Name);
}

async function Test(Name) {
  if (Busy.has(Name)) return;
  Busy.add(Name); Rows(); Steps();
  Seen[Name] = await Probe(Name);
  Busy.delete(Name); Rows(); Steps();
}

async function RunAll() {
  Pick('run-all').disabled = true;
  for (const One of Tests) await Test(One.Name);
  Pick('run-all').disabled = false;
}

function Fix(Kind) {
  if (Kind === 'screen' || Kind === 'keys') return Arc.Call('allow', Kind).then(Refresh);
  if (Where && Where[Kind]) Arc.Call('open', Where[Kind]);
}

function Rows() {
  const Box = Pick('rows');
  Box.replaceChildren.apply(Box, Tests.map(One => {
    const Got = Seen[One.Name], Wait = Busy.has(One.Name);
    const Row = document.createElement('div');
    Row.className = 'row-test ' + (Wait ? 'busy' : Got ? (Got.ok ? 'ok' : 'err') : '');
    Row.innerHTML = '<i class="dot"></i><div class="what"><b></b><span></span></div><time></time>';
    Row.querySelector('b').textContent = One.Title;
    Row.querySelector('.what span').textContent = Wait ? 'Testing…' : Got ? Got.note || '' : 'Not tested yet';
    Row.querySelector('time').textContent = !Wait && Got && Got.ms ? Got.ms + ' ms' : '';
    if (Got && !Got.ok && Got.fix && !Wait) {
      const Button = document.createElement('button');
      Button.type = 'button'; Button.className = 'ghost small'; Button.textContent = 'Fix';
      Button.onclick = () => Fix(Got.fix);
      Row.appendChild(Button);
    }
    const Again = document.createElement('button');
    Again.type = 'button'; Again.className = 'ghost small'; Again.textContent = 'Test'; Again.disabled = Wait;
    Again.onclick = () => Test(One.Name);
    Row.appendChild(Again);
    return Row;
  }));
  const Done = Tests.filter(One => Seen[One.Name] && Seen[One.Name].ok).length;
  Pick('tests-short').textContent = `${Done} of ${Tests.length} pass`;
}

// ---- steps ----
const Order = ['project', 'auth', 'db', 'account', 'allow', 'computer'];

function Steps() {
  if (!Now) return;
  const Has = !!Now.project, Auth = Seen.auth, Base = Seen.database;
  const Kinds = {
    project: Has ? 'ok' : 'busy',
    auth: !Has ? 'locked' : Busy.has('auth') ? 'busy' : Auth ? (Auth.ok ? 'ok' : 'err') : 'busy',
    db: !Has ? 'locked' : Busy.has('database') ? 'busy' : Base ? (Base.ok ? 'ok' : 'err') : 'busy',
    account: !(Has && Auth && Auth.ok && Base && Base.ok) ? 'locked' : Now.verified ? 'ok' : Now.email ? 'busy' : 'busy',
    allow: !Now.verified ? 'locked' : Now.screen && Now.keys ? 'ok' : 'busy',
    computer: !(Now.verified && Now.screen) ? 'locked' : Now.streaming ? 'ok' : 'busy',
  };
  const Current = Order.find(Id => Kinds[Id] !== 'ok' && Kinds[Id] !== 'locked');
  Order.forEach(Id => {
    const Box = Pick('s-' + Id), Kind = Kinds[Id];
    Box.classList.remove('ok', 'busy', 'err', 'locked', 'open');
    if (Kind === 'locked') Box.classList.add('locked'); else Box.classList.add(Kind);
    if (Kind !== 'locked' && (Id === Current || Opened.has(Id))) Box.classList.add('open');
  });
  Pick('auth-note').textContent = !Has ? 'Waiting for a project.' : Busy.has('auth') ? 'Testing…' : Auth ? Auth.note : 'Not tested yet.';
  Pick('auth-short').textContent = Auth && !Busy.has('auth') ? (Auth.ok ? 'On' : 'Off') : '';
  Pick('db-note').textContent = !Has ? 'Waiting for a project.' : Busy.has('database') ? 'Testing…' : Base ? Base.note : 'Not tested yet.';
  Pick('db-short').textContent = Base && !Busy.has('database') ? (Base.ok ? 'Ready' : 'Not ready') : '';
}

function Draw(State) {
  Now = State;
  const Signed = !!State.email, Verified = State.verified, Ready = Verified && State.screen;
  Pick('config-fault').hidden = !(State.error && !Signed && !State.project) ; Pick('config-fault').textContent = State.error || '';
  Pick('fault').hidden = !(State.error && State.project); Pick('fault').textContent = State.error || '';

  Pick('project-new').hidden = !!State.project;
  Pick('project-set').hidden = !State.project;
  Pick('project-name').textContent = State.project ? State.project.id : '';
  Pick('project-line').textContent = State.project ? `Using ${State.project.id}.` : '';
  Pick('change-project').hidden = !!(State.project && State.project.built);
  if (State.project && Named !== State.project.id) {
    Named = State.project.id; Splash.Name(Named);
    Arc.Call('pages').then(Found => { Where = Found; });
    Test('auth'); Test('database');
  }

  Pick('who').textContent = State.email || '';
  Pick('form').hidden = Signed;
  Pick('verify').hidden = !Signed || Verified;
  Pick('leave').hidden = !Signed;
  Pick('screen-row').hidden = State.screen; Pick('keys-row').hidden = State.keys;
  Pick('restart').hidden = Pick('relaunch').hidden = !(State.mac && Verified && !State.screen);
  Pick('name').textContent = State.name;
  Pick('export').disabled = !Ready;
  Pick('line').textContent = State.streaming ? (State.viewer ? 'Online. A viewer is connected.' : 'Online. Waiting for a viewer.') : Ready ? 'Starting…' : 'Waiting for the steps above.';
  Pick('lead').textContent = State.streaming ? 'This computer is set up. You can close this window; Arc keeps running.' : 'Set up this computer once, then reach it from any browser.';
  if (!Verified) { if (Was) { delete Seen.rules; delete Seen.ping; } } else if (!Seen.rules && !Busy.has('rules')) Test('rules');   // signing out clears them; a plain redraw does not
  Was = Verified;
  Steps(); Rows();
}

// ---- actions ----
function Call() { return Arc.Call.apply(Arc, arguments).then(Draw); }
const Refresh = () => Arc.Call('state').then(Draw);
const Email = () => Pick('email').value.trim(), Password = () => Pick('pass').value;

Order.forEach(Id => { Pick('s-' + Id).querySelector('.head').onclick = () => { if (Pick('s-' + Id).classList.contains('locked')) return; if (Opened.has(Id)) Opened.delete(Id); else Opened.add(Id); Steps(); }; });
Pick('save-config').onclick = () => Call('config:save', Pick('config').value);
Pick('console').onclick = () => Arc.Call('open', 'https://console.firebase.google.com/');
Pick('open-overview').onclick = () => Where && Arc.Call('open', Where.overview);
Pick('change-project').onclick = () => { if (confirm('Switch to a different Firebase project? Arc will restart and ask for the new one.')) Arc.Call('config:change'); };
Pick('auth-open').onclick = () => Where && Arc.Call('open', Where.providers);
Pick('auth-test').onclick = () => Test('auth');
Pick('rules-open').onclick = () => Where && Arc.Call('open', Where.rules);
Pick('rules-copy').onclick = () => { navigator.clipboard.writeText(Pick('rules').textContent).then(() => { Pick('rules-copy').textContent = 'Copied'; setTimeout(() => { Pick('rules-copy').textContent = 'Copy rules'; }, 1500); }); };
Pick('db-test').onclick = () => Test('database');
Pick('form').onsubmit = Event => { Event.preventDefault(); Call('signin', Email(), Password()); };
Pick('make').onclick = () => Call('signup', Email(), Password());
Pick('again').onclick = () => Call('refresh');
Pick('resend').onclick = () => Call('resend');
Pick('screen').onclick = () => Call('allow', 'screen');
Pick('keys').onclick = () => Call('allow', 'keys');
Pick('relaunch').onclick = () => Arc.Call('relaunch');
Pick('leave').onclick = () => Call('leave');
Pick('run-all').onclick = RunAll;
Pick('export').onclick = async () => { const Done = await Arc.Call('export'); if (Done.saved) Pick('line').textContent = 'Saved ' + Done.saved; };

(async () => {
  Splash.Step(0.3);
  const First = await Arc.Call('state');
  Splash.Step(0.55);
  Draw(First);
  Pick('rules').textContent = await Arc.Call('rules');
  Splash.Step(0.8);
  while (Busy.size) await new Promise(Wait => setTimeout(Wait, 100));
  Splash.Step(1);
  setTimeout(Splash.Finish, 450);
})();

setInterval(async () => {
  const State = await Arc.Call('state');
  if (!State.streaming && State.verified && State.screen) Call('start');
  else Draw(Object.assign(State, { error: Now && Now.error }));   // keep the last error on screen until the next action
}, 2500);
