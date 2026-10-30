// Arc 1 Source: checks every hash, validates the tree, then builds the app through Compressor.
//   node Source/Source.js          verify, then compress into Source/1/Build
//   node Source/Source.js check    verify only
//   node Source/Source.js seal     validate, then rewrite Hashes.json (do this after you edit anything)
//   node Source/Source.js pack     verify, compress, then package Software/Arc.dmg and Software/Arc.exe
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeAllocator } from './Compressor/Alphabet.js';
import { compile } from './Compressor/Compile.js';
import { buildLexicon } from './Compressor/Lexicon.js';

const Here = path.dirname(fileURLToPath(import.meta.url));
const App = path.join(Here, '1');
const Out = path.join(App, 'Build');
const Word = 'Arc';
const Mode = process.argv[2] || 'build';
const Skip = new Set(['node_modules', 'Build', '.DS_Store', 'Config.js', '.firebaserc', 'Hashes.json', 'Session.json', 'Device.txt']);
const { Mark } = await import(path.join(App, 'Mark.js'));
const Problems = [];
const Fail = Text => Problems.push(Text);
const Clock = Date.now();
const Say = Text => console.log(`${String(((Date.now() - Clock) / 1000).toFixed(1)).padStart(5)}s  ${Text}`);
const Sha = Bytes => crypto.createHash('sha256').update(Bytes).digest('hex');
const Read = File => fs.readFileSync(File, 'utf8');
const Rel = File => path.relative(Here, File).split(path.sep).join('/');

// the favicon follows light and dark mode (Chrome and Firefox read the media query inside an SVG icon)
const FaviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${Mark.Square}"><style>path{fill:#000}@media (prefers-color-scheme:dark){path{fill:#fff}}</style><path d="${Mark.Shape}"/></svg>`;
const Icon = `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent(FaviconSvg)}">`;
const MarkSvg = `<svg width="22" height="20" viewBox="${Mark.Box}" aria-hidden="true"><path fill="currentColor" d="${Mark.Shape}"/></svg>`;

// ---- 1. hashes ----
function Walk(Dir, Found = []) {
  for (const Name of fs.readdirSync(Dir).sort()) {
    if (Skip.has(Name) || Name.endsWith('.log')) continue;
    const File = path.join(Dir, Name);
    if (fs.statSync(File).isDirectory()) Walk(File, Found); else Found.push(File);
  }
  return Found;
}
const Current = {};
for (const File of Walk(Here)) Current[Rel(File)] = Sha(fs.readFileSync(File));
const Manifest = path.join(Here, 'Hashes.json');

function Verify() {
  if (!fs.existsSync(Manifest)) return Fail('Hashes.json is missing. Run: node Source/Source.js seal');
  const Sealed = JSON.parse(Read(Manifest));
  for (const Name of Object.keys(Sealed)) {
    if (!(Name in Current)) Fail(`missing: ${Name}`);
    else if (Current[Name] !== Sealed[Name]) Fail(`changed: ${Name}`);
  }
  for (const Name of Object.keys(Current)) if (!(Name in Sealed)) Fail(`new file not sealed: ${Name}`);
}

// ---- 2. validity ----
// Config.js is optional: it builds a default Firebase project into this copy of the app. Without it, the app asks for a project when it first runs.
function Config() {
  const File = path.join(App, 'Config.js');
  if (!fs.existsSync(File)) return '';
  const Text = Read(File), Box = { globalThis: {} };
  try { vm.runInNewContext(Text, Box); } catch (Failure) { Fail(`Config.js does not run: ${Failure.message}`); return ''; }
  const Values = Box.globalThis.ArcConfig || {};
  for (const Key of ['projectId', 'appId', 'apiKey', 'authDomain', 'databaseURL']) {
    if (!Values[Key] || /YOUR-/.test(Values[Key])) Fail(`Config.js: ${Key} is not filled in`);
  }
  return Text;
}

function Syntax(Code, Extension, Label) {
  const File = path.join(Out, `.check${Extension}`);
  fs.mkdirSync(Out, { recursive: true });
  fs.writeFileSync(File, Code);
  try { execFileSync(process.execPath, ['--check', File], { stdio: 'pipe' }); }
  catch (Failure) { Fail(`${Label} does not parse: ${String(Failure.stderr).split('\n').slice(0, 4).join(' | ')}`); }
  fs.rmSync(File, { force: true });
}

