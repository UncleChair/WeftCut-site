// mouse.swift — drive the real OS cursor via CGEvents (HID tap).
// Usage:
//   swift mouse.swift move X Y [steps]     smooth move
//   swift mouse.swift click X Y            move + left click
//   swift mouse.swift drag X1 Y1 X2 Y2 [steps]  left-drag with easing
//   swift mouse.swift down X Y / up X Y    button state
//   swift mouse.swift wheel X Y DY         scroll wheel at point
// Coordinates are in screen POINTS (top-left origin).
import CoreGraphics
import Foundation

let args = CommandLine.arguments
func num(_ i: Int, _ def: Double = 0) -> Double { i < args.count ? Double(args[i]) ?? def : def }
func post(_ e: CGEvent?) { e?.post(tap: CGEventTapLocation.cghidEventTap) }
func sleepMs(_ ms: Int) { usleep(UInt32(ms * 1000)) }

func moveTo(_ x: Double, _ y: Double, steps: Int = 24, from: CGPoint? = nil) {
    let start = from ?? CGEvent(source: nil)?.location ?? CGPoint(x: 0, y: 0)
    let n = max(1, steps)
    for i in 1...n {
        let t = Double(i) / Double(n)
        let e = 0.5 - 0.5 * cos(Double.pi * t) // ease in-out
        let p = CGPoint(x: start.x + (CGFloat(x) - start.x) * e,
                        y: start.y + (CGFloat(y) - start.y) * e)
        let ev = CGEvent(mouseEventSource: nil, mouseType: .mouseMoved,
                         mouseCursorPosition: p, mouseButton: .left)
        post(ev)
        sleepMs(8)
    }
}

let cmd = args.count > 1 ? args[1] : ""
switch cmd {
case "move":
    moveTo(num(2), num(3), steps: Int(num(4, 24)))
case "click":
    let p = CGPoint(x: num(2), y: num(3))
    moveTo(p.x, p.y, steps: Int(num(4, 24)))
    sleepMs(120)
    post(CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: p, mouseButton: .left))
    sleepMs(70)
    post(CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: p, mouseButton: .left))
case "down":
    let p = CGPoint(x: num(2), y: num(3))
    moveTo(p.x, p.y, steps: 16)
    sleepMs(80)
    post(CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: p, mouseButton: .left))
case "up":
    let p = CGPoint(x: num(2), y: num(3))
    post(CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: p, mouseButton: .left))
case "drag":
    let (x1, y1, x2, y2) = (num(2), num(3), num(4), num(5))
    let steps = Int(num(6, 40))
    let p0 = CGPoint(x: x1, y: y1)
    moveTo(x1, y1, steps: 18)
    sleepMs(150)
    post(CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: p0, mouseButton: .left))
    sleepMs(200) // hold so drag-arm timers fire
    for i in 1...steps {
        let t = Double(i) / Double(steps)
        let e = 0.5 - 0.5 * cos(Double.pi * t)
        let p = CGPoint(x: x1 + (x2 - x1) * e, y: y1 + (y2 - y1) * e)
        post(CGEvent(mouseEventSource: nil, mouseType: .leftMouseDragged, mouseCursorPosition: p, mouseButton: .left))
        sleepMs(12)
    }
    sleepMs(120)
    post(CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: CGPoint(x: x2, y: y2), mouseButton: .left))
case "wheel":
    let (x, y, dy) = (num(2), num(3), Int32(num(4, 120)))
    moveTo(x, y, steps: 14)
    sleepMs(80)
    // 6 notches for a visible scroll; sign per argument
    for _ in 0..<6 {
        let ev = CGEvent(scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 1, wheel1: dy, wheel2: 0, wheel3: 0)
        post(ev)
        sleepMs(40)
    }
case "cwheel": // wheel with a modifier held (1=ctrl 2=shift 4=cmd 8=alt) [notches]
    let (x, y, dy) = (num(2), num(3), Int32(num(4, 120)))
    let mod = Int(num(5, 1))
    let notches = Int(num(6, 8))
    moveTo(x, y, steps: 14)
    sleepMs(80)
    var flags = CGEventFlags()
    if mod & 1 != 0 { flags.insert(.maskControl) }
    if mod & 2 != 0 { flags.insert(.maskShift) }
    if mod & 4 != 0 { flags.insert(.maskCommand) }
    if mod & 8 != 0 { flags.insert(.maskAlternate) }
    for _ in 0..<notches {
        let ev = CGEvent(scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 1, wheel1: dy, wheel2: 0, wheel3: 0)
        ev?.flags = flags
        post(ev)
        sleepMs(45)
    }
default:
    FileHandle.standardError.write("usage: move|click|down|up|drag|wheel …\n".data(using: .utf8)!)
    exit(2)
}
