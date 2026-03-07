import XCTest
@testable import Markdown

final class MarkdownFileServiceAssetRelocationTests: XCTestCase {
    func testRelocatesSiblingImageAssetsDuringSaveAs() throws {
        let fileManager = FileManager.default
        let tempDirectory = fileManager.temporaryDirectory.appendingPathComponent(
            UUID().uuidString,
            isDirectory: true
        )

        try fileManager.createDirectory(at: tempDirectory, withIntermediateDirectories: true)
        defer { try? fileManager.removeItem(at: tempDirectory) }

        let originalFileURL = tempDirectory.appendingPathComponent("note.md")
        let destinationFileURL = tempDirectory.appendingPathComponent("renamed.md")
        let originalAssetDirectory = tempDirectory.appendingPathComponent("note.assets", isDirectory: true)
        let originalAssetURL = originalAssetDirectory.appendingPathComponent("diagram.png")

        try fileManager.createDirectory(at: originalAssetDirectory, withIntermediateDirectories: true)
        try Data([0x89, 0x50, 0x4E, 0x47]).write(to: originalAssetURL)

        let markdown = """
        # 标题

        ![示意图](note.assets/diagram.png)
        """

        let relocatedMarkdown = try MarkdownFileService.relocateSiblingImageAssetsForSaveAs(
            markdown,
            from: originalFileURL,
            to: destinationFileURL
        )

        let relocatedAssetURL = tempDirectory
            .appendingPathComponent("renamed.assets", isDirectory: true)
            .appendingPathComponent("diagram.png")

        XCTAssertTrue(
            relocatedMarkdown.contains("![示意图](renamed.assets/diagram.png)"),
            "Expected markdown asset reference to be rewritten for Save As."
        )
        XCTAssertTrue(
            fileManager.fileExists(atPath: relocatedAssetURL.path),
            "Expected Save As to copy sibling image assets into the new .assets directory."
        )
    }

    func testLeavesNonSiblingAssetReferencesUntouched() throws {
        let fileManager = FileManager.default
        let tempDirectory = fileManager.temporaryDirectory.appendingPathComponent(
            UUID().uuidString,
            isDirectory: true
        )

        try fileManager.createDirectory(at: tempDirectory, withIntermediateDirectories: true)
        defer { try? fileManager.removeItem(at: tempDirectory) }

        let originalFileURL = tempDirectory.appendingPathComponent("note.md")
        let destinationFileURL = tempDirectory.appendingPathComponent("renamed.md")
        let externalAssetDirectory = tempDirectory.appendingPathComponent("images", isDirectory: true)
        let externalAssetURL = externalAssetDirectory.appendingPathComponent("diagram.png")

        try fileManager.createDirectory(at: externalAssetDirectory, withIntermediateDirectories: true)
        try Data([0x89, 0x50, 0x4E, 0x47]).write(to: externalAssetURL)

        let markdown = """
        # 标题

        ![示意图](images/diagram.png)
        """

        let relocatedMarkdown = try MarkdownFileService.relocateSiblingImageAssetsForSaveAs(
            markdown,
            from: originalFileURL,
            to: destinationFileURL
        )

        let unexpectedAssetURL = tempDirectory
            .appendingPathComponent("renamed.assets", isDirectory: true)
            .appendingPathComponent("diagram.png")

        XCTAssertTrue(
            relocatedMarkdown.contains("![示意图](images/diagram.png)"),
            "Expected non-sibling asset references to remain unchanged."
        )
        XCTAssertFalse(
            fileManager.fileExists(atPath: unexpectedAssetURL.path),
            "Did not expect Save As to copy images outside the sibling .assets directory."
        )
    }
}
