import Foundation

@main
struct MarkdownFileServiceImageTests {
    static func main() throws {
        try testPersistImageAssetCreatesSiblingAssetsDirectory()
        try testPersistImageAssetAppendsNumericSuffixWhenFileExists()
        try testPersistImageAssetUsesMIMETypeWhenFilenameHasNoExtension()
    }

    private static func testPersistImageAssetCreatesSiblingAssetsDirectory() throws {
        let fileManager = FileManager.default
        let tempDirectory = fileManager.temporaryDirectory.appendingPathComponent(
            UUID().uuidString,
            isDirectory: true
        )

        try fileManager.createDirectory(at: tempDirectory, withIntermediateDirectories: true)
        defer { try? fileManager.removeItem(at: tempDirectory) }

        let markdownFileURL = tempDirectory.appendingPathComponent("note.md")
        try "# 标题".write(to: markdownFileURL, atomically: true, encoding: .utf8)

        let relativePath = try MarkdownFileService.persistImageAsset(
            Data([0x89, 0x50, 0x4E, 0x47]),
            originalFilename: "diagram.png",
            mimeType: "image/png",
            alongsideMarkdownFile: markdownFileURL
        )

        let expectedURL = tempDirectory
            .appendingPathComponent("note.assets", isDirectory: true)
            .appendingPathComponent("diagram.png")

        guard relativePath == "note.assets/diagram.png" else {
            fatalError("Expected relative asset path to use sibling .assets directory, got \(relativePath)")
        }

        guard fileManager.fileExists(atPath: expectedURL.path) else {
            fatalError("Expected persisted image asset to exist at \(expectedURL.path)")
        }
    }

    private static func testPersistImageAssetAppendsNumericSuffixWhenFileExists() throws {
        let fileManager = FileManager.default
        let tempDirectory = fileManager.temporaryDirectory.appendingPathComponent(
            UUID().uuidString,
            isDirectory: true
        )

        try fileManager.createDirectory(at: tempDirectory, withIntermediateDirectories: true)
        defer { try? fileManager.removeItem(at: tempDirectory) }

        let markdownFileURL = tempDirectory.appendingPathComponent("note.md")
        try "# 标题".write(to: markdownFileURL, atomically: true, encoding: .utf8)

        _ = try MarkdownFileService.persistImageAsset(
            Data([0x89, 0x50, 0x4E, 0x47]),
            originalFilename: "diagram.png",
            mimeType: "image/png",
            alongsideMarkdownFile: markdownFileURL
        )

        let secondRelativePath = try MarkdownFileService.persistImageAsset(
            Data([0x89, 0x50, 0x4E, 0x47]),
            originalFilename: "diagram.png",
            mimeType: "image/png",
            alongsideMarkdownFile: markdownFileURL
        )

        guard secondRelativePath == "note.assets/diagram-2.png" else {
            fatalError("Expected duplicate image asset to append numeric suffix, got \(secondRelativePath)")
        }
    }

    private static func testPersistImageAssetUsesMIMETypeWhenFilenameHasNoExtension() throws {
        let fileManager = FileManager.default
        let tempDirectory = fileManager.temporaryDirectory.appendingPathComponent(
            UUID().uuidString,
            isDirectory: true
        )

        try fileManager.createDirectory(at: tempDirectory, withIntermediateDirectories: true)
        defer { try? fileManager.removeItem(at: tempDirectory) }

        let markdownFileURL = tempDirectory.appendingPathComponent("note.md")
        try "# 标题".write(to: markdownFileURL, atomically: true, encoding: .utf8)

        let relativePath = try MarkdownFileService.persistImageAsset(
            Data([0xFF, 0xD8, 0xFF]),
            originalFilename: "clipboard-image",
            mimeType: "image/jpeg",
            alongsideMarkdownFile: markdownFileURL
        )

        guard relativePath == "note.assets/clipboard-image.jpg" else {
            fatalError("Expected MIME type to supply jpg extension, got \(relativePath)")
        }
    }
}
