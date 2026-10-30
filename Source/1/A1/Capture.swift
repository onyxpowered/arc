// Capture: captures the main display (ScreenCaptureKit), encodes H.264 in hardware (VideoToolbox) and injects input (CGEvent).
// stdout frames: [type u8][len u32 BE][ptsMs u64 BE][payload]; type 1 = delta, 2 = key (Annex-B, SPS/PPS inline), 0 = info JSON.
// stdin: one JSON object per line. {"t":"keyframe"} or input events {"t":"a","x":0..1,"y":0..1}, {"t":"b","d":1,"b":0},
// {"t":"w","dx":..,"dy":..}, {"t":"k","d":1,"code":"KeyA"}, {"t":"reset"}.
import Foundation
import ScreenCaptureKit
import VideoToolbox
import CoreMedia
import CoreGraphics
import ApplicationServices

func arg(_ name: String, _ def: Int) -> Int {
    let a = CommandLine.arguments
    if let i = a.firstIndex(of: "--" + name), i + 1 < a.count, let v = Int(a[i + 1]) { return v }
    return def
}
func log(_ s: String) { FileHandle.standardError.write(Data((s + "\n").utf8)) }

let outW = arg("w", 1366), fps = arg("fps", 30), kbps = arg("kbps", 3000)
let debug = ProcessInfo.processInfo.environment["ARC_DEBUG"] != nil
var dbgRx = 0
var keep: [Any] = []
let outQ = DispatchQueue(label: "arc.out")

func emit(_ type: UInt8, _ payload: Data, pts: UInt64) {
    var h = Data(capacity: 13)
    h.append(type)
    var l = UInt32(payload.count).bigEndian; h.append(Data(bytes: &l, count: 4))
    var p = pts.bigEndian; h.append(Data(bytes: &p, count: 8))
    outQ.async { FileHandle.standardOutput.write(h + payload) }
}

// MARK: encoder
final class Encoder {
    var session: VTCompressionSession?
    var last: CVPixelBuffer?
    var wantKey = true
    var lastAt = Date.distantPast
    let q = DispatchQueue(label: "arc.enc")
    let start = DispatchTime.now().uptimeNanoseconds

    init(width: Int, height: Int) {
        var s: VTCompressionSession?
        let st = VTCompressionSessionCreate(allocator: nil, width: Int32(width), height: Int32(height), codecType: kCMVideoCodecType_H264,
            encoderSpecification: nil, imageBufferAttributes: nil, compressedDataAllocator: nil, outputCallback: nil, refcon: nil, compressionSessionOut: &s)
        guard st == noErr, let s else { log("VTCompressionSessionCreate failed \(st)"); exit(2) }
        func set(_ k: CFString, _ v: CFTypeRef) { VTSessionSetProperty(s, key: k, value: v) }
        set(kVTCompressionPropertyKey_RealTime, kCFBooleanTrue)
        set(kVTCompressionPropertyKey_ProfileLevel, kVTProfileLevel_H264_Baseline_AutoLevel)
        set(kVTCompressionPropertyKey_AllowFrameReordering, kCFBooleanFalse)
        set(kVTCompressionPropertyKey_AverageBitRate, (kbps * 1000) as CFNumber)
        set(kVTCompressionPropertyKey_DataRateLimits, [kbps * 1000 * 3 / 16, 1] as CFArray) // bytes per second cap ≈ 1.5x average
        set(kVTCompressionPropertyKey_ExpectedFrameRate, fps as CFNumber)
        set(kVTCompressionPropertyKey_MaxKeyFrameInterval, (fps * 5) as CFNumber)
        VTCompressionSessionPrepareToEncodeFrames(s)
        session = s
    }

    func encode(_ pb: CVPixelBuffer) {
        q.async {
            self.last = pb; self.lastAt = Date()
            self.encodeLocked(pb)
        }
    }
    func encodeLocked(_ pb: CVPixelBuffer) {
        guard let session else { return }
        let ns = DispatchTime.now().uptimeNanoseconds - start
        let pts = CMTime(value: Int64(ns / 1000), timescale: 1_000_000)
        var props: CFDictionary? = nil
        if wantKey { wantKey = false; props = [kVTEncodeFrameOptionKey_ForceKeyFrame: true] as CFDictionary }
        VTCompressionSessionEncodeFrame(session, imageBuffer: pb, presentationTimeStamp: pts, duration: .invalid, frameProperties: props, infoFlagsOut: nil) { status, _, sb in
            if debug { log("enc cb status=\(status) sb=\(sb != nil)") }
            guard status == noErr, let sb else { return }
            self.output(sb, ms: UInt64(ns / 1_000_000))
        }
    }
    func requestKey() { q.async { self.wantKey = true; if let l = self.last { self.encodeLocked(l) } } }
    // static screens deliver no frames; re-encode the last one so the stream (and late joiners) stay alive
    func idleTick() { q.async { if let l = self.last, Date().timeIntervalSince(self.lastAt) > 0.9 { self.encodeLocked(l) } } }

