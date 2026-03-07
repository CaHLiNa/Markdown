import Foundation

@main
struct MarkdownFileServiceAssetCleanupTests {
    static func main() throws {
        try testRemovesUnreferencedSiblingAssets()
        try testPreservesReferencedSiblingAssets()
    }

    private static func testRemovesUnreferencedSiblingAssets() throws {
        let fileManager = FileManager.default
        let tempDirectory = fileManager.temporaryDirectory.appendingPathComponent(
            UUID().uuidString,
            isDirectory: true
        )

        try fileManager.createDirectory(at: tempDirectory, withIntermediateDirectories: true)
        defer { try? fileManager.removeItem(at: tempDirectory) }

        let markdownFileURL = tempDirectory.appendingPathComponent("note.md")
        let assetDirectoryURL = tempDirectory.appendingPathComponent("note.assets", isDirectory: true)
        let keptAssetURL = assetDirectoryURL.appendingPathComponent("keep.png")
        let removedAssetURL = assetDirectoryURL.appendingPathComponent("remove.png")

        try fileManager.createDirectory(at: assetDirectoryURL, withIntermediateDirectories: true)
        try Data([0x89, 0x50, 0x4E, 0x47]).write(to: keptAssetURL)
        try Data([0x89, 0x50, 0x4E, 0x47]).write(to: removedAssetURL)

        let markdown = """
        # 标题

        ![保留](note.assets/keep.png)
        """

        try MarkdownFileService.removeUnusedSiblingImageAssets(
            for: markdown,
            alongsideMarkdownFile: markdownFileURL
        )

        guard fileManager.fileExists(atPath: keptAssetURL.path) else {
            fatalError("Expected referenced sibling image asset to be preserved.")
        }

        guard !fileManager.fileExists(atPath: removedAssetURL.path) else {
            fatalError("Expected unreferenced sibling image asset to be removed during save cleanup.")
        }
    }

    private static func testPreservesReferencedSiblingAssets() throws {
        let fileManager = FileManager.default
        let tempDirectory = fileManager.temporaryDirectory.appendingPathComponent(
            UUID().uuidString,
            isDirectory: true
        )

        try fileManager.createDirectory(at: tempDirectory, withIntermediateDirectories: true)
        defer { try? fileManager.removeItem(at: tempDirectory) }

        let markdownFileURL = tempDirectory.appendingPathComponent("note.md")
        let assetDirectoryURL = tempDirectory.appendingPathComponent("note.assets", isDirectory: true)
        let nestedDirectoryURL = assetDirectoryURL.appendingPathComponent("nested", isDirectory: true)
        let nestedAssetURL = nestedDirectoryURL.appendingPathComponent("diagram.png")

        try fileManager.createDirectory(at: nestedDirectoryURL, withIntermediateDirectories: true)
        try Data([0x89, 0x50, 0x4E, 0x47]).write(to: nestedAssetURL)

        let markdown = """
        # 标题

        ![保留](note.assets/nested/diagram.png)
        """

        try MarkdownFileService.removeUnusedSiblingImageAssets(
            for: markdown,
            alongsideMarkdownFile: markdownFileURL
        )

        guard fileManager.fileExists(atPath: nestedAssetURL.path) else {
            fatalError("Expected referenced nested asset to be preserved.")
        }
    }
}
