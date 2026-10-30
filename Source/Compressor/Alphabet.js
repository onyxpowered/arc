// Compressor

const MAX_WORD = 25;
const DEFAULT_WORD = 'Arc';

export function lettersOf(word = DEFAULT_WORD) {
  if (typeof word !== 'string' || !/^[A-Za-z]{1,25}$/.test(word)) {
    throw new Error(`word must be 1 to ${MAX_WORD} letters (A-Z only), got ${JSON.stringify(word)}`);
  }
  return [...new Set(word.toUpperCase())];
}

function* sequence(letters, length) {
  const total = letters.length ** length;
  for (let i = 0; i < total; i++) {
    let n = i;
    let code = '';
    for (let j = 0; j < length; j++) {
      code = letters[n % letters.length] + code;
      n = Math.floor(n / letters.length);
    }
    yield code;
  }
}

function* codes(letters) {
  for (let length = 1; ; length++) {
    yield* sequence(letters, length);
  }
}

// taken: identifiers already in the source that a code must not collide with.
export function makeAllocator(word = DEFAULT_WORD, taken = new Set()) {
  const gen = codes(lettersOf(word));
  return function next() {
    for (;;) {
      const code = gen.next().value;
      if (!taken.has(code)) return code;
    }
  };
}
