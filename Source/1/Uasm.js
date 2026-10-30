// UASM, Unicode Assembly: raw bytes <-> JSON-safe text for the Realtime Database.
// 85 printable characters, none needing a JSON escape; every 4 bytes become 5 characters (25% bigger, base64 is 33%).
const Alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.-:+=^!/*?&<>()[]{}@%$#';
const Codes = new Uint8Array(85);
const Lookup = new Uint8Array(128).fill(255);
for (let Index = 0; Index < 85; Index++) { Codes[Index] = Alphabet.charCodeAt(Index); Lookup[Codes[Index]] = Index; }

export function Pack(Bytes) {
  const Groups = Math.ceil(Bytes.length / 4), Out = new Uint8Array(Groups * 5);
  for (let Group = 0; Group < Groups; Group++) {
    const At = Group * 4;
    let Value = (((Bytes[At] || 0) * 256 + (Bytes[At + 1] || 0)) * 256 + (Bytes[At + 2] || 0)) * 256 + (Bytes[At + 3] || 0);
    for (let Digit = 4; Digit >= 0; Digit--) { Out[Group * 5 + Digit] = Codes[Value % 85]; Value = Math.floor(Value / 85); }
  }
  return new TextDecoder('latin1').decode(Out);
}

// Length is the original byte count (the last group is zero-padded)
export function Unpack(Text, Length) {
  const Groups = Math.floor(Text.length / 5), Out = new Uint8Array(Groups * 4);
  for (let Group = 0; Group < Groups; Group++) {
    let Value = 0;
    for (let Digit = 0; Digit < 5; Digit++) Value = Value * 85 + Lookup[Text.charCodeAt(Group * 5 + Digit) & 127];
    Out[Group * 4] = Value >>> 24; Out[Group * 4 + 1] = (Value >>> 16) & 255; Out[Group * 4 + 2] = (Value >>> 8) & 255; Out[Group * 4 + 3] = Value & 255;
  }
  return Out.subarray(0, Length);
}
