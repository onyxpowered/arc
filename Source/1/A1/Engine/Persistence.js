// Arc 1 Persistence: keeps the Firebase Auth session in the app's data folder so this computer signs in once.
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

const Store = path.join(app.getPath('userData'), 'Session.json');   // writable, unlike the app bundle
const Read = () => { try { return JSON.parse(fs.readFileSync(Store, 'utf8')); } catch { return {}; } };

export class Persistence {
  static type = 'LOCAL';
  type = 'LOCAL';
  async _isAvailable() { return true; }
  async _set(Key, Value) { fs.writeFileSync(Store, JSON.stringify(Object.assign({}, Read(), { [Key]: Value })), { mode: 0o600 }); }
  async _get(Key) { return Read()[Key] ?? null; }
  async _remove(Key) { const All = Read(); delete All[Key]; fs.writeFileSync(Store, JSON.stringify(All), { mode: 0o600 }); }
  _addListener() {}
  _removeListener() {}
}
