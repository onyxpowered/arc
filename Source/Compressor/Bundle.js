// Arc

import { readFileSync } from 'node:fs';
import { lettersOf } from './Alphabet.js';

export function bundle(files, word = 'Arc') {
  lettersOf(word);
  const names = [];
  const seen = new Set();
  const descriptions = {};
  const sources = [];

  for (const file of files) {
    const source = readFileSync(file.sourcePath, 'utf8').replace(new RegExp(`^// ${word}\\n+`), '');
    sources.push(source);

    const { names: fileNames, descriptions: fileDescriptions } = JSON.parse(readFileSync(file.namesPath, 'utf8'));
    for (const name of fileNames) {
      if (seen.has(name)) continue;
      seen.add(name);
      names.push(name);
    }
    Object.assign(descriptions, fileDescriptions || {});
  }

  return { source: sources.join('\n\n'), names, descriptions };
}
