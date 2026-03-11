import XCTest

@testable import Markdown

final class EditorDocumentControllerExportSnapshotTests: XCTestCase {
    func testNormalizedRenderedHTMLPreservesNonEmptyHTML() {
        XCTAssertEqual(
            normalizedRenderedHTMLForExport("<h1>Title</h1>", markdown: "# Title"),
            "<h1>Title</h1>"
        )
    }

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
