// Arc 1 Engine: the Electron main process. It establishes this computer (account, device, permissions), then relays the screen.
import { app, BrowserWindow, ipcMain, dialog, session, desktopCapturer, systemPreferences, shell } from 'electron';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ready, Current, SignIn, SignUp, Resend, Refresh, Leave, Describe } from './Engine/Account.js';
import { Device, Presence } from './Engine/Device.js';
import { Frames } from './Engine/Frames.js';
import { Heartbeat } from './Engine/Heartbeat.js';
import { Input } from './Engine/Input.js';
import { Ladder } from './Engine/Ladder.js';
import { Keys } from './Engine/Keys.js';
import { Export } from './Engine/Export.js';

const Here = path.dirname(fileURLToPath(import.meta.url));
const Helpers = app.isPackaged ? process.resourcesPath : Here;
const Id = Device();
const Mac = process.platform === 'darwin';
const Log = function () { console.log.apply(console, [new Date().toISOString().slice(11, 19)].concat(Array.prototype.slice.call(arguments))); };

let Window = null, Capturer = null, Run = null, Quitting = false;

const Screen = () => Mac ? systemPreferences.getMediaAccessStatus('screen') === 'granted' : true;
const Trusted = () => Mac ? systemPreferences.isTrustedAccessibilityClient(false) : true;

function State() {
  const User = Current();
  return { email: User ? User.email : null, verified: !!(User && User.emailVerified), name: os.hostname().replace(/\.local$/, ''), screen: Screen(), keys: Trusted(), streaming: !!Run, viewer: Run ? Run.Beat.Who() : null, quality: Run ? Run.Quality.Now().kbps : null, mac: Mac };
}

function Open(Page, Options) {
  const Made = new BrowserWindow(Object.assign({ webPreferences: { preload: path.join(Here, 'Bridge.js'), sandbox: true, contextIsolation: true, backgroundThrottling: false } }, Options));
  Made.loadFile(path.join(Here, Page));
  return Made;
}

async function Stop() {
  if (!Run) return;
  const Old = Run; Run = null;
  clearInterval(Old.Pulse); clearInterval(Old.Watch); clearInterval(Old.Pacer); Old.Pad.Stop();
  if (Capturer) { Capturer.destroy(); Capturer = null; }
  Log('stopped');
}

async function Begin() {
  const User = Current();
  if (Run || !User || !User.emailVerified || !Screen()) return;
  const Code = `${User.uid}/${Id}`;                                  // rooms/<uid>/<device>
  const Frame = Frames(Code), Pad = Keys(Helpers);
  let NeedKey = true, Paced = true, Last = Date.now(), Seq = Date.now();
  const Tell = (Name, Value) => { if (Capturer && !Capturer.isDestroyed()) Capturer.webContents.send(Name, Value); };
  const Pace = () => {                                                   // pause below 6 queued writes, resume at 2 (a paused capture sends no frames, so a timer also calls this)
    if (Paced && Frame.Backlog > 6) { Paced = false; Tell('pace', false); }
    else if (!Paced && Frame.Backlog <= 2) { Paced = true; Tell('pace', true); }
  };
  const Quality = Ladder(Rung => { Log('quality', JSON.stringify(Rung)); Tell('rung', Rung); });
  const Beat = Heartbeat(Code, {
    Hello: async Who => {                                              // a viewer (re)connected: restart the stream on a clean ring
      Log('viewer hello', Who); NeedKey = true; Quality.Reset();
      await Frame.Clear();
      Tell('rung', Quality.Now()); Tell('live', true); Tell('key', true);
    },
    Gone: () => { Log('viewer gone'); Tell('live', false); Pad.Send({ t: 'reset' }); },
    Keyframe: () => { NeedKey = true; Tell('key', true); },
    Feedback: Report => Quality.Report(Report),
  });
  Input(Code, () => Beat.Who(), Event => Pad.Send(Event));
  await Frame.Clear();
  Run = { Beat, Pad, Pulse: Presence(User, Id), Code, Frame, Quality };
  Run.Pacer = setInterval(Pace, 150);
  Run.Watch = setInterval(() => {                                      // a capture that goes quiet while someone watches is restarted
    if (Beat.Live() && Date.now() - Last > 8000) { Log('capture stalled; restarting'); Stop().then(Begin); }
  }, 4000);
  ipcMain.removeAllListeners('frame'); ipcMain.removeAllListeners('info'); ipcMain.removeAllListeners('note');
  ipcMain.on('info', (Event, Stream) => { Log('capture', JSON.stringify(Stream)); Beat.Describe(Stream); });
  ipcMain.on('note', (Event, Text) => Log('capture:', Text));
  ipcMain.on('frame', (Event, Type, Data, Rung) => {
    Last = Date.now();
    if (!Run || !Beat.Live()) { NeedKey = true; return; }
    const Key = Type === 2;
    if (NeedKey && !Key) return;                                       // wait for a keyframe after a gap
    // backpressure: when the uplink is behind, stop encoding new frames at the source so the delta chain stays intact (fps drops, nothing freezes)
    Pace();
    if (Frame.Backlog > 30 && !Key) { NeedKey = true; Tell('key', true); return; }   // emergency: the chain is lost, resync
    if (Key) NeedKey = false;
    Frame.Publish(Seq++, Beat.Era(), Rung, Key, Buffer.from(Data));
  });
  Capturer = Open('Capture.html', { show: false, width: 320, height: 240 });
  await new Promise(Done => Capturer.webContents.once('did-finish-load', Done));
  try { await Capturer.webContents.executeJavaScript(`globalThis.ArcBegin(${JSON.stringify(Quality.Now())})`, true); Log('capturing'); }
  catch (Failure) { Log('capture failed:', Failure.message); await Stop(); }
}

