// Arc 1 Export: writes the viewer as one self-contained HTML file, with this app's Firebase project baked in.
import fs from 'node:fs';

export const Export = (From, To) => fs.writeFileSync(To, fs.readFileSync(From));
