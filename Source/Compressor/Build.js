// Arc

import { readFileSync, writeFileSync } from 'node:fs';
import { makeAllocator } from './Alphabet.js';
import { compile } from './Compile.js';
import { buildLexicon } from './Lexicon.js';
import { buildGlossary } from './Glossary.js';
import { wrap } from './Template.js';
import { bundle } from './Bundle.js';
import { fontFaceCss } from './Fonts.js';

const IDENTIFIERS = /[A-Za-z_$][A-Za-z0-9_$]*/g;

function compileAndWrite({ source, names, descriptions, fonts, word = 'Arc', outHtmlPath, outLexiconPath, outGlossaryPath }) {
  const own = new Set(names);
  const taken = new Set((source.match(IDENTIFIERS) || []).filter(id => !own.has(id)));
  const next = makeAllocator(word, taken);
  const renameMap = new Map(names.map(name => [name, next()]));

  const compiled = compile(source, renameMap).replace(new RegExp(`^// ${word}\\n+`), '');
  const css = fonts && fonts.length ? fontFaceCss(fonts) : undefined;

  writeFileSync(outHtmlPath, wrap(compiled, { fontFaceCss: css, title: word }));
  writeFileSync(outLexiconPath, JSON.stringify(buildLexicon(renameMap), null, 2));
  writeFileSync(outGlossaryPath, JSON.stringify(buildGlossary(renameMap, descriptions), null, 2));
}

export function build({ sourcePath, namesPath, fonts, word, outHtmlPath, outLexiconPath, outGlossaryPath }) {
  const source = readFileSync(sourcePath, 'utf8');
  const { names, descriptions = {} } = JSON.parse(readFileSync(namesPath, 'utf8'));
  compileAndWrite({ source, names, descriptions, fonts, word, outHtmlPath, outLexiconPath, outGlossaryPath });
}

export function buildBundle({ files, fonts, word, outHtmlPath, outLexiconPath, outGlossaryPath }) {
  const { source, names, descriptions } = bundle(files, word);
  compileAndWrite({ source, names, descriptions, fonts, word, outHtmlPath, outLexiconPath, outGlossaryPath });
}
