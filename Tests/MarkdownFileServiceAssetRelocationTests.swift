import XCTest
@testable import Markdown

final class MarkdownFileServiceAssetRelocationTests: XCTestCase {
    private let preferences = EditorPreferences.defaultValue

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
            to: destinationFileURL,
            preferences: preferences
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
            to: destinationFileURL,
            preferences: preferences
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

    func testIgnoresImageSyntaxInsideFencedCodeBlocksDuringSaveAs() throws {
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
        ```markdown
        ![示意图](note.assets/diagram.png)
        ```
        """

        let relocatedMarkdown = try MarkdownFileService.relocateSiblingImageAssetsForSaveAs(
            markdown,
            from: originalFileURL,
            to: destinationFileURL,
            preferences: preferences
        )

        let relocatedAssetURL = tempDirectory
            .appendingPathComponent("renamed.assets", isDirectory: true)
            .appendingPathComponent("diagram.png")

        XCTAssertEqual(relocatedMarkdown, markdown, "Expected fenced code block contents to remain untouched during Save As.")
        XCTAssertFalse(
            fileManager.fileExists(atPath: relocatedAssetURL.path),
            "Did not expect Save As to copy assets referenced only inside fenced code blocks."
        )
    }

    func testRelocatesSiblingImageAssetsWithParenthesesInFilename() throws {
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
        let originalAssetURL = originalAssetDirectory.appendingPathComponent("diagram(1).png")

        try fileManager.createDirectory(at: originalAssetDirectory, withIntermediateDirectories: true)
        try Data([0x89, 0x50, 0x4E, 0x47]).write(to: originalAssetURL)

        let markdown = """
        ![示意图](note.assets/diagram(1).png)
        """

        let relocatedMarkdown = try MarkdownFileService.relocateSiblingImageAssetsForSaveAs(
            markdown,
            from: originalFileURL,
            to: destinationFileURL,
            preferences: preferences
        )

        let relocatedAssetURL = tempDirectory
            .appendingPathComponent("renamed.assets", isDirectory: true)
            .appendingPathComponent("diagram(1).png")

        XCTAssertEqual(
            relocatedMarkdown,
            "![示意图](renamed.assets/diagram(1).png)",
            "Expected Save As to rewrite image references whose filenames contain parentheses."
        )
        XCTAssertTrue(
            fileManager.fileExists(atPath: relocatedAssetURL.path),
            "Expected Save As to copy sibling assets whose filenames contain parentheses."
        )
    }

    func testRelocatesDotSlashAndEncodedSiblingAssetsUsingCurrentFormattingPreferences() throws {
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
        let originalAssetURL = originalAssetDirectory.appendingPathComponent("diagram #1.png")
        var preferences = EditorPreferences.defaultValue
        preferences.imagePreferDotSlash = true
        preferences.imageAutoEncodeURL = true

        try fileManager.createDirectory(at: originalAssetDirectory, withIntermediateDirectories: true)
        try Data([0x89, 0x50, 0x4E, 0x47]).write(to: originalAssetURL)

        let markdown = """
        ![示意图](./note.assets/diagram%20%231.png)
        """

        let relocatedMarkdown = try MarkdownFileService.relocateSiblingImageAssetsForSaveAs(
            markdown,
            from: originalFileURL,
            to: destinationFileURL,
            preferences: preferences
        )

        let relocatedAssetURL = tempDirectory
            .appendingPathComponent("renamed.assets", isDirectory: true)
            .appendingPathComponent("diagram #1.png")

        XCTAssertEqual(
            relocatedMarkdown,
            "![示意图](./renamed.assets/diagram%20%231.png)",
            "Expected Save As to normalize sibling asset references using the current formatting preferences."
        )
        XCTAssertTrue(
            fileManager.fileExists(atPath: relocatedAssetURL.path),
            "Expected Save As to copy dot-slash encoded sibling assets into the new asset directory."
        )
    }
}