function Wire() {
  const Answer = async Work => { try { await Work(); } catch (Failure) { return Object.assign(State(), { error: Describe(Failure) }); } return State(); };
  ipcMain.handle('state', () => State());
  ipcMain.handle('signin', (Event, Email, Password) => Answer(async () => { await SignIn(Email, Password); await Begin(); }));
  ipcMain.handle('signup', (Event, Email, Password) => Answer(() => SignUp(Email, Password)));
  ipcMain.handle('resend', () => Answer(() => Resend()));
  ipcMain.handle('refresh', () => Answer(async () => { await Refresh(); await Begin(); }));
  ipcMain.handle('leave', () => Answer(async () => { await Stop(); await Leave(); }));
  ipcMain.handle('allow', async (Event, Which) => {
    if (Which === 'screen') { await desktopCapturer.getSources({ types: ['screen'] }).catch(() => {}); if (!Screen()) shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'); }
    if (Which === 'keys') { if (!systemPreferences.isTrustedAccessibilityClient(true)) shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'); }
    return State();
  });
  ipcMain.handle('start', () => Answer(async () => { await Stop(); await Begin(); }));
  ipcMain.handle('relaunch', () => { app.relaunch(); app.exit(0); });
  ipcMain.handle('export', async () => {
    const Pick = await dialog.showSaveDialog(Window, { defaultPath: path.join(app.getPath('downloads'), 'Arc.html'), filters: [{ name: 'HTML', extensions: ['html'] }] });
    if (Pick.canceled || !Pick.filePath) return { saved: null };
    Export(path.join(Here, 'Viewer.html'), Pick.filePath);
    shell.showItemInFolder(Pick.filePath);
    return { saved: Pick.filePath };
  });
}

app.on('before-quit', () => { Quitting = true; });
app.on('window-all-closed', () => { if (!Mac || Quitting) app.quit(); });
app.on('activate', () => { if (Window) Window.show(); });

// not a top-level await: Electron finishes starting only after this module has loaded
async function Launch() {
  session.defaultSession.setDisplayMediaRequestHandler((Request, Reply) => {
    desktopCapturer.getSources({ types: ['screen'] }).then(Sources => Reply({ video: Sources[0] }), () => Reply({}));
  });
  Wire();
  Window = Open('Setup.html', { width: 440, height: 680, resizable: false, title: 'Arc 1', backgroundColor: '#000000' });
  Window.on('close', Event => { if (Mac && !Quitting) { Event.preventDefault(); Window.hide(); } });
  await Ready();
  await Begin();
}
app.whenReady().then(Launch);
