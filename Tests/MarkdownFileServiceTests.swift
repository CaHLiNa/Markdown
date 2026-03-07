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
}