// Compressor tokenizes without knowing regex literals, so a quote or backtick inside one would hide the code after it from renaming.
function Lint(File, Text) {
  let Prev = '';
  for (let At = 0; At < Text.length;) {
    const Char = Text[At], Next = Text[At + 1];
    if (Char === '/' && Next === '/') { const End = Text.indexOf('\n', At); At = End < 0 ? Text.length : End; continue; }
    if (Char === '/' && Next === '*') { const End = Text.indexOf('*/', At + 2); At = End < 0 ? Text.length : End + 2; continue; }
    if (Char === '"' || Char === "'") { let End = At + 1; while (End < Text.length && Text[End] !== Char) End += Text[End] === '\\' ? 2 : 1; At = End + 1; Prev = 'x'; continue; }
    if (Char === '`') { let End = At + 1; while (End < Text.length && Text[End] !== '`') End += Text[End] === '\\' ? 2 : 1; At = End + 1; Prev = 'x'; continue; }
    if (Char === '/' && (Prev === '' || '(,=:[!&|?{};+-*%<>~^'.includes(Prev))) {
      let End = At + 1, Class = false;
      while (End < Text.length && Text[End] !== '\n') {
        const Here_ = Text[End];
        if (Here_ === '\\') { End += 2; continue; }
        if (Here_ === '[') Class = true; else if (Here_ === ']') Class = false; else if (Here_ === '/' && !Class) break;
        End++;
      }
      const Body = Text.slice(At + 1, End);
      if (Body.includes('"') || Body.includes("'") || Body.includes('`')) Fail(`${Rel(File)}:${Text.slice(0, At).split('\n').length}: a regex literal contains a quote or backtick, which Compressor cannot see; build it another way`);
      At = End + 1; Prev = 'x'; continue;
    }
    if (!/\s/.test(Char)) Prev = Char;
    At++;
  }
}

// ---- 3. bundling ----
// Own imports (./x.js) are inlined in dependency order, external imports are hoisted, `export` is dropped.
function Bundle(Entry, ConfigText) {
  const Seen = new Set(), Parts = [], External = new Map(), Tops = new Map();
  let UsesConfig = false;
  const Hoist = (Line, Spec) => {
    const Clause = Line.trim().replace(/^import\s*/, '').replace(/\s*(?:from\s*)?['"][^'"]+['"];?\s*$/, '').trim();
    const Entry_ = External.get(Spec) || { Def: null, Star: null, Names: new Set() };
    const Star = /\*\s*as\s+([\w$]+)/.exec(Clause), Named = /\{([^}]*)\}/.exec(Clause), Def = /^([\w$]+)/.exec(Clause.replace(/\{[^}]*\}/, '').trim());
    if (Star) Entry_.Star = Star[1];
    if (Named) for (const Name of Named[1].split(',')) if (Name.trim()) Entry_.Names.add(Name.trim());
    if (Def && !Star) Entry_.Def = Def[1];
    External.set(Spec, Entry_);
  };
  const Visit = File => {
    if (Seen.has(File)) return;
    Seen.add(File);
    let Text = Read(File);
    Text = Text.replace(/^import\s+(?:[^'"\n]*?\s+from\s+)?['"]([^'"]+)['"];?[ \t]*$/gm, (Line, Spec) => {
      if (Spec.startsWith('.')) {
        const Target = path.resolve(path.dirname(File), Spec);
        if (Target === path.join(App, 'Config.js')) UsesConfig = true; else Visit(Target);
      } else Hoist(Line, Spec);
      return '';
    });
    Text = Text.replace(/^export\s+(?=(?:async\s+)?(?:function|const|let|class))/gm, '');
    for (const Match of Text.matchAll(/^(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/gm)) {
      if (Tops.has(Match[1])) Fail(`${Rel(File)}: top-level ${Match[1]} is also declared in ${Tops.get(Match[1])}`);
      Tops.set(Match[1], Rel(File));
    }
    Parts.push(Text);
  };
  Visit(Entry);
  const Lines = [...External].map(([Spec, Got]) => {
    const Head = [Got.Def, Got.Star ? `* as ${Got.Star}` : null, Got.Names.size ? `{ ${[...Got.Names].join(', ')} }` : null].filter(Boolean).join(', ');
    return Head ? `import ${Head} from '${Spec}';` : `import '${Spec}';`;
  });
  return { External: Lines, Config: UsesConfig ? ConfigText : '', Source: Parts.join('\n') };
}

