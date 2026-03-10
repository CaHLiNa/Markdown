import XCTest
import UniformTypeIdentifiers
@testable import Markdown

final class MarkdownFileServiceExportTests: XCTestCase {
    func testHTMLExportKeepsExtension() {
        let destination = MarkdownFileService.normalizedExportURL(
            from: URL(fileURLWithPath: "/tmp/notes"),
            contentType: MarkdownFileService.htmlContentType
        )

        XCTAssertEqual(destination.pathExtension, "html", "Expected HTML export to append .html, got \(destination.pathExtension)")
    }

    func testPDFExportAppendsExtension() {
        let destination = MarkdownFileService.normalizedExportURL(
            from: URL(fileURLWithPath: "/tmp/preview"),
            contentType: .pdf
        )

        XCTAssertEqual(destination.lastPathComponent, "preview.pdf", "Expected PDF export to append .pdf, got \(destination.lastPathComponent)")
    }

    func testRenderedHTMLDocumentWrapsBodyContent() {
        let document = MarkdownFileService.renderedHTMLDocument(
            title: "测试文档",
            bodyHTML: "<h1>标题</h1><p>正文</p>"
        )

        XCTAssertTrue(document.contains("<title>测试文档</title>"), "Expected HTML document to include the title element.")
        XCTAssertTrue(
            document.contains("<main class=\"markdown-body\"><h1>标题</h1><p>正文</p></main>"),
            "Expected HTML document to wrap rendered body HTML."
        )
    }

    func testRenderedHTMLDocumentAppliesDarkThemePalette() {
        let document = MarkdownFileService.renderedHTMLDocument(
            title: "夜间文档",
            bodyHTML: "<p>正文</p>",
            theme: .dark
        )

        XCTAssertTrue(document.contains("color-scheme: dark;"), "Expected dark export theme to set dark color-scheme.")
        XCTAssertTrue(document.contains("background: #111318;"), "Expected dark export theme to use the dark background palette.")
    }

    func testRenderedHTMLDocumentIncludesBaseURLWhenProvided() {
        let document = MarkdownFileService.renderedHTMLDocument(
            title: "带资源基准",
            bodyHTML: "<img src=\"assets/test.png\">",
            theme: .light,
            baseURL: URL(fileURLWithPath: "/tmp/notes.md")
        )

        XCTAssertTrue(
            document.contains("<base href=\"file:///tmp/notes.md\">"),
            "Expected exported HTML to include a base URL so relative assets resolve consistently after export."
        )
    }
}
