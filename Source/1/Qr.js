// Arc 1 Qr: a small QR encoder (byte mode, error correction M, versions 1 to 6: up to 106 bytes). Qr(text) -> array of rows of booleans, or null if too long.
const Versions = [null,
  { Data: 16, Ec: 10, Blocks: 1, Align: [] },
  { Data: 28, Ec: 16, Blocks: 1, Align: [6, 18] },
  { Data: 44, Ec: 26, Blocks: 1, Align: [6, 22] },
  { Data: 64, Ec: 18, Blocks: 2, Align: [6, 26] },
  { Data: 86, Ec: 24, Blocks: 2, Align: [6, 30] },
  { Data: 108, Ec: 16, Blocks: 4, Align: [6, 34] },
];

const Exp = new Uint8Array(512), Log = new Uint8Array(256);
for (let Index = 0, Value = 1; Index < 255; Index++) { Exp[Index] = Value; Log[Value] = Index; Value <<= 1; if (Value & 256) Value ^= 285; }
for (let Index = 255; Index < 512; Index++) Exp[Index] = Exp[Index - 255];
const Times = (A, B) => (A && B ? Exp[Log[A] + Log[B]] : 0);

function Parity(Data, Count) {
  let Poly = [1];
  for (let Index = 0; Index < Count; Index++) {
    const Next = new Array(Poly.length + 1).fill(0);
    for (let At = 0; At < Poly.length; At++) { Next[At] ^= Poly[At]; Next[At + 1] ^= Times(Poly[At], Exp[Index]); }
    Poly = Next;
  }
  const Rest = Data.concat(new Array(Count).fill(0));
  for (let At = 0; At < Data.length; At++) {
    const Lead = Rest[At];
    if (Lead) for (let Step = 0; Step < Poly.length; Step++) Rest[At + Step] ^= Times(Poly[Step], Lead);
  }
  return Rest.slice(Data.length);
}

function Bits(Bytes, Spec) {
  const Out = [];
  const Put = (Value, Count) => { for (let Bit = Count - 1; Bit >= 0; Bit--) Out.push((Value >> Bit) & 1); };
  Put(4, 4); Put(Bytes.length, 8);
  Bytes.forEach(Byte => Put(Byte, 8));
  const Capacity = Spec.Data * 8;
  Put(0, Math.min(4, Capacity - Out.length));
  while (Out.length % 8) Out.push(0);
  for (let Pad = 0; Out.length < Capacity; Pad++) Put(Pad % 2 ? 17 : 236, 8);
  const Words = [];
  for (let At = 0; At < Out.length; At += 8) Words.push(parseInt(Out.slice(At, At + 8).join(''), 2));
  return Words;
}

function Interleave(Words, Spec) {
  const Size = Spec.Data / Spec.Blocks, Blocks = [], Codes = [];
  for (let Block = 0; Block < Spec.Blocks; Block++) { const Part = Words.slice(Block * Size, (Block + 1) * Size); Blocks.push(Part); Codes.push(Parity(Part, Spec.Ec)); }
  const Out = [];
  for (let At = 0; At < Size; At++) Blocks.forEach(Part => Out.push(Part[At]));
  for (let At = 0; At < Spec.Ec; At++) Codes.forEach(Part => Out.push(Part[At]));
  return Out;
}

function Format(Mask) {
  let Value = (0 << 3) | Mask, Rem = Value << 10;                       // level M = 00
  for (let Bit = 14; Bit >= 10; Bit--) if ((Rem >> Bit) & 1) Rem ^= 0x537 << (Bit - 10);
  return ((Value << 10) | Rem) ^ 0x5412;
}

const Masks = [
  (R, C) => (R + C) % 2 === 0, (R) => R % 2 === 0, (R, C) => C % 3 === 0, (R, C) => (R + C) % 3 === 0,
  (R, C) => (Math.floor(R / 2) + Math.floor(C / 3)) % 2 === 0, (R, C) => ((R * C) % 2) + ((R * C) % 3) === 0,
  (R, C) => (((R * C) % 2) + ((R * C) % 3)) % 2 === 0, (R, C) => (((R + C) % 2) + ((R * C) % 3)) % 2 === 0,
];

