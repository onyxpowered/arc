// Keys: injects mouse and keyboard events (CGEvent) read as JSON lines from stdin. Exits when stdin closes.
// stdin: {"t":"a","x":0..1,"y":0..1}, {"t":"b","d":1,"b":0}, {"t":"w","dx":..,"dy":..}, {"t":"k","d":1,"code":"KeyA"}, {"t":"reset"}.
import Foundation
import CoreGraphics
import ApplicationServices

func log(_ s: String) { FileHandle.standardError.write(Data((s + "\n").utf8)) }

// MARK: input
let keymap: [String: CGKeyCode] = [
    "KeyA": 0, "KeyS": 1, "KeyD": 2, "KeyF": 3, "KeyH": 4, "KeyG": 5, "KeyZ": 6, "KeyX": 7, "KeyC": 8, "KeyV": 9, "IntlBackslash": 10, "KeyB": 11,
    "KeyQ": 12, "KeyW": 13, "KeyE": 14, "KeyR": 15, "KeyY": 16, "KeyT": 17, "Digit1": 18, "Digit2": 19, "Digit3": 20, "Digit4": 21, "Digit6": 22,
    "Digit5": 23, "Equal": 24, "Digit9": 25, "Digit7": 26, "Minus": 27, "Digit8": 28, "Digit0": 29, "BracketRight": 30, "KeyO": 31, "KeyU": 32,
    "BracketLeft": 33, "KeyI": 34, "KeyP": 35, "Enter": 36, "KeyL": 37, "KeyJ": 38, "Quote": 39, "KeyK": 40, "Semicolon": 41, "Backslash": 42,
    "Comma": 43, "Slash": 44, "KeyN": 45, "KeyM": 46, "Period": 47, "Tab": 48, "Space": 49, "Backquote": 50, "Backspace": 51, "Escape": 53,
    "MetaRight": 54, "MetaLeft": 55, "ShiftLeft": 56, "CapsLock": 57, "AltLeft": 58, "ControlLeft": 59, "ShiftRight": 60, "AltRight": 61, "ControlRight": 62,
    "NumpadDecimal": 65, "NumpadMultiply": 67, "NumpadAdd": 69, "NumpadDivide": 75, "NumpadEnter": 76, "NumpadSubtract": 78, "NumpadEqual": 81,
    "Numpad0": 82, "Numpad1": 83, "Numpad2": 84, "Numpad3": 85, "Numpad4": 86, "Numpad5": 87, "Numpad6": 88, "Numpad7": 89, "Numpad8": 91, "Numpad9": 92,
    "F5": 96, "F6": 97, "F7": 98, "F3": 99, "F8": 100, "F9": 101, "F11": 103, "F10": 109, "F12": 111, "Home": 115, "PageUp": 116, "Delete": 117,
    "F4": 118, "End": 119, "F2": 120, "PageDown": 121, "F1": 122, "ArrowLeft": 123, "ArrowRight": 124, "ArrowDown": 125, "ArrowUp": 126,
]
let modbit: [String: CGEventFlags] = [
    "ShiftLeft": .maskShift, "ShiftRight": .maskShift, "ControlLeft": .maskControl, "ControlRight": .maskControl,
    "AltLeft": .maskAlternate, "AltRight": .maskAlternate, "MetaLeft": .maskCommand, "MetaRight": .maskCommand,
]

final class Input {
    let src = CGEventSource(stateID: .hidSystemState)
    var pos = CGPoint.zero
    var buttons = Set<Int>()
    var downKeys = Set<String>()
    var flags = CGEventFlags()
    var lastClick = Date.distantPast, lastClickPos = CGPoint.zero, clicks = 1
    var bounds: CGRect { CGDisplayBounds(CGMainDisplayID()) }

