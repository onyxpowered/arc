// Arc 1 Setup: the window that sets up your Firebase project, signs in, and establishes this computer.
// Built from the status site's own parts: its masthead, banner, component rows, notes and popup.
import { Loading } from './Loading.js';
import { Tip } from './Tip.js';

const Pick = Id => document.getElementById(Id);
const Splash = Loading('');
Splash.Step(0.1);
const Hint = Tip();

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

// the status site's words and colors: blue "operational", amber, red, and gray for rows that are waiting
const Words = { ok: ['Ready', 'status-green'], todo: ['Needs setup', 'status-yellow'], bad: ['Needs attention', 'status-red'], wait: ['Waiting', 'status-offline'], work: ['Checking', 'status-green'] };
const Verdicts = { ok: ['Passed', 'status-green'], bad: ['Failed', 'status-red'], none: ['Not tested', 'status-offline'], work: ['Checking', 'status-green'] };

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
const FixWords = { auth: 'Open Authentication', providers: 'Open Sign-in method', database: 'Open Realtime Database', rules: 'Open the rules editor', settings: 'Open Project settings', screen: 'Allow screen recording', keys: 'Allow mouse and keyboard' };

// ---- test rows: built once, then updated in place so hover and popups stay steady ----
const Made = {};
function Build() {
  const Box = Pick('tests');
  Tests.forEach(One => {
    const Row = document.createElement('div');
    Row.className = 'component-container border-color arc-test';
    Row.dataset.test = One.Name;
    Row.innerHTML = '<div class="component-inner-container status-offline showcased"><span class="name" role="heading" aria-level="2"></span><span class="component-status"></span><div class="arc-sub"></div><div class="arc-actions" style="margin-top:12px"><button class="arc-button small" type="button">Test</button><button class="arc-button small" type="button" hidden>Fix</button></div></div>';
    Row.querySelector('.name').textContent = One.Title;
    const Buttons = Row.querySelectorAll('button');
    Buttons[0].onclick = () => Test(One.Name);
    Buttons[1].onclick = () => { const Got = Seen[One.Name]; if (Got && Got.fix) Fix(Got.fix); };
    Box.appendChild(Row);
    Made[One.Name] = Row;
  });
}

function Rows() {
  Tests.forEach(One => {
    const Row = Made[One.Name], Inner = Row.querySelector('.component-inner-container'), Got = Seen[One.Name], Wait = Busy.has(One.Name);
    const Verdict = Verdicts[Wait ? 'work' : Got ? (Got.ok ? 'ok' : 'bad') : 'none'];
    Inner.className = 'component-inner-container showcased ' + Verdict[1];
    Row.querySelector('.component-status').textContent = Verdict[0];
    Row.querySelector('.arc-sub').textContent = Wait ? 'Testing…' : Got ? `${Got.note || ''}${Got.ms ? ` (${Got.ms} ms)` : ''}` : 'Not tested yet';
    const Buttons = Row.querySelectorAll('button');
    Buttons[0].disabled = Wait;
    Buttons[1].hidden = !(Got && !Got.ok && Got.fix && !Wait);
  });
}

// the popup on a test row: the same card as the status site's day popup
function Describe(Row) {
  const Test_ = Tests.find(One => One.Name === Row.dataset.test), Got = Seen[Test_.Name];
  if (Busy.has(Test_.Name)) return { Title: Test_.Title, Notes: [{ Tone: 'info', Icon: 'circle-info-fill', Text: 'Testing…' }] };
  if (!Got) return { Title: Test_.Title, Notes: [{ Tone: 'info', Icon: 'circle-info-fill', Text: 'Not tested yet.' }] };
  const Info = { Title: Test_.Title, Notes: [{ Tone: Got.ok ? 'ok' : 'error', Icon: Got.ok ? 'circle-check-fill' : 'circle-xmark-fill', Text: Got.note || (Got.ok ? 'Passed' : 'Failed'), Detail: Got.ms ? `${Got.ms} ms` : '' }] };
  if (!Got.ok && Got.fix) { Info.Heading = 'How to fix'; Info.Lines = [FixWords[Got.fix] || 'Open the console']; }
  return Info;
}

// ---- steps ----
const Order = ['project', 'auth', 'db', 'account', 'allow', 'computer'];
const Names = { project: 'Firebase project', auth: 'Authentication', db: 'Realtime Database', account: 'Account', allow: 'Permissions', computer: 'This computer' };