function Penalty(Grid) {
  const Size = Grid.length;
  let Score = 0;
  for (let Pass = 0; Pass < 2; Pass++) {
    for (let A = 0; A < Size; A++) {
      let Run = 1;
      for (let B = 1; B < Size; B++) {
        const Same = (Pass ? Grid[B][A] === Grid[B - 1][A] : Grid[A][B] === Grid[A][B - 1]);
        if (Same) Run++; else { if (Run >= 5) Score += Run - 2; Run = 1; }
      }
      if (Run >= 5) Score += Run - 2;
    }
  }
  for (let R = 0; R < Size - 1; R++) for (let C = 0; C < Size - 1; C++) { const V = Grid[R][C]; if (V === Grid[R][C + 1] && V === Grid[R + 1][C] && V === Grid[R + 1][C + 1]) Score += 3; }
  let Dark = 0;
  Grid.forEach(Row => Row.forEach(V => { if (V) Dark++; }));
  return Score + Math.floor(Math.abs((Dark * 100) / (Size * Size) - 50) / 5) * 10;
}

export function Qr(Text) {
  const Bytes = Array.from(new TextEncoder().encode(Text));
  let Version = 1;
  while (Version < Versions.length && Bytes.length > Versions[Version].Data - 2) Version++;
  if (Version >= Versions.length) return null;
  const Spec = Versions[Version], Size = 17 + Version * 4;
  const Data = Interleave(Bits(Bytes, Spec), Spec);
  const Bit = [];
  Data.forEach(Word => { for (let At = 7; At >= 0; At--) Bit.push((Word >> At) & 1); });
  for (let Pad = 0; Pad < 7; Pad++) Bit.push(0);                          // remainder bits (versions 2 to 6)
  if (Version === 1) Bit.length -= 7;

  const Grid = Array.from({ length: Size }, () => new Array(Size).fill(false));
  const Fixed = Array.from({ length: Size }, () => new Array(Size).fill(false));
  const Set = (R, C, V) => { if (R >= 0 && C >= 0 && R < Size && C < Size) { Grid[R][C] = V; Fixed[R][C] = true; } };
  const Finder = (R, C) => { for (let Dr = -1; Dr <= 7; Dr++) for (let Dc = -1; Dc <= 7; Dc++) { const Ring = Math.max(Math.abs(Dr - 3), Math.abs(Dc - 3)); Set(R + Dr, C + Dc, Ring !== 4 && (Ring !== 2) && Dr >= 0 && Dr <= 6 && Dc >= 0 && Dc <= 6); } };
  Finder(0, 0); Finder(0, Size - 7); Finder(Size - 7, 0);
  for (let At = 8; At < Size - 8; At++) { Set(6, At, At % 2 === 0); Set(At, 6, At % 2 === 0); }
  const Spots = Spec.Align;
  Spots.forEach(R => Spots.forEach(C => {
    if (Fixed[R][C]) return;                                              // skips the three that overlap a finder pattern
    for (let Dr = -2; Dr <= 2; Dr++) for (let Dc = -2; Dc <= 2; Dc++) Set(R + Dr, C + Dc, Math.max(Math.abs(Dr), Math.abs(Dc)) !== 1);
  }));
  Set(Size - 8, 8, true);                                                 // the dark module
  for (let At = 0; At < 9; At++) { Fixed[8][At] = true; Fixed[At][8] = true; }
  for (let At = 0; At < 8; At++) { Fixed[8][Size - 1 - At] = true; Fixed[Size - 1 - At][8] = true; }

  const Place = Mask => {
    const Copy = Grid.map(Row => Row.slice());
    let At = 0, Up = true;
    for (let C = Size - 1; C > 0; C -= 2) {
      if (C === 6) C--;
      for (let Step = 0; Step < Size; Step++) {
        const R = Up ? Size - 1 - Step : Step;
        for (let Dc = 0; Dc < 2; Dc++) {
          const Col = C - Dc;
          if (Fixed[R][Col]) continue;
          const Value = At < Bit.length ? Bit[At++] === 1 : false;
          Copy[R][Col] = Value !== Masks[Mask](R, Col);
        }
      }
      Up = !Up;
    }
    const Info = Format(Mask);
    const Put = (R, C, Index) => { Copy[R][C] = ((Info >> Index) & 1) === 1; };
    for (let Index = 0; Index < 6; Index++) Put(Index, 8, Index);
    Put(7, 8, 6); Put(8, 8, 7); Put(8, 7, 8);
    for (let Index = 9; Index < 15; Index++) Put(8, 14 - Index, Index);
    for (let Index = 0; Index < 8; Index++) Put(8, Size - 1 - Index, Index);
    for (let Index = 8; Index < 15; Index++) Put(Size - 15 + Index, 8, Index);
    Copy[Size - 8][8] = true;
    return Copy;
  };
  let Best = null, Low = Infinity;
  for (let Mask = 0; Mask < 8; Mask++) { const Try = Place(Mask), Score = Penalty(Try); if (Score < Low) { Low = Score; Best = Try; } }
  return Best;
}
