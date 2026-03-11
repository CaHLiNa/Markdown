import XCTest

@testable import Markdown

final class EditorDocumentControllerExportSnapshotTests: XCTestCase {
    func testNormalizedRenderedHTMLFallsBackWhenRenderedHTMLIsEmpty() {
        XCTAssertEqual(
            normalizedRenderedHTMLForExport("", markdown: "# Title"),
            MarkdownFileService.fallbackRenderedHTMLBody(for: "# Title")
        )
    }

    func testNormalizedRenderedHTMLFallsBackWhenRenderedHTMLIsWhitespace() {
        XCTAssertEqual(
            normalizedRenderedHTMLForExport("   \n", markdown: "Body"),
            MarkdownFileService.fallbackRenderedHTMLBody(for: "Body")
        )
    }
}
