// Arc

import { readFileSync } from 'node:fs';

export function fontFaceCss(fonts) {
  return fonts
    .map(font => {
      const base64 = readFileSync(font.path).toString('base64');
      const format = (font.format || 'opentype');
      return `@font-face{font-family:'${font.family}';src:url(data:font/${format === 'opentype' ? 'otf' : format};base64,${base64}) format('${format}');font-weight:${font.weight};font-style:${font.style || 'normal'};font-display:swap;}`;
    })
    .join('\n');
}
