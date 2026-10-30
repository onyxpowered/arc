// Arc 1 Export: writes the viewer as one self-contained HTML file, with the chosen Firebase project written into it.
import fs from 'node:fs';

export function Export(From, To, Config) {
  const Json = JSON.stringify(Config).split('<').join('\\u003c');
  const Page = fs.readFileSync(From, 'utf8').replace('<!--Config-->', () => `<script id="arc-config" type="application/json">${Json}</script>`);
  fs.writeFileSync(To, Page);
}
