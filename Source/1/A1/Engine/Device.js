// Arc 1 Device: this computer's id (Device.txt in the app's data folder) and its entry in devices/<uid>/<device> {name, t}, which the viewer lists as tiles.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { app } from 'electron';
import { ref, set } from 'firebase/database';
import { Link } from './Firebase.js';

const Memory = path.join(app.getPath('userData'), 'Device.txt');

export function Device() {
  if (fs.existsSync(Memory)) return fs.readFileSync(Memory, 'utf8').trim();
  const Id = crypto.randomBytes(8).toString('hex');
  fs.writeFileSync(Memory, Id + '\n');
  return Id;
}

// refreshed every 20 s; the viewer shows a device as online while t is under a minute old
export function Presence(User, Id) {
  const Entry = ref(Link.Database, `devices/${User.uid}/${Id}`);
  const Beat = () => set(Entry, { name: os.hostname().replace(/\.local$/, '').slice(0, 60), t: Date.now() }).catch(() => {});
  Beat();
  return setInterval(Beat, 20000);
}
