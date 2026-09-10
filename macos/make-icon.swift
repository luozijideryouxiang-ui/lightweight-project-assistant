// 一键生成 .icns 图标
// 用 Core Graphics 直接画一张 Apple 风格的"三圈+小圆点"图，与 Web 端 brand-mark 一致
import Foundation
import AppKit
import CoreGraphics

@discardableResult
func drawIcon(size: Int, path: String) -> Bool {
    let s = CGFloat(size)
    let bitsPerComponent = 8
    let bytesPerRow = 0
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    let bitmapInfo: UInt32 = CGImageAlphaInfo.premultipliedLast.rawValue
    guard let ctx = CGContext(
        data: nil,
        width: size, height: size,
        bitsPerComponent: bitsPerComponent,
        bytesPerRow: bytesPerRow,
        space: colorSpace,
        bitmapInfo: bitmapInfo
    ) else { return false }

    let rect = CGRect(x: 0, y: 0, width: s, height: s)

    // 圆角矩形裁切
    let cornerRadius = s * 0.22
    let bgPath = NSBezierPath(roundedRect: rect, xRadius: cornerRadius, yRadius: cornerRadius)
    bgPath.addClip()
    ctx.addPath(bgPath.cgPath)
    ctx.setFillColor(CGColor(red: 0, green: 0, blue: 0, alpha: 1))
    ctx.fill(rect)

    // 渐变背景（蓝 → 紫 → 粉），对应 Web 端 brand-mark 风格
    let gradient = CGGradient(
        colorsSpace: colorSpace,
        colors: [
            CGColor(red: 0.196, green: 0.812, blue: 1.0, alpha: 1.0),     // 32cfff
            CGColor(red: 0.369, green: 0.361, blue: 0.902, alpha: 1.0),    // 5e5ce6
            CGColor(red: 1.0, green: 0.216, blue: 0.373, alpha: 1.0)       // ff375f
        ] as CFArray,
        locations: [0.0, 0.55, 1.0]
    )!
    ctx.drawLinearGradient(
        gradient,
        start: CGPoint(x: 0, y: 0),
        end: CGPoint(x: s, y: s),
        options: [.drawsBeforeStartLocation, .drawsAfterEndLocation]
    )

    // 高光（上半部分更亮）
    let highlight = CGGradient(
        colorsSpace: colorSpace,
        colors: [
            CGColor(red: 1, green: 1, blue: 1, alpha: 0.45),
            CGColor(red: 1, green: 1, blue: 1, alpha: 0)
        ] as CFArray,
        locations: [0.0, 0.55]
    )!
    ctx.saveGState()
    ctx.clip(to: CGRect(x: 0, y: s * 0.45, width: s, height: s * 0.55))
    ctx.drawLinearGradient(
        highlight,
        start: CGPoint(x: 0, y: s),
        end: CGPoint(x: 0, y: s * 0.5),
        options: [.drawsBeforeStartLocation, .drawsAfterEndLocation]
    )
    ctx.restoreGState()

    // 中心大圆环
    let ringWidth = s * 0.05
    let ringRadius = s * 0.27
    ctx.setLineWidth(ringWidth)
    ctx.setStrokeColor(CGColor(red: 0.98, green: 0.99, blue: 1.0, alpha: 0.92))
    ctx.strokeEllipse(in: CGRect(
        x: s / 2 - ringRadius,
        y: s / 2 - ringRadius,
        width: ringRadius * 2,
        height: ringRadius * 2
    ))

    // 中心小圆点
    let dotRadius = s * 0.08
    ctx.setFillColor(CGColor(red: 0.95, green: 0.99, blue: 1.0, alpha: 1.0))
    ctx.fillEllipse(in: CGRect(
        x: s / 2 - dotRadius / 2,
        y: s / 2 - dotRadius / 2,
        width: dotRadius,
        height: dotRadius
    ))

    // 右上角小圆点（to-do check 提示）
    let cornerRadius2 = s * 0.045
    ctx.setFillColor(CGColor(red: 0.98, green: 0.99, blue: 1.0, alpha: 0.95))
    let offsetX = s * 0.18
    let offsetY = s * 0.18
    ctx.fillEllipse(in: CGRect(
        x: s / 2 + offsetX - cornerRadius2 / 2,
        y: s / 2 + offsetY - cornerRadius2 / 2,
        width: cornerRadius2,
        height: cornerRadius2
    ))
    ctx.fillEllipse(in: CGRect(
        x: s / 2 - offsetX - cornerRadius2 / 2,
        y: s / 2 - offsetY - cornerRadius2 / 2,
        width: cornerRadius2,
        height: cornerRadius2
    ))

    // 输出 PNG
    guard let image = ctx.makeImage() else { return false }
    let rep = NSBitmapImageRep(cgImage: image)
    rep.size = NSSize(width: s, height: s)
    guard let data = rep.representation(using: .png, properties: [:]) else { return false }
    do {
        try data.write(to: URL(fileURLWithPath: path))
        return true
    } catch {
        return false
    }
}

let args = CommandLine.arguments
guard args.count >= 3 else {
    FileHandle.standardError.write(Data("usage: make-icon <output_dir> <app_name>\n".utf8))
    exit(2)
}
let outDir = args[1]
try? FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)

let iconset = outDir + "/icon.iconset"
try? FileManager.default.createDirectory(atPath: iconset, withIntermediateDirectories: true)
try? FileManager.default.removeItem(atPath: iconset)
try? FileManager.default.createDirectory(atPath: iconset, withIntermediateDirectories: true)

let sizes: [(Int, String)] = [
    (16, "icon_16x16.png"),
    (32, "icon_16x16@2x.png"),
    (32, "icon_32x32.png"),
    (64, "icon_32x32@2x.png"),
    (128, "icon_128x128.png"),
    (256, "icon_128x128@2x.png"),
    (256, "icon_256x256.png"),
    (512, "icon_256x256@2x.png"),
    (512, "icon_512x512.png"),
    (1024, "icon_512x512@2x.png")
]

for (size, name) in sizes {
    let ok = drawIcon(size: size, path: iconset + "/" + name)
    if !ok { FileHandle.standardError.write(Data("绘制 \(name) 失败\n".utf8)); exit(1) }
}

let icnsPath = outDir + "/icon.icns"
// iconutil 语法：iconutil -c icns -o <output.icns> <input.iconset>
let task = Process()
task.launchPath = "/usr/bin/iconutil"
task.arguments = ["-c", "icns", "-o", icnsPath, iconset]
try? task.run()
task.waitUntilExit()

// 清理 iconset
try? FileManager.default.removeItem(atPath: iconset)
print("已生成 \(icnsPath)")