// comments and string contents blanked, template text dropped (its ${expressions} kept), for scanning only
function Blank(Text) {
  let Out_ = '';
  for (let At = 0; At < Text.length;) {
    const Char = Text[At], Next = Text[At + 1];
    if (Char === '/' && Next === '/') { At = Text.indexOf('\n', At); if (At < 0) break; continue; }
    if (Char === '/' && Next === '*') { const End = Text.indexOf('*/', At + 2); At = End < 0 ? Text.length : End + 2; continue; }
    if (Char === '"' || Char === "'") { let End = At + 1; while (End < Text.length && Text[End] !== Char) End += Text[End] === '\\' ? 2 : 1; Out_ += Char + Char; At = End + 1; continue; }
    if (Char === '`') {
      let End = At + 1;
      while (End < Text.length && Text[End] !== '`') {
        if (Text[End] === '\\') { End += 2; continue; }
        if (Text[End] === '$' && Text[End + 1] === '{') {
          let Depth = 1, Stop = End + 2;
          while (Stop < Text.length && Depth) { if (Text[Stop] === '{') Depth++; else if (Text[Stop] === '}') Depth--; Stop++; }
          Out_ += ' (' + Blank(Text.slice(End + 2, Stop - 1)) + ') ;';
          End = Stop; continue;
        }
        End++;
      }
      Out_ += '``'; At = End + 1; continue;
    }
    Out_ += Char; At++;
  }
  return Out_;
}

// Compressor treats a piece of template text that is exactly a renamed word (say `h` in `h${Size}v`) as a name and renames it,
// which corrupts the string. Collect the static pieces so those names can be left alone.
function TemplateTexts(Text) {
  const Found = new Set();
  for (let At = 0; At < Text.length;) {
    const Char = Text[At], Next = Text[At + 1];
    if (Char === '/' && Next === '/') { const End = Text.indexOf('\n', At); At = End < 0 ? Text.length : End; continue; }
    if (Char === '/' && Next === '*') { const End = Text.indexOf('*/', At + 2); At = End < 0 ? Text.length : End + 2; continue; }
    if (Char === '"' || Char === "'") { let End = At + 1; while (End < Text.length && Text[End] !== Char) End += Text[End] === '\\' ? 2 : 1; At = End + 1; continue; }
    if (Char === '`') {
      let End = At + 1, Part = '';
      while (End < Text.length && Text[End] !== '`') {
        if (Text[End] === '\\') { Part += Text.slice(End, End + 2); End += 2; continue; }
        if (Text[End] === '$' && Text[End + 1] === '{') {
          if (Part) Found.add(Part);
          Part = '';
          let Depth = 1, Stop = End + 2;
          while (Stop < Text.length && Depth) { if (Text[Stop] === '{') Depth++; else if (Text[Stop] === '}') Depth--; Stop++; }
          End = Stop; continue;
        }
        Part += Text[End]; End++;
      }
      if (Part) Found.add(Part);
      At = End + 1; continue;
    }
    At++;
  }
  return Found;
}

const Keywords = new Set('break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new return super switch this throw try typeof var void while with yield await async static get set of null true false undefined arguments constructor'.split(' '));
const Browser = new Set('screen stop event name status top parent self history location document window navigator performance close open focus blur origin length find print alert confirm prompt fetch crypto Option Image Audio Event Error Buffer Request Response Headers Notification'.split(' '));
const Identifier = /^[A-Za-z_$][\w$]*$/;

