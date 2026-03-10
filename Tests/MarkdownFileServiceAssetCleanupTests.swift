import XCTest
@testable import Markdown

final class MarkdownFileServiceAssetCleanupTests: XCTestCase {
    private let preferences = EditorPreferences.defaultValue

    func testRemovesUnreferencedSiblingAssets() throws {
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
            alongsideMarkdownFile: markdownFileURL,
            preferences: preferences
        )

        XCTAssertTrue(fileManager.fileExists(atPath: keptAssetURL.path), "Expected referenced sibling image asset to be preserved.")
        XCTAssertFalse(fileManager.fileExists(atPath: removedAssetURL.path), "Expected unreferenced sibling image asset to be removed during save cleanup.")
    }

    func testPreservesReferencedSiblingAssets() throws {
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
            alongsideMarkdownFile: markdownFileURL,
            preferences: preferences
        )

        XCTAssertTrue(fileManager.fileExists(atPath: nestedAssetURL.path), "Expected referenced nested asset to be preserved.")
    }

    func testIgnoresImageSyntaxInsideFencedCodeBlocksDuringCleanup() throws {
        let fileManager = FileManager.default
        let tempDirectory = fileManager.temporaryDirectory.appendingPathComponent(
            UUID().uuidString,
            isDirectory: true
        )

        try fileManager.createDirectory(at: tempDirectory, withIntermediateDirectories: true)
        defer { try? fileManager.removeItem(at: tempDirectory) }

        let markdownFileURL = tempDirectory.appendingPathComponent("note.md")
        let assetDirectoryURL = tempDirectory.appendingPathComponent("note.assets", isDirectory: true)
        let fencedOnlyAssetURL = assetDirectoryURL.appendingPathComponent("fenced.png")

        try fileManager.createDirectory(at: assetDirectoryURL, withIntermediateDirectories: true)
        try Data([0x89, 0x50, 0x4E, 0x47]).write(to: fencedOnlyAssetURL)

        let markdown = """
        ```markdown
        ![示例](note.assets/fenced.png)
        ```
        """

        try MarkdownFileService.removeUnusedSiblingImageAssets(
            for: markdown,
            alongsideMarkdownFile: markdownFileURL,
            preferences: preferences
        )

        XCTAssertFalse(
            fileManager.fileExists(atPath: fencedOnlyAssetURL.path),
            "Expected fenced code block image syntax not to keep sibling assets alive during cleanup."
        )
    }

    func testPreservesReferencedSiblingAssetsWithParenthesesInFilename() throws {
        let fileManager = FileManager.default
        let tempDirectory = fileManager.temporaryDirectory.appendingPathComponent(
            UUID().uuidString,
            isDirectory: true
        )

        try fileManager.createDirectory(at: tempDirectory, withIntermediateDirectories: true)
        defer { try? fileManager.removeItem(at: tempDirectory) }

        let markdownFileURL = tempDirectory.appendingPathComponent("note.md")
        let assetDirectoryURL = tempDirectory.appendingPathComponent("note.assets", isDirectory: true)
        let assetURL = assetDirectoryURL.appendingPathComponent("diagram(1).png")

        try fileManager.createDirectory(at: assetDirectoryURL, withIntermediateDirectories: true)
        try Data([0x89, 0x50, 0x4E, 0x47]).write(to: assetURL)

        let markdown = """
        ![保留](note.assets/diagram(1).png)
        """

        try MarkdownFileService.removeUnusedSiblingImageAssets(
            for: markdown,
            alongsideMarkdownFile: markdownFileURL,
            preferences: preferences
        )

        XCTAssertTrue(
            fileManager.fileExists(atPath: assetURL.path),
            "Expected sibling assets whose filenames contain parentheses to be preserved."
        )
    }

    func testPreservesEncodedDotSlashSiblingAssetsDuringCleanup() throws {
        let fileManager = FileManager.default
        let tempDirectory = fileManager.temporaryDirectory.appendingPathComponent(
            UUID().uuidString,
            isDirectory: true
        )

        try fileManager.createDirectory(at: tempDirectory, withIntermediateDirectories: true)
        defer { try? fileManager.removeItem(at: tempDirectory) }

        let markdownFileURL = tempDirectory.appendingPathComponent("note.md")
        let assetDirectoryURL = tempDirectory.appendingPathComponent("note.assets", isDirectory: true)
        let keptAssetURL = assetDirectoryURL.appendingPathComponent("diagram #1.png")
        let removedAssetURL = assetDirectoryURL.appendingPathComponent("remove.png")

        try fileManager.createDirectory(at: assetDirectoryURL, withIntermediateDirectories: true)
        try Data([0x89, 0x50, 0x4E, 0x47]).write(to: keptAssetURL)
        try Data([0x89, 0x50, 0x4E, 0x47]).write(to: removedAssetURL)

        let markdown = """
        ![保留](./note.assets/diagram%20%231.png)
        """

        try MarkdownFileService.removeUnusedSiblingImageAssets(
            for: markdown,
            alongsideMarkdownFile: markdownFileURL,
            preferences: preferences
        )

        XCTAssertTrue(
            fileManager.fileExists(atPath: keptAssetURL.path),
            "Expected cleanup to preserve encoded dot-slash sibling asset references."
        )
        XCTAssertFalse(
            fileManager.fileExists(atPath: removedAssetURL.path),
            "Expected cleanup to continue removing truly unreferenced sibling assets."
        )
    }
}
