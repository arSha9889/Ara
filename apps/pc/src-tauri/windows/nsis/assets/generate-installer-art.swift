import AppKit
import Foundation

private let canvas = NSColor(calibratedRed: 10 / 255, green: 17 / 255, blue: 28 / 255, alpha: 1)
private let card = NSColor(calibratedRed: 20 / 255, green: 31 / 255, blue: 48 / 255, alpha: 1)
private let accent = NSColor(calibratedRed: 74 / 255, green: 168 / 255, blue: 240 / 255, alpha: 1)
private let lightAccent = NSColor(calibratedRed: 140 / 255, green: 201 / 255, blue: 255 / 255, alpha: 1)
private let text = NSColor(calibratedRed: 243 / 255, green: 247 / 255, blue: 252 / 255, alpha: 1)

guard CommandLine.arguments.count == 2 else {
  fputs("Usage: generate-installer-art.swift <src-tauri-directory>\n", stderr)
  exit(64)
}

let root = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
let assetsDirectory = root.appending(path: "windows/nsis/assets", directoryHint: .isDirectory)
let iconURL = root.appending(path: "icons/icon.png")

guard let appIcon = NSImage(contentsOf: iconURL) else {
  fputs("Unable to load AraChat application icon at \(iconURL.path).\n", stderr)
  exit(66)
}

func bitmap(width: Int, height: Int, draw: (CGContext, CGRect) -> Void) throws -> CGImage {
  guard let context = CGContext(
    data: nil,
    width: width,
    height: height,
    bitsPerComponent: 8,
    bytesPerRow: width * 4,
    space: CGColorSpaceCreateDeviceRGB(),
    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
  ) else {
    throw NSError(domain: "AraChatInstallerArt", code: 1, userInfo: [NSLocalizedDescriptionKey: "Unable to create Core Graphics bitmap context"])
  }

  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(cgContext: context, flipped: false)
  draw(context, CGRect(x: 0, y: 0, width: width, height: height))
  NSGraphicsContext.restoreGraphicsState()
  guard let image = context.makeImage() else {
    throw NSError(domain: "AraChatInstallerArt", code: 2, userInfo: [NSLocalizedDescriptionKey: "Unable to create CGImage from bitmap context"])
  }
  return image
}

func write(_ image: CGImage, named name: String) throws {
  let bitmap = NSBitmapImageRep(cgImage: image)
  guard let data = bitmap.representation(using: .bmp, properties: [:]) else {
    throw NSError(domain: "AraChatInstallerArt", code: 3, userInfo: [NSLocalizedDescriptionKey: "Unable to encode BMP \(name)"])
  }
  do {
    try data.write(to: assetsDirectory.appending(path: name), options: .atomic)
  } catch {
    throw NSError(domain: "AraChatInstallerArt", code: 4, userInfo: [NSLocalizedDescriptionKey: "Unable to write BMP \(name): \(error.localizedDescription)"])
  }
}

func fill(_ context: CGContext, _ rect: CGRect, color: NSColor) {
  context.setFillColor(color.cgColor)
  context.fill(rect)
}

func roundedRect(_ context: CGContext, _ rect: CGRect, radius: CGFloat, color: NSColor) {
  context.addPath(CGPath(roundedRect: rect, cornerWidth: radius, cornerHeight: radius, transform: nil))
  context.setFillColor(color.cgColor)
  context.fillPath()
}

func radialGlow(_ context: CGContext, center: CGPoint, radius: CGFloat, color: NSColor) {
  let colors = [color.withAlphaComponent(0.36).cgColor, color.withAlphaComponent(0).cgColor] as CFArray
  let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 1])!
  context.drawRadialGradient(
    gradient,
    startCenter: center,
    startRadius: 0,
    endCenter: center,
    endRadius: radius,
    options: [.drawsBeforeStartLocation, .drawsAfterEndLocation]
  )
}

