// Arc

export function buildGlossary(renameMap, descriptions) {
  const glossary = {};
  for (const [name, code] of renameMap) {
    glossary[code] = descriptions[name] ?? null;
  }
  return glossary;
}
