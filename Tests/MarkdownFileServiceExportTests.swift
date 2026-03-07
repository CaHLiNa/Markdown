import Foundation
import UniformTypeIdentifiers

@main
struct MarkdownFileServiceExportTests {
    static func main() throws {
        testHTMLExportKeepsExtension()
        testPDFExportAppendsExtension()
        testRenderedHTMLDocumentWrapsBodyContent()
        testRenderedHTMLDocumentAppliesDarkThemePalette()
    }

    private static func testHTMLExportKeepsExtension() {
        let destination = MarkdownFileService.normalizedExportURL(
            from: URL(fileURLWithPath: "/tmp/notes"),
            contentType: MarkdownFileService.htmlContentType
        )

        guard destination.pathExtension == "html" else {
            fatalError("Expected HTML export to append .html, got \(destination.pathExtension)")
        }
    }

    private static func testPDFExportAppendsExtension() {
        let destination = MarkdownFileService.normalizedExportURL(
            from: URL(fileURLWithPath: "/tmp/preview"),
            contentType: .pdf
        )

        guard destination.lastPathComponent == "preview.pdf" else {
            fatalError("Expected PDF export to append .pdf, got \(destination.lastPathComponent)")
        }
    }

    private static func testRenderedHTMLDocumentWrapsBodyContent() {
        let document = MarkdownFileService.renderedHTMLDocument(
            title: "测试文档",
            bodyHTML: "<h1>标题</h1><p>正文</p>"
        )

        guard document.contains("<title>测试文档</title>") else {
            fatalError("Expected HTML document to include the title element.")
        }

        guard document.contains("<main class=\"markdown-body\"><h1>标题</h1><p>正文</p></main>") else {
            fatalError("Expected HTML document to wrap rendered body HTML.")
        }
    }

    private static func testRenderedHTMLDocumentAppliesDarkThemePalette() {
        let document = MarkdownFileService.renderedHTMLDocument(
            title: "夜间文档",
            bodyHTML: "<p>正文</p>",
            theme: .dark
        )

        guard document.contains("color-scheme: dark;") else {
            fatalError("Expected dark export theme to set dark color-scheme.")
        }

        guard document.contains("background: #111318;") else {
            fatalError("Expected dark export theme to use the dark background palette.")
        }
    }
}