func line(_ context: CGContext, from: CGPoint, to: CGPoint, color: NSColor, width: CGFloat, alpha: CGFloat = 1) {
  context.saveGState()
  context.setStrokeColor(color.withAlphaComponent(alpha).cgColor)
  context.setLineWidth(width)
  context.setLineCap(.round)
  context.move(to: from)
  context.addLine(to: to)
  context.strokePath()
  context.restoreGState()
}

func dot(_ context: CGContext, at point: CGPoint, radius: CGFloat, color: NSColor, alpha: CGFloat = 1) {
  context.setFillColor(color.withAlphaComponent(alpha).cgColor)
  context.fillEllipse(in: CGRect(x: point.x - radius, y: point.y - radius, width: radius * 2, height: radius * 2))
}

func drawText(_ value: String, in rect: CGRect, font: NSFont, color: NSColor, alignment: NSTextAlignment = .center) {
  let style = NSMutableParagraphStyle()
  style.alignment = alignment
  let attributes: [NSAttributedString.Key: Any] = [
    .font: font,
    .foregroundColor: color,
    .paragraphStyle: style,
  ]
  NSAttributedString(string: value, attributes: attributes).draw(in: rect)
}

func drawAppIcon(_ context: CGContext, in rect: CGRect) {
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current?.cgContext.interpolationQuality = .high
  appIcon.draw(in: rect, from: .zero, operation: .sourceOver, fraction: 1, respectFlipped: true, hints: [.interpolation: NSImageInterpolation.high])
  NSGraphicsContext.restoreGraphicsState()
}

// Paper airplane path from Heroicons (MIT), preserved from heroicons-paper-airplane.svg.
func drawHeroPaperAirplane(_ context: CGContext, in rect: CGRect, color: NSColor, alpha: CGFloat = 1) {
  let path = CGMutablePath()
  path.move(to: CGPoint(x: 5.99972, y: 12))
  path.addLine(to: CGPoint(x: 3.2688, y: 3.12451))
  path.addCurve(
    to: CGPoint(x: 21.4855, y: 11.9997),
    control1: CGPoint(x: 9.88393, y: 5.04617),
    control2: CGPoint(x: 16.0276, y: 8.07601)
  )
  path.addCurve(
    to: CGPoint(x: 3.26889, y: 20.8752),
    control1: CGPoint(x: 16.0276, y: 15.9235),
    control2: CGPoint(x: 9.884, y: 18.9535)
  )
  path.addLine(to: CGPoint(x: 5.99972, y: 12))
  path.move(to: CGPoint(x: 5.99972, y: 12))
  path.addLine(to: CGPoint(x: 13.5, y: 12))

  context.saveGState()
  context.translateBy(x: rect.minX, y: rect.minY)
  context.scaleBy(x: rect.width / 24, y: rect.height / 24)
  context.translateBy(x: 0, y: 24)
  context.scaleBy(x: 1, y: -1)
  context.addPath(path)
  context.setStrokeColor(color.withAlphaComponent(alpha).cgColor)
  context.setLineWidth(1.5)
  context.setLineCap(.round)
  context.setLineJoin(.round)
  context.strokePath()
  context.restoreGState()
}