function Steps() {
  if (!Now) return;
  const Has = !!Now.project, Auth = Seen.auth, Base = Seen.database;
  const Kinds = {
    project: Has ? 'ok' : 'todo',
    auth: !Has ? 'wait' : Busy.has('auth') ? 'work' : Auth ? (Auth.ok ? 'ok' : 'bad') : 'work',
    db: !Has ? 'wait' : Busy.has('database') ? 'work' : Base ? (Base.ok ? 'ok' : 'bad') : 'work',
    account: !(Has && Auth && Auth.ok && Base && Base.ok) ? 'wait' : Now.verified ? 'ok' : 'todo',
    allow: !Now.verified ? 'wait' : Now.screen && Now.keys ? 'ok' : 'todo',
    computer: !(Now.verified && Now.screen) ? 'wait' : Now.streaming ? 'ok' : 'todo',
  };
  const Current = Order.find(Id => Kinds[Id] !== 'ok' && Kinds[Id] !== 'wait' && Kinds[Id] !== 'work');
  Order.forEach(Id => {
    const Row = Pick('s-' + Id), Word = Words[Kinds[Id]];
    Row.querySelector('.component-inner-container').className = 'component-inner-container showcased ' + Word[1];
    Row.querySelector('.component-status').textContent = Word[0];
    Row.classList.toggle('locked', Kinds[Id] === 'wait');
    Row.classList.toggle('open', Kinds[Id] !== 'wait' && (Id === Current || Opened.has(Id)));
  });
  Pick('auth-note').textContent = !Has ? 'Waiting for a project.' : Busy.has('auth') ? 'Testing…' : Auth ? Auth.note : 'Not tested yet.';
  Pick('db-note').textContent = !Has ? 'Waiting for a project.' : Busy.has('database') ? 'Testing…' : Base ? Base.note : 'Not tested yet.';

  // the banner says where you are: blue when the computer is online, amber while setting up, red when something failed
  const Bad = Order.find(Id => Kinds[Id] === 'bad');
  const Banner = Pick('banner');
  if (Now.streaming) { Banner.className = 'page-status status-none'; Pick('headline').textContent = Now.viewer ? 'This computer is online. A viewer is connected' : 'This computer is online'; }
  else if (Bad) { Banner.className = 'page-status status-critical'; Pick('headline').textContent = `${Names[Bad]} needs attention`; }
  else if (Current) { Banner.className = 'page-status status-minor'; Pick('headline').textContent = `Setting up: ${Names[Current]}`; }
  else { Banner.className = 'page-status status-minor'; Pick('headline').textContent = 'Starting this computer'; }
}

function Draw(State) {
  Now = State;
  const Signed = !!State.email, Verified = State.verified, Ready = Verified && State.screen;
  const Fault = (Id, Text) => { Pick(Id).hidden = !Text; Pick(Id).querySelector('.text').textContent = Text || ''; };
  Fault('config-fault', State.error && !State.project ? State.error : '');
  Fault('fault', State.error && State.project ? State.error : '');

  Pick('project-new').hidden = !!State.project;
  Pick('project-set').hidden = !State.project;
  Pick('project-line').textContent = State.project ? `Using ${State.project.id}.` : '';
  Pick('change-project').hidden = !!(State.project && State.project.built);
  if (State.project && Named !== State.project.id) {
    Named = State.project.id; Splash.Name(Named);
    Arc.Call('pages').then(Found => { Where = Found; });
    Test('auth'); Test('database');
  }

  Pick('form').hidden = Signed;
  Pick('verify').hidden = !Signed || Verified;
  Pick('leave').hidden = !Signed;
  Pick('screen-row').hidden = State.screen; Pick('keys-row').hidden = State.keys;
  Pick('restart').hidden = Pick('relaunch').hidden = !(State.mac && Verified && !State.screen);
  Pick('export').disabled = !Ready;
  Pick('line').textContent = State.streaming ? (State.viewer ? 'Online. A viewer is connected.' : 'Online. Waiting for a viewer.') : Ready ? 'Starting…' : 'Waiting for the steps above.';
  if (!Verified) { if (Was) { delete Seen.rules; delete Seen.ping; } } else if (!Seen.rules && !Busy.has('rules')) Test('rules');   // signing out clears them; a plain redraw does not
  Was = Verified;
  Steps(); Rows();
}

// ---- actions ----
function Call() { return Arc.Call.apply(Arc, arguments).then(Draw); }
const Refresh = () => Arc.Call('state').then(Draw);
const Email = () => Pick('email').value.trim(), Password = () => Pick('pass').value;
const Console_ = Address => { Arc.Call('open', Address || 'https://console.firebase.google.com/'); };

Build();
Order.forEach(Id => { Pick('s-' + Id).querySelector('.name').onclick = () => { const Row = Pick('s-' + Id); if (Row.classList.contains('locked')) return; if (Opened.has(Id)) Opened.delete(Id); else Opened.add(Id); Row.classList.toggle('open'); }; });
Pick('console').onclick = Event => { Event.preventDefault(); Console_(Where && Where.overview); };
Pick('console-help').onclick = () => Console_();
Pick('save-config').onclick = () => Call('config:save', Pick('config').value);
Pick('open-overview').onclick = () => Console_(Where && Where.overview);
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

Hint.Bind(Pick('tests'), '.arc-test', Describe);
Hint.Bind(document.querySelector('.masthead'), '#console', () => ({ Title: 'Firebase console', Notes: [{ Tone: 'info', Icon: 'circle-info-fill', Text: Now && Now.project ? `Opens ${Now.project.id} in your browser.` : 'Opens the Firebase console in your browser.' }] }));

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