// names this code declares itself and can safely rename: not imported, not a global, never used as a property or object key
function Names(Source, Imports) {
  const Code = Blank(Source), Declared = new Set(), Props = new Set(), Imported = new Set();
  const Add = Name => { if (Identifier.test(Name) && !Keywords.has(Name)) Declared.add(Name); };
  const Params = List => { for (const Piece of List.split(',')) { const Found = /^\s*([A-Za-z_$][\w$]*)\s*(?:=[\s\S]*)?$/.exec(Piece); if (Found) Add(Found[1]); } };
  for (const Line of Imports) for (const Word_ of Line.replace(/from\s+['"].*$/, '').split(/[^\w$]+/)) if (Word_) Imported.add(Word_);

  for (const Match of Code.matchAll(/\b(?:const|let|var)\s+([^;\n]*)/g)) {   // one or more declarators on a line: const A = 1, B = f(2, 3)
    let Depth = 0, Start = 0;
    const Line = Match[1];
    for (let At = 0; At <= Line.length; At++) {
      const Char = Line[At];
      if ('([{'.includes(Char)) Depth++; else if (')]}'.includes(Char)) Depth--;
      if (At === Line.length || (Char === ',' && Depth === 0)) {
        const Found = /^\s*([A-Za-z_$][\w$]*)\s*(?:=|$)/.exec(Line.slice(Start, At));
        if (Found) Add(Found[1]);
        Start = At + 1;
      }
    }
  }
  for (const Match of Code.matchAll(/\bfunction\*?\s+([A-Za-z_$][\w$]*)/g)) Add(Match[1]);
  for (const Match of Code.matchAll(/\bclass\s+([A-Za-z_$][\w$]*)/g)) Add(Match[1]);
  for (const Match of Code.matchAll(/\(([^()]*)\)\s*=>/g)) Params(Match[1]);
  for (const Match of Code.matchAll(/([A-Za-z_$][\w$]*)\s*=>/g)) Add(Match[1]);
  for (const Match of Code.matchAll(/\bfunction\*?\s*[\w$]*\s*\(([^()]*)\)/g)) Params(Match[1]);
  for (const Match of Code.matchAll(/^[ \t]*(?:(?:async|static|get|set)\s+)*[A-Za-z_$][\w$]*\s*\(([^()]*)\)\s*\{/gm)) Params(Match[1]);
  for (const Match of Code.matchAll(/\bcatch\s*\(\s*([A-Za-z_$][\w$]*)\s*\)/g)) Add(Match[1]);

  for (const Match of Code.matchAll(/\.\s*([A-Za-z_$][\w$]*)/g)) Props.add(Match[1]);
  for (const Match of Code.matchAll(/[{,]\s*([A-Za-z_$][\w$]*)\s*:/g)) Props.add(Match[1]);
  for (const Match of Code.matchAll(/(?<!\$)\{([^{}()]*)\}/g)) for (const Piece of Match[1].split(',')) { const Found = /^\s*([A-Za-z_$][\w$]*)\s*$/.exec(Piece); if (Found) Props.add(Found[1]); }
  for (const Match of Code.matchAll(/^[ \t]*(?:(?:async|static|get|set)\s+)*([A-Za-z_$][\w$]*)\s*\([^()]*\)\s*\{/gm)) Props.add(Match[1]);
  for (const Match of Code.matchAll(/[,{]\s*(?:(?:async|get|set)\s+)?([A-Za-z_$][\w$]*)\s*\([^()]*\)\s*\{/g)) Props.add(Match[1]);

  const Globals = new Set(Object.getOwnPropertyNames(globalThis));
  const Texts = TemplateTexts(Source);
  const Chosen = [...Declared].filter(Name => !Imported.has(Name) && !Props.has(Name) && !Globals.has(Name) && !Browser.has(Name) && !Texts.has(Name));
  const Count = Name => (Code.match(new RegExp(`(?<![\\w$])${Name.replace(/\$/g, '\\$')}(?![\\w$])`, 'g')) || []).length;
  return Chosen.map(Name => [Name, Count(Name)]).sort((A, B) => B[1] - A[1] || (A[0] < B[0] ? -1 : 1)).map(Pair => Pair[0]);
}

function Compress(Label, Bundled) {
  const Source = [...Bundled.External, Bundled.Config, Bundled.Source].filter(Boolean).join('\n');
  const Chosen = Names(Source, Bundled.External);
  const Own = new Set(Chosen);
  const Taken = new Set((Source.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) || []).filter(Name => !Own.has(Name)));
  const Next = makeAllocator(Word, Taken);
  const Map_ = new Map(Chosen.map(Name => [Name, Next()]));
  let Code = compile(Source, Map_);
  Code = Code.replace(/^[ \t]*\/\/.*\n/gm, '').replace(/\n{3,}/g, '\n\n');   // drop full-line comments
  return { Code, Map: Map_ };
}

function Page(Label, Bundled, Template, Target, Lexicon) {
  const Result = Compress(Label, Bundled);
  Syntax(Result.Code, '.mjs', Label);
  const Html = Read(Template).replace('<!--Icon-->', () => Icon).replace('<!--Mark-->', () => MarkSvg).replace('<!--Script-->', () => `<script type="module">\n${Result.Code}\n</script>`);
  fs.writeFileSync(path.join(Out, Target), Html);
  Lexicon[Label] = buildLexicon(Result.Map);
  return Result.Map.size;
}

function Build(ConfigText) {
  fs.rmSync(Out, { recursive: true, force: true });
  fs.mkdirSync(Out, { recursive: true });
  const Lexicon = {}, Report = [];
  Say('compressing');
  const Main = Compress('Main', Bundle(path.join(App, 'A1/Engine.js'), ConfigText));
  Syntax(Main.Code, '.mjs', 'Main');
  fs.writeFileSync(path.join(Out, 'Main.js'), Main.Code); Lexicon.Main = buildLexicon(Main.Map); Report.push(['Main.js', Main.Map.size]);

  const Bridge = Compress('Bridge', Bundle(path.join(App, 'A1/Bridge.js'), ''));
  Syntax(Bridge.Code, '.cjs', 'Bridge');
  fs.writeFileSync(path.join(Out, 'Bridge.js'), Bridge.Code); Lexicon.Bridge = buildLexicon(Bridge.Map); Report.push(['Bridge.js', Bridge.Map.size]);

  Say('Main + Bridge done');
  Report.push(['Capture.html', Page('Capture', Bundle(path.join(App, 'A1/Capture.js'), ''), path.join(App, 'A1/Capture.html'), 'Capture.html', Lexicon)]);
  Report.push(['Setup.html', Page('Setup', Bundle(path.join(App, 'A2/Setup.js'), ''), path.join(App, 'A2/Setup.html'), 'Setup.html', Lexicon)]);
  const Viewer = Bundle(path.join(App, 'A2/Viewer.js'), '');
  Report.push(['Viewer.html', Page('Viewer', Viewer, path.join(App, 'A2/Viewer.html'), 'Viewer.html', Lexicon)]);
  fs.writeFileSync(path.join(Out, 'Lexicon.json'), JSON.stringify(Lexicon, null, 2));
  fs.copyFileSync(path.join(App, 'Rules.json'), path.join(Out, 'Rules.json'));

  Say('pages done');
  if (process.platform === 'darwin') {
    const Swift = path.join(App, 'A1/Keys.swift');
    try {
      for (const Arch of ['x86_64', 'arm64']) execFileSync('swiftc', ['-O', '-target', `${Arch}-apple-macos13`, '-o', path.join(Out, `Keys-${Arch}`), Swift], { stdio: 'pipe' });
      execFileSync('lipo', ['-create', '-output', path.join(Out, 'Keys'), path.join(Out, 'Keys-x86_64'), path.join(Out, 'Keys-arm64')]);
      fs.rmSync(path.join(Out, 'Keys-x86_64')); fs.rmSync(path.join(Out, 'Keys-arm64'));
      Report.push(['Keys (universal)', 0]);
    } catch (Failure) { Fail(`Keys helper did not build: ${String(Failure.stderr || Failure.message).split('\n')[0]}`); }
  }
  fs.writeFileSync(path.join(Out, 'package.json'), JSON.stringify({ name: 'arc', type: 'module', main: 'Main.js' }));
  return Report;
}

// ---- run ----
const ConfigText = Config();
Say('config read');
for (const File of Walk(Here).filter(Name => Name.endsWith('.js') && !Name.includes(`${path.sep}Build${path.sep}`))) { Syntax(Read(File), File.endsWith('Bridge.js') ? '.cjs' : '.mjs', Rel(File)); if (File.startsWith(App) && !File.endsWith('Config.Example.js')) Lint(File, Read(File)); }
Say('syntax ok');
if (Mode !== 'seal') Verify();
Say('hashes checked');

if (!Problems.length && (Mode === 'build' || Mode === 'pack')) {
  const Report = Build(ConfigText);
  if (!Problems.length) {
    for (const File of fs.readdirSync(Out).sort()) console.log(`  ${File.padEnd(14)} ${Sha(fs.readFileSync(path.join(Out, File))).slice(0, 12)}`);
    console.log(Report.map(Row => `${Row[0]}${Row[1] ? ` (${Row[1]} names)` : ''}`).join(', '));
  }
}

if (Problems.length) { console.error('Source is not valid:\n' + Problems.map(Text => '  - ' + Text).join('\n')); process.exit(1); }
if (Mode === 'seal') {
  fs.writeFileSync(Manifest, JSON.stringify(Current, null, 2) + '\n');
  console.log(`sealed ${Object.keys(Current).length} files`);
} else console.log(`${Object.keys(Current).length} files match Hashes.json`);

if (Mode === 'pack') {
  execFileSync('npx', ['electron-builder', '--mac', '--win', '--publish', 'never'], { cwd: App, stdio: 'inherit' });
}
