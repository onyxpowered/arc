// Arc 1 Project: which Firebase project this computer uses. Saved in the app's data folder; pasted from the Firebase console.
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

const Place = path.join(app.getPath('userData'), 'Config.json');
const Known = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId', 'databaseURL', 'measurementId'];
const Edge = new Set([' ', '\n', '\r', '\t', '"', "'", '`', '{', '}', ';']);

function Trim(Text) {
  let From = 0, To = Text.length;
  while (From < To && Edge.has(Text[From])) From++;
  while (To > From && Edge.has(Text[To - 1])) To--;
  return Text.slice(From, To);
}

// accepts the console's snippet (const firebaseConfig = { ... }), JSON, or loose key: "value" pairs
export function Parse(Text) {
  const Found = {};
  for (const Part of String(Text).split(',')) {
    const At = Part.indexOf(':');
    if (At < 0) continue;
    const Words = Part.slice(0, At).split(/[^A-Za-z0-9_]+/).filter(Boolean);
    const Key = Words[Words.length - 1];
    if (Known.includes(Key)) Found[Key] = Trim(Part.slice(At + 1));
  }
  return Found;
}

// fills in what the console leaves out; Problems lists what is still missing
export function Complete(Found) {
  const Config = {}, Problems = [];
  Known.forEach(Key => { if (Found[Key]) Config[Key] = Found[Key]; });
  ['apiKey', 'projectId', 'appId'].forEach(Key => { if (!Config[Key]) Problems.push(`${Key} is missing`); });
  if (Config.projectId) {
    if (!Config.authDomain) Config.authDomain = `${Config.projectId}.firebaseapp.com`;
    if (!Config.databaseURL) Config.databaseURL = `https://${Config.projectId}-default-rtdb.firebaseio.com`;
  }
  return { Config, Problems };
}

export function Load() {
  try { return JSON.parse(fs.readFileSync(Place, 'utf8')); } catch {}
  return globalThis.ArcConfig || null;      // an optional project built into this copy of the app
}
export const Save = Config => fs.writeFileSync(Place, JSON.stringify(Config, null, 2));
export const Forget = () => { try { fs.rmSync(Place); } catch {} };

// the Firebase console pages this app sends people to
export function Pages(Config) {
  const Id = encodeURIComponent(Config.projectId), Base = `https://console.firebase.google.com/project/${Id}`;
  const Host = String(Config.databaseURL || '').replace('https://', '').split('.')[0] || `${Config.projectId}-default-rtdb`;
  return { overview: `${Base}/overview`, settings: `${Base}/settings/general`, auth: `${Base}/authentication`, providers: `${Base}/authentication/providers`, database: `${Base}/database`, rules: `${Base}/database/${Host}/rules` };
}
