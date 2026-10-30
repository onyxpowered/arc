// Arc 1 Device: this Mac's id (A1/Device.txt) and its entry in devices/<uid>/<device> {name, t}, which the viewer lists as tiles.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ref, set } from 'firebase/database';
import { Database } from './Firebase.js';

const File = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'Device.txt');

export function Device() {
  if (fs.existsSync(File)) return fs.readFileSync(File, 'utf8').trim();
  const Id = crypto.randomBytes(8).toString('hex');
  fs.writeFileSync(File, Id + '\n');
  return Id;
}

// refreshed every 20 s; the viewer shows a device as online while t is under a minute old
export function Presence(User, Id) {
  const Entry = ref(Database, `devices/${User.uid}/${Id}`);
  const Beat = () => set(Entry, { name: os.hostname().replace(/\.local$/, '').slice(0, 60), t: Date.now() }).catch(() => {});
  Beat();
  return setInterval(Beat, 20000);
}
