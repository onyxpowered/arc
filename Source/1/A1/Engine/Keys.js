// Arc 1 Keys: puts the viewer's mouse and keyboard into this computer.
// macOS: the Keys helper (CGEvent). Windows: a PowerShell process calling SendInput. Events arrive as {t: a|b|w|k|reset, ...}.
import { spawn } from 'node:child_process';
import path from 'node:path';

const Script = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class ArcKeys {
  [StructLayout(LayoutKind.Sequential)] public struct MI { public int dx; public int dy; public uint data; public uint flags; public uint time; public IntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] public struct KI { public ushort vk; public ushort scan; public uint flags; public uint time; public IntPtr extra; }
  [StructLayout(LayoutKind.Explicit)] public struct U { [FieldOffset(0)] public MI mi; [FieldOffset(0)] public KI ki; }
  [StructLayout(LayoutKind.Sequential)] public struct IN { public uint type; public U u; }
  [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint n, IN[] i, int size);
  public static void Mouse(int x, int y, int data, uint flags) {
    IN[] i = new IN[1]; i[0].type = 0; i[0].u.mi.dx = x; i[0].u.mi.dy = y; i[0].u.mi.data = unchecked((uint)data); i[0].u.mi.flags = flags;
    SendInput(1, i, Marshal.SizeOf(typeof(IN)));
  }
  public static void Key(ushort vk, uint flags) {
    IN[] i = new IN[1]; i[0].type = 1; i[0].u.ki.vk = vk; i[0].u.ki.flags = flags;
    SendInput(1, i, Marshal.SizeOf(typeof(IN)));
  }
}
"@
while (($Line = [Console]::In.ReadLine()) -ne $null) {
  $P = $Line.Split(' ')
  if ($P[0] -eq 'm') { [ArcKeys]::Mouse([int]$P[1], [int]$P[2], [int]$P[3], [uint32]$P[4]) }
  elseif ($P[0] -eq 'k') { [ArcKeys]::Key([uint16]$P[1], [uint32]$P[2]) }
}
`;

// KeyboardEvent.code -> Windows virtual key
const Virtual = { Enter: 13, Escape: 27, Space: 32, Tab: 9, Backspace: 8, Delete: 46, Insert: 45, Home: 36, End: 35, PageUp: 33, PageDown: 34, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, CapsLock: 20,
  ShiftLeft: 160, ShiftRight: 161, ControlLeft: 162, ControlRight: 163, AltLeft: 164, AltRight: 165, MetaLeft: 91, MetaRight: 92,
  Minus: 189, Equal: 187, BracketLeft: 219, BracketRight: 221, Backslash: 220, Semicolon: 186, Quote: 222, Comma: 188, Period: 190, Slash: 191, Backquote: 192,
  NumpadMultiply: 106, NumpadAdd: 107, NumpadSubtract: 109, NumpadDecimal: 110, NumpadDivide: 111, NumpadEnter: 13 };
for (let Index = 0; Index < 26; Index++) Virtual['Key' + String.fromCharCode(65 + Index)] = 65 + Index;
for (let Index = 0; Index < 10; Index++) { Virtual['Digit' + Index] = 48 + Index; Virtual['Numpad' + Index] = 96 + Index; }
for (let Index = 0; Index < 12; Index++) Virtual['F' + (Index + 1)] = 112 + Index;
const Extended = new Set(['Delete', 'Insert', 'Home', 'End', 'PageUp', 'PageDown', 'ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'ControlRight', 'AltRight', 'MetaLeft', 'MetaRight', 'NumpadDivide', 'NumpadEnter']);

// mouse flags: move 1, left 2/4, right 8/16, middle 32/64, wheel 2048, hwheel 4096, absolute 32768
const Down = [2, 32, 8], Up = [4, 64, 16];

export function Keys(Folder) {
  const Helper = process.platform === 'darwin' ? [path.join(Folder, 'Keys'), []]
    : process.platform === 'win32' ? ['powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(Script, 'utf16le').toString('base64')]] : null;
  const Child = Helper ? spawn(Helper[0], Helper[1], { stdio: ['pipe', 'ignore', 'inherit'], windowsHide: true }) : null;
  if (Child) { Child.stdin.on('error', () => {}); Child.on('error', Failure => console.error('keys helper:', Failure.message)); }
  const Held = new Set(), Buttons = new Set();
  const Write = Line => Child?.stdin.write(Line + '\n');

  function Windows(Event) {
    if (Event.t === 'a') Write(`m ${Math.round(Math.min(1, Math.max(0, Event.x)) * 65535)} ${Math.round(Math.min(1, Math.max(0, Event.y)) * 65535)} 0 32769`);
    else if (Event.t === 'b') {
      const Which = Event.b === 2 ? 2 : Event.b === 1 ? 1 : 0;
      if (Event.d) Buttons.add(Which); else Buttons.delete(Which);
      Write(`m 0 0 0 ${(Event.d ? Down : Up)[Which]}`);
    }
    else if (Event.t === 'w') { if (Event.dy) Write(`m 0 0 ${Math.round(-Event.dy * 1.2)} 2048`); if (Event.dx) Write(`m 0 0 ${Math.round(Event.dx * 1.2)} 4096`); }
    else if (Event.t === 'k' && Virtual[Event.code]) {
      if (Event.d) Held.add(Event.code); else Held.delete(Event.code);
      Write(`k ${Virtual[Event.code]} ${(Event.d ? 0 : 2) | (Extended.has(Event.code) ? 1 : 0)}`);
    }
    else if (Event.t === 'reset') {
      Held.forEach(Code => Write(`k ${Virtual[Code]} ${2 | (Extended.has(Code) ? 1 : 0)}`));
      Buttons.forEach(Which => Write(`m 0 0 0 ${Up[Which]}`));
      Held.clear(); Buttons.clear();
    }
  }

  return {
    Send: Event => process.platform === 'win32' ? Windows(Event) : Write(JSON.stringify(Event)),
    Stop() { try { Child?.kill(); } catch {} },
  };
}
