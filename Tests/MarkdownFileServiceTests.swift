import XCTest
import UniformTypeIdentifiers
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

        XCTAssertEqual(loadedMarkdown.markdown, markdown, "Round-trip markdown content mismatch")
        XCTAssertEqual(loadedMarkdown.encoding, .utf8, "Expected UTF-8 writes to round-trip with UTF-8 metadata.")
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

    func testMarkdownSelectionContentTypesCoverSupportedExtensions() {
        let supportedIdentifiers = Set(MarkdownFileService.markdownSelectionContentTypes.map(\.identifier))

        for pathExtension in MarkdownFileService.supportedPathExtensions {
            let contentType = UTType(filenameExtension: pathExtension)
            XCTAssertNotNil(contentType, "Expected \(pathExtension) to resolve to a content type.")
            XCTAssertTrue(
                supportedIdentifiers.contains(contentType?.identifier ?? ""),
                "Expected markdown selection content types to include \(pathExtension)."
            )
        }
    }

    func testReadMarkdownDetectsUTF16Encoding() throws {
        let fileManager = FileManager.default
        let tempDirectory = fileManager.temporaryDirectory.appendingPathComponent(
            UUID().uuidString,
            isDirectory: true
        )

        try fileManager.createDirectory(at: tempDirectory, withIntermediateDirectories: true)
        defer { try? fileManager.removeItem(at: tempDirectory) }

        let markdown = "# 标题\n\n你好"
        let fileURL = tempDirectory.appendingPathComponent("utf16.md")
        try markdown.write(to: fileURL, atomically: true, encoding: .utf16)

        let loaded = try MarkdownFileService.readMarkdown(from: fileURL)

        XCTAssertEqual(loaded.markdown, markdown)
        XCTAssertEqual(loaded.encoding, .utf16)
    }

    func testReadMarkdownDetectsWindowsCP1252Encoding() throws {
        let fileManager = FileManager.default
        let tempDirectory = fileManager.temporaryDirectory.appendingPathComponent(
            UUID().uuidString,
            isDirectory: true
        )

        try fileManager.createDirectory(at: tempDirectory, withIntermediateDirectories: true)
        defer { try? fileManager.removeItem(at: tempDirectory) }

        let markdown = "café déjà vu"
        let fileURL = tempDirectory.appendingPathComponent("legacy.md")

        guard let data = markdown.data(using: .windowsCP1252) else {
            XCTFail("Failed to create Windows CP1252 sample data.")
            return
        }

        try data.write(to: fileURL, options: .atomic)

        let loaded = try MarkdownFileService.readMarkdown(from: fileURL)

        XCTAssertEqual(loaded.markdown, markdown)
        XCTAssertEqual(loaded.encoding, .windowsCP1252)
    }
}