func drawSidebar(_ context: CGContext, rect: CGRect) {
  fill(context, rect, color: canvas)
  radialGlow(context, center: CGPoint(x: 44, y: 260), radius: 142, color: accent)
  radialGlow(context, center: CGPoint(x: 144, y: 74), radius: 120, color: NSColor(calibratedRed: 115 / 255, green: 82 / 255, blue: 232 / 255, alpha: 1))

  for point in [CGPoint(x: 18, y: 282), CGPoint(x: 142, y: 254), CGPoint(x: 135, y: 191), CGPoint(x: 31, y: 129), CGPoint(x: 151, y: 102), CGPoint(x: 19, y: 54)] {
    dot(context, at: point, radius: 1.2, color: lightAccent, alpha: 0.35)
  }

  let iconFrame = CGRect(x: 44, y: 214, width: 76, height: 76)
  roundedRect(context, iconFrame.insetBy(dx: -3, dy: -3), radius: 24, color: card.withAlphaComponent(0.78))
  drawAppIcon(context, in: iconFrame)
  drawText("AraChat", in: CGRect(x: 20, y: 184, width: 124, height: 24), font: .systemFont(ofSize: 18, weight: .semibold), color: text)
  drawText("CONNECTED, QUIETLY", in: CGRect(x: 23, y: 164, width: 118, height: 15), font: .monospacedSystemFont(ofSize: 7.5, weight: .medium), color: lightAccent.withAlphaComponent(0.88))

  let leftNode = CGPoint(x: 36, y: 93)
  let centerNode = CGPoint(x: 82, y: 116)
  let rightNode = CGPoint(x: 130, y: 81)
  line(context, from: leftNode, to: centerNode, color: accent, width: 1, alpha: 0.55)
  line(context, from: centerNode, to: rightNode, color: lightAccent, width: 1, alpha: 0.55)
  line(context, from: leftNode, to: rightNode, color: accent, width: 0.7, alpha: 0.2)
  for node in [leftNode, centerNode, rightNode] {
    dot(context, at: node, radius: 5, color: card)
    dot(context, at: node, radius: 2.7, color: lightAccent)
  }

  context.saveGState()
  context.setFillColor(card.withAlphaComponent(0.72).cgColor)
  context.addPath(CGPath(roundedRect: CGRect(x: 34, y: 28, width: 96, height: 42), cornerWidth: 15, cornerHeight: 15, transform: nil))
  context.fillPath()
  context.restoreGState()
  drawHeroPaperAirplane(context, in: CGRect(x: 58, y: 35, width: 50, height: 28), color: lightAccent, alpha: 0.95)
  line(context, from: CGPoint(x: 34, y: 23), to: CGPoint(x: 130, y: 23), color: lightAccent, width: 0.75, alpha: 0.28)
}

func drawHeader(_ context: CGContext, rect: CGRect, uninstaller: Bool) {
  fill(context, rect, color: canvas)
  radialGlow(context, center: CGPoint(x: 116, y: 50), radius: 74, color: uninstaller ? NSColor(calibratedRed: 115 / 255, green: 82 / 255, blue: 232 / 255, alpha: 1) : accent)

  let logoFrame = CGRect(x: 96, y: 9, width: 39, height: 39)
  roundedRect(context, logoFrame.insetBy(dx: -1.5, dy: -1.5), radius: 13, color: card.withAlphaComponent(0.9))
  drawAppIcon(context, in: logoFrame)

  drawText("AraChat", in: CGRect(x: 11, y: 25, width: 78, height: 18), font: .systemFont(ofSize: 13, weight: .semibold), color: text, alignment: .left)
  line(context, from: CGPoint(x: 12, y: 18), to: CGPoint(x: 79, y: 18), color: lightAccent, width: 1, alpha: 0.65)
  dot(context, at: CGPoint(x: 85, y: 18), radius: 2.2, color: accent)
}

do {
  let sidebar = try bitmap(width: 164, height: 314, draw: drawSidebar)
  let installerHeader = try bitmap(width: 150, height: 57) { context, rect in
    drawHeader(context, rect: rect, uninstaller: false)
  }
  let uninstallerHeader = try bitmap(width: 150, height: 57) { context, rect in
    drawHeader(context, rect: rect, uninstaller: true)
  }

  try write(sidebar, named: "installer-sidebar.bmp")
  try write(installerHeader, named: "installer-header.bmp")
  try write(uninstallerHeader, named: "uninstaller-header.bmp")
} catch {
  fputs("Unable to generate NSIS artwork: \(error.localizedDescription)\n", stderr)
  exit(74)
}
