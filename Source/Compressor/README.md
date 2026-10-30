# Compressor

Renames the identifiers you list to short codes made only from the letters of one word, then wraps the result as a single HTML file.

- The word is 1 to 25 letters, A-Z only. Its distinct letters, upper-cased in order of first appearance, are the alphabet (`Arc` gives A, R, C; `Compressor` gives C, O, M, P, R, E, S). The default word is `Arc`, and its codes are the same as before.
- Codes run A, R, C, AA, AR, AC, RA and so on. A code is skipped if that identifier already exists in the source.
- `build({ sourcePath, namesPath, word, ... })` and `buildBundle({ files, word, ... })` in `Build.js`. A source file may start with `// <word>`; that line is dropped.
