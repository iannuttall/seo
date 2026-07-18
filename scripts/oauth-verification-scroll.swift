import CoreGraphics
import Foundation

func postMouse(_ type: CGEventType, at point: CGPoint) {
    CGEvent(
        mouseEventSource: nil,
        mouseType: type,
        mouseCursorPosition: point,
        mouseButton: .left
    )?.post(tap: .cghidEventTap)
}

func focusPoint() -> CGPoint {
    let bounds = CGDisplayBounds(CGMainDisplayID())
    return CGPoint(
        x: bounds.minX + bounds.width * 0.72,
        y: bounds.minY + bounds.height * 0.68
    )
}

func focusPage() {
    for _ in 0..<2 {
        CGEvent(keyboardEventSource: nil, virtualKey: 53, keyDown: true)?
            .post(tap: .cghidEventTap)
        CGEvent(keyboardEventSource: nil, virtualKey: 53, keyDown: false)?
            .post(tap: .cghidEventTap)
        usleep(80_000)
    }
    let point = focusPoint()
    postMouse(.mouseMoved, at: point)
    usleep(80_000)
    postMouse(.leftMouseDown, at: point)
    postMouse(.leftMouseUp, at: point)
    usleep(120_000)
}

func pressHome() {
    focusPage()
    CGEvent(keyboardEventSource: nil, virtualKey: 115, keyDown: true)?
        .post(tap: .cghidEventTap)
    CGEvent(keyboardEventSource: nil, virtualKey: 115, keyDown: false)?
        .post(tap: .cghidEventTap)
}

func scroll(direction: String, steps: Int, delayMilliseconds: Int) {
    focusPage()
    let amount: Int32 = direction == "up" ? 36 : -36
    for _ in 0..<steps {
        CGEvent(
            scrollWheelEvent2Source: nil,
            units: .pixel,
            wheelCount: 1,
            wheel1: amount,
            wheel2: 0,
            wheel3: 0
        )?.post(tap: .cghidEventTap)
        usleep(useconds_t(max(10, delayMilliseconds) * 1_000))
    }
}

let arguments = CommandLine.arguments
guard arguments.count >= 2 else {
    fputs("Expected home or scroll.\n", stderr)
    exit(2)
}

switch arguments[1] {
case "home":
    pressHome()
case "scroll":
    guard arguments.count >= 5,
          let steps = Int(arguments[3]),
          let delayMilliseconds = Int(arguments[4]) else {
        fputs("Expected scroll <up|down> <steps> <delay-ms>.\n", stderr)
        exit(2)
    }
    scroll(direction: arguments[2], steps: steps, delayMilliseconds: delayMilliseconds)
default:
    fputs("Unknown action: \(arguments[1])\n", stderr)
    exit(2)
}
