// Arc

export function buildLexicon(renameMap) {
  const lexicon = {};
  for (const [name, code] of renameMap) {
    lexicon[name] = code;
  }
  return lexicon;
}
