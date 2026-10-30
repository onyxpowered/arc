// Arc 1 Setup: the window that establishes this computer: account, permissions, then Arc.html.
const Pick = Id => document.getElementById(Id);
let Now = null;

const Mark = (Id, Kind) => { Pick(Id).querySelector('.head').className = 'head ' + Kind; };
const Fault = Text => { Pick('fault').hidden = !Text; Pick('fault').textContent = Text || ''; };

function Draw(State) {
  Now = State;
  Fault(State.error);
  const Signed = !!State.email, Verified = State.verified, Ready = Verified && State.screen;
  Pick('who').textContent = State.email || '';
  Pick('form').hidden = Signed;
  Pick('verify').hidden = !Signed || Verified;
  Pick('leave').hidden = !Signed;
  Mark('account', Verified ? 'ok' : Signed ? 'busy' : '');
  Pick('allow').className = 'step' + (Verified ? '' : ' off');
  Pick('screen-row').hidden = State.screen; Pick('keys-row').hidden = State.keys;
  Pick('restart').hidden = Pick('relaunch').hidden = !(State.mac && Verified && !State.screen);
  Mark('allow', !Verified ? '' : State.screen && State.keys ? 'ok' : 'busy');
  Pick('computer').className = 'step' + (Ready ? '' : ' off');
  Pick('name').textContent = State.name;
  Pick('export').disabled = !Ready;
  Mark('computer', State.streaming ? 'ok' : Ready ? 'busy' : '');
  Pick('line').textContent = State.streaming ? (State.viewer ? 'Online. A viewer is connected.' : 'Online. Waiting for a viewer.') : Ready ? 'Starting…' : 'Waiting for the steps above.';
  Pick('lead').textContent = State.streaming ? 'This computer is set up. You can close this window; Arc keeps running.' : 'Set up this computer once, then reach it from any browser.';
}

function Call() { return Arc.Call.apply(Arc, arguments).then(Draw); }
const Email = () => Pick('email').value.trim(), Password = () => Pick('pass').value;

Pick('form').onsubmit = Event => { Event.preventDefault(); Call('signin', Email(), Password()); };
Pick('make').onclick = () => Call('signup', Email(), Password());
Pick('again').onclick = () => Call('refresh');
Pick('resend').onclick = () => Call('resend');
Pick('screen').onclick = () => Call('allow', 'screen');
Pick('keys').onclick = () => Call('allow', 'keys');
Pick('relaunch').onclick = () => Arc.Call('relaunch');
Pick('leave').onclick = () => Call('leave');
Pick('export').onclick = async () => { const Done = await Arc.Call('export'); if (Done.saved) Pick('line').textContent = 'Saved ' + Done.saved; };

Call('state');
setInterval(async () => {
  const State = await Arc.Call('state');
  if (!State.streaming && State.verified && State.screen) Call('start');
  else Draw(Object.assign(State, { error: Now && Now.error }));   // keep the last error on screen until the next action
}, 2500);
