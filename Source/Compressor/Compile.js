// Arc

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*/;

function tokenize(source, start = 0, stopAtBrace = false) {
  const tokens = [];
  const n = source.length;
  let i = start;
  let depth = 0;

  while (i < n) {
    const ch = source[i];

    if (stopAtBrace && ch === '}' && depth === 0) {
      return { tokens, end: i };
    }
    if (ch === '{') depth++;
    else if (ch === '}' && depth > 0) depth--;

    if (ch === '/' && source[i + 1] === '/') {
      let j = source.indexOf('\n', i);
      if (j === -1) j = n;
      tokens.push(source.slice(i, j));
      i = j;
      continue;
    }

    if (ch === '/' && source[i + 1] === '*') {
      let j = source.indexOf('*/', i + 2);
      j = j === -1 ? n : j + 2;
      tokens.push(source.slice(i, j));
      i = j;
      continue;
    }

    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < n && source[j] !== ch) {
        j += source[j] === '\\' ? 2 : 1;
      }
      j = Math.min(j + 1, n);
      tokens.push(source.slice(i, j));
      i = j;
      continue;
    }

    if (ch === '`') {
      const result = tokenizeTemplate(source, i);
      tokens.push(...result.tokens);
      i = result.end;
      continue;
    }

    const identifier = IDENTIFIER.exec(source.slice(i));
    if (identifier) {
      tokens.push(identifier[0]);
      i += identifier[0].length;
      continue;
    }

    tokens.push(ch);
    i++;
  }

  return { tokens, end: i };
}

function tokenizeTemplate(source, start) {
  const tokens = ['`'];
  const n = source.length;
  let i = start + 1;
  let text = '';

  while (i < n) {
    if (source[i] === '\\') {
      text += source.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (source[i] === '`') {
      if (text) tokens.push(text);
      tokens.push('`');
      return { tokens, end: i + 1 };
    }
    if (source[i] === '$' && source[i + 1] === '{') {
      if (text) tokens.push(text);
      text = '';
      tokens.push('${');
      const expr = tokenize(source, i + 2, true);
      tokens.push(...expr.tokens, '}');
      i = expr.end + 1;
      continue;
    }
    text += source[i];
    i++;
  }

  if (text) tokens.push(text);
  return { tokens, end: i };
}

export function compile(source, renameMap) {
  const tokens = tokenize(source).tokens;

  const significant = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].trim() !== '') significant.push(i);
  }

  const prevOf = new Map();
  const nextOf = new Map();
  for (let s = 0; s < significant.length; s++) {
    const index = significant[s];
    prevOf.set(index, s > 0 ? tokens[significant[s - 1]] : null);
    nextOf.set(index, s < significant.length - 1 ? tokens[significant[s + 1]] : null);
  }

  return tokens
    .map((token, index) => {
      if (!renameMap.has(token)) return token;

      if (prevOf.get(index) === '.') return token;

      const next = nextOf.get(index);
      const prev = prevOf.get(index);
      if (next === ':' && (prev === '{' || prev === ',')) return token;

      return renameMap.get(token);
    })
    .join('');
}
