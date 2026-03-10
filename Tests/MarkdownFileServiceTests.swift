import XCTest
@testable import Markdown

final class MarkdownFileServiceTests: XCTestCase {
    func testMarkdownRoundTripsThroughDisk() throws {
        let fileManager = FileManager.default
        let tempDirectory = fileManager.temporaryDirectory.appendingPathComponent(
            UUID().uuidString,
            isDirectory: true
        )

        try fileManager.createDirectory(at: tempDirectory, withIntermediateDirectories: true)
        defer { try? fileManager.removeItem(at: tempDirectory) }

        let markdown = """
        # Title

        Euler identity: $e^{i\\pi} + 1 = 0$
        """

        let fileURL = tempDirectory.appendingPathComponent("note.md")

        try MarkdownFileService.write(markdown, to: fileURL)

        let loadedMarkdown = try MarkdownFileService.readMarkdown(from: fileURL)

        XCTAssertEqual(loadedMarkdown, markdown, "Round-trip markdown content mismatch")
    }

    func testRenamedMarkdownURLAppendsMarkdownExtensionWhenNameContainsDots() {
        let originalURL = URL(fileURLWithPath: "/tmp/note.md")

        let renamedURL = MarkdownFileService.renamedMarkdownURL(from: originalURL, to: "v1.0.0")

        XCTAssertEqual(
            renamedURL.lastPathComponent,
            "v1.0.0.md",
            "Expected markdown renames without a supported Markdown extension to keep the .md suffix."
        )
    }

    func testRenamedMarkdownURLKeepsSupportedMarkdownExtension() {
        let originalURL = URL(fileURLWithPath: "/tmp/note.md")

        let renamedURL = MarkdownFileService.renamedMarkdownURL(from: originalURL, to: "archive.markdown")

        XCTAssertEqual(
            renamedURL.lastPathComponent,
            "archive.markdown",
            "Expected supported Markdown extensions to be preserved during rename."
        )
    }

    func testRelativePathHandlesRootDirectory() {
        let rootDirectoryURL = URL(fileURLWithPath: "/", isDirectory: true)
        let fileURL = URL(fileURLWithPath: "/tmp/example.png")

        let relativePath = MarkdownFileService.relativePath(of: fileURL, relativeToDirectory: rootDirectoryURL)

        XCTAssertEqual(
            relativePath,
            "tmp/example.png",
            "Expected relative paths from the file-system root to avoid a double-slash prefix."
        )
    }
}
