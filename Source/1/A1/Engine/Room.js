// Arc 1 Room: the room code is the only secret. ROOM env wins, then A1/Room.txt, else a new random one is written.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const File = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'Room.txt');

export function Room() {
  if (process.env.ROOM) return process.env.ROOM;
  if (fs.existsSync(File)) return fs.readFileSync(File, 'utf8').trim();
  const Code = crypto.randomBytes(8).toString('hex');
  fs.writeFileSync(File, Code + '\n');
  return Code;
}