    func output(_ sb: CMSampleBuffer, ms: UInt64) {
        guard let block = CMSampleBufferGetDataBuffer(sb) else { return }
        var key = true
        if let arr = CMSampleBufferGetSampleAttachmentsArray(sb, createIfNecessary: false) as? [[CFString: Any]], let a = arr.first {
            key = !(a[kCMSampleAttachmentKey_NotSync] as? Bool ?? false)
        }
        var out = Data()
        let sc: [UInt8] = [0, 0, 0, 1]
        if key, let fd = CMSampleBufferGetFormatDescription(sb) {
            for i in 0..<2 {
                var p: UnsafePointer<UInt8>?; var n = 0
                if CMVideoFormatDescriptionGetH264ParameterSetAtIndex(fd, parameterSetIndex: i, parameterSetPointerOut: &p, parameterSetSizeOut: &n, parameterSetCountOut: nil, nalUnitHeaderLengthOut: nil) == noErr, let p {
                    out.append(contentsOf: sc); out.append(p, count: n)
                }
            }
        }
        var total = 0; var ptr: UnsafeMutablePointer<Int8>?
        guard CMBlockBufferGetDataPointer(block, atOffset: 0, lengthAtOffsetOut: nil, totalLengthOut: &total, dataPointerOut: &ptr) == kCMBlockBufferNoErr, let ptr else { return }
        let raw = UnsafeRawPointer(ptr)
        var off = 0
        while off + 4 <= total {
            let len = Int(UInt32(bigEndian: raw.loadUnaligned(fromByteOffset: off, as: UInt32.self)))
            off += 4
            if len <= 0 || off + len > total { break }
            out.append(contentsOf: sc); out.append(Data(bytes: raw + off, count: len))
            off += len
        }
        emit(key ? 2 : 1, out, pts: ms)
    }
}

// MARK: capture
final class Capture: NSObject, SCStreamOutput, SCStreamDelegate {
    let enc: Encoder
    init(enc: Encoder) { self.enc = enc }
    func stream(_ stream: SCStream, didOutputSampleBuffer sb: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen, sb.isValid else { return }
        if debug { dbgRx += 1 }
        guard let arr = CMSampleBufferGetSampleAttachmentsArray(sb, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
              let raw = arr.first?[.status] as? Int, SCFrameStatus(rawValue: raw) == .complete,
              let pb = CMSampleBufferGetImageBuffer(sb) else { return }
        enc.encode(pb)
    }
    func stream(_ stream: SCStream, didStopWithError error: Error) { log("capture stopped: \(error)"); exit(3) }
}

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
if !CGPreflightScreenCaptureAccess() { log("Screen Recording permission missing; requesting"); _ = CGRequestScreenCaptureAccess() }
let trusted = AXIsProcessTrustedWithOptions([kAXTrustedCheckOptionPrompt.takeUnretainedValue(): true] as CFDictionary)
if !trusted { log("Accessibility permission missing: input will not work until it is granted") }

SCShareableContent.getExcludingDesktopWindows(false, onScreenWindowsOnly: false) { content, error in
    guard let content, let display = content.displays.first(where: { $0.displayID == CGMainDisplayID() }) ?? content.displays.first else {
        log("no display / no permission: \(String(describing: error))"); exit(1)
    }
    let w = outW & ~1, h = Int((Double(outW) * Double(display.height) / Double(display.width)).rounded()) & ~1
    let enc = Encoder(width: w, height: h)
    let cfg = SCStreamConfiguration()
    cfg.width = w; cfg.height = h
    cfg.pixelFormat = kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange
    cfg.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale(fps))
    cfg.showsCursor = true
    cfg.queueDepth = 4
    let cap = Capture(enc: enc)
    let stream = SCStream(filter: SCContentFilter(display: display, excludingWindows: []), configuration: cfg, delegate: cap)
    do {
        try stream.addStreamOutput(cap, type: .screen, sampleHandlerQueue: DispatchQueue(label: "arc.cap"))
    } catch { log("addStreamOutput: \(error)"); exit(1) }
    keep.append(stream); keep.append(cap); keep.append(enc)
    stream.startCapture { err in
        if let err { log("startCapture: \(err)"); exit(1) }
        let info = "{\"w\":\(w),\"h\":\(h),\"fps\":\(fps),\"kbps\":\(kbps),\"trusted\":\(trusted)}"
        emit(0, Data(info.utf8), pts: 0)
        log("capturing \(display.width)x\(display.height) -> \(w)x\(h) @\(fps)fps \(kbps)kbps")
    }
    let tick = DispatchSource.makeTimerSource(queue: DispatchQueue(label: "arc.tick"))
    tick.schedule(deadline: .now() + 1, repeating: 1.0)
    tick.setEventHandler { enc.idleTick(); if debug { log("rx frames: \(dbgRx)") } }
    tick.resume()
    keep.append(tick)

    let input = Input()
    DispatchQueue.global().async {
        while let line = readLine(strippingNewline: true) {
            guard let d = line.data(using: .utf8), let m = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any] else { continue }
            if m["t"] as? String == "keyframe" { enc.requestKey() } else { DispatchQueue.main.async { input.handle(m) } }
        }
        exit(0) // host closed our stdin
    }
}
RunLoop.main.run()
