// Arc 1 Persistence: keeps the Firebase Auth session in A1/Session.json so the host signs in once.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const File = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'Session.json');
const Read = () => { try { return JSON.parse(fs.readFileSync(File, 'utf8')); } catch { return {}; } };

export class Persistence {
  static type = 'LOCAL';
  type = 'LOCAL';
  async _isAvailable() { return true; }
  async _set(Key, Value) { fs.writeFileSync(File, JSON.stringify({ ...Read(), [Key]: Value }), { mode: 0o600 }); }
  async _get(Key) { return Read()[Key] ?? null; }
  async _remove(Key) { const All = Read(); delete All[Key]; fs.writeFileSync(File, JSON.stringify(All), { mode: 0o600 }); }
  _addListener() {}
  _removeListener() {}
}