    func handle(_ m: [String: Any]) {
        switch m["t"] as? String {
        case "a":
            guard let x = (m["x"] as? NSNumber)?.doubleValue, let y = (m["y"] as? NSNumber)?.doubleValue else { return }
            let b = bounds
            pos = CGPoint(x: b.minX + min(max(x, 0), 1) * (b.width - 1), y: b.minY + min(max(y, 0), 1) * (b.height - 1))
            let (type, btn): (CGEventType, CGMouseButton) =
                buttons.contains(0) ? (.leftMouseDragged, .left) : buttons.contains(2) ? (.rightMouseDragged, .right) : buttons.contains(1) ? (.otherMouseDragged, .center) : (.mouseMoved, .left)
            post(CGEvent(mouseEventSource: src, mouseType: type, mouseCursorPosition: pos, mouseButton: btn))
        case "b":
            let n = (m["b"] as? NSNumber)?.intValue ?? 0, down = ((m["d"] as? NSNumber)?.intValue ?? 0) == 1
            let btn: CGMouseButton = n == 2 ? .right : n == 1 ? .center : .left
            let type: CGEventType = n == 2 ? (down ? .rightMouseDown : .rightMouseUp) : n == 1 ? (down ? .otherMouseDown : .otherMouseUp) : (down ? .leftMouseDown : .leftMouseUp)
            if down {
                buttons.insert(n)
                if Date().timeIntervalSince(lastClick) < 0.4 && hypot(pos.x - lastClickPos.x, pos.y - lastClickPos.y) < 6 { clicks += 1 } else { clicks = 1 }
                lastClick = Date(); lastClickPos = pos
            } else { buttons.remove(n) }
            let e = CGEvent(mouseEventSource: src, mouseType: type, mouseCursorPosition: pos, mouseButton: btn)
            e?.setIntegerValueField(.mouseEventClickState, value: Int64(clicks))
            post(e)
        case "w":
            let dy = (m["dy"] as? NSNumber)?.doubleValue ?? 0, dx = (m["dx"] as? NSNumber)?.doubleValue ?? 0
            post(CGEvent(scrollWheelEvent2Source: src, units: .pixel, wheelCount: 2, wheel1: Int32(-dy.rounded()), wheel2: Int32(-dx.rounded()), wheel3: 0))
        case "k":
            guard let code = m["code"] as? String, let kc = keymap[code] else { return }
            let down = ((m["d"] as? NSNumber)?.intValue ?? 0) == 1
            if down { downKeys.insert(code) } else { downKeys.remove(code) }
            if let bit = modbit[code] {
                // recompute from held keys so left+right of the same modifier release correctly
                flags = []
                for k in downKeys { if let b = modbit[k] { flags.insert(b) } }
                _ = bit
            }
            let e = CGEvent(keyboardEventSource: src, virtualKey: kc, keyDown: down)
            e?.flags = flags
            post(e)
        case "reset":
            for code in downKeys { if let kc = keymap[code] { post(CGEvent(keyboardEventSource: src, virtualKey: kc, keyDown: false)) } }
            downKeys.removeAll(); flags = []
            for n in buttons {
                let type: CGEventType = n == 2 ? .rightMouseUp : n == 1 ? .otherMouseUp : .leftMouseUp
                post(CGEvent(mouseEventSource: src, mouseType: type, mouseCursorPosition: pos, mouseButton: n == 2 ? .right : n == 1 ? .center : .left))
            }
            buttons.removeAll()
        default: break
        }
    }
    func post(_ e: CGEvent?) { e?.post(tap: .cghidEventTap) }
}

// MARK: main
let trusted = AXIsProcessTrustedWithOptions([kAXTrustedCheckOptionPrompt.takeUnretainedValue(): false] as CFDictionary)
if !trusted { log("Accessibility permission missing: input will not work until it is granted") }
let input = Input()
DispatchQueue.global().async {
    while let line = readLine(strippingNewline: true) {
        guard let d = line.data(using: .utf8), let m = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any] else { continue }
        DispatchQueue.main.async { input.handle(m) }
    }
    exit(0)
}
RunLoop.main.run()
