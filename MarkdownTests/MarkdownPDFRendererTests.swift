import PDFKit
import XCTest

@testable import Markdown

@MainActor
final class MarkdownPDFRendererTests: XCTestCase {
    func testRenderPDFUsesConfiguredPageSize() async throws {
        let htmlURL = try MarkdownExportService.createTemporaryHTMLPackage(
            bodyHTML: "<main><h1>Hello</h1><p>World</p></main>",
            documentTitle: "PDF",
            theme: .light,
            documentBaseURL: nil,
            printOptions: PDFExportOptions(
                paperSize: .letter,
                margin: 24,
                printBackground: true
            )
        )
        defer { try? FileManager.default.removeItem(at: htmlURL.deletingLastPathComponent()) }

        let pdfData = try await renderPDF(from: htmlURL)

        let document = try XCTUnwrap(PDFDocument(data: pdfData))
        let firstPage = try XCTUnwrap(document.page(at: 0))
        let bounds = firstPage.bounds(for: .mediaBox)

        XCTAssertEqual(bounds.width, EditorPDFPaperSize.letter.pageSizePoints.width, accuracy: 2.0)
        XCTAssertEqual(bounds.height, EditorPDFPaperSize.letter.pageSizePoints.height, accuracy: 2.0)
    }

    func testRenderPDFIncludesMultiplePagesForLongContent() async throws {
        let longBodyHTML = """
        <main>
        <h1>Long Document</h1>
        \(Array(repeating: "<p>This is a long export paragraph used to verify that PDF export captures more than the first printed page. Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>", count: 120).joined(separator: "\n"))
        </main>
        """
        let htmlURL = try MarkdownExportService.createTemporaryHTMLPackage(
            bodyHTML: longBodyHTML,
            documentTitle: "Long PDF",
            theme: .light,
            documentBaseURL: nil,
            printOptions: PDFExportOptions(
                paperSize: .letter,
                margin: 24,
                printBackground: true
            )
        )
        defer { try? FileManager.default.removeItem(at: htmlURL.deletingLastPathComponent()) }

        let pdfData = try await renderPDF(from: htmlURL)
        let document = try XCTUnwrap(PDFDocument(data: pdfData))
        let firstPage = try XCTUnwrap(document.page(at: 0))
        let bounds = firstPage.bounds(for: .mediaBox)

        XCTAssertGreaterThan(document.pageCount, 1)
        XCTAssertEqual(bounds.width, EditorPDFPaperSize.letter.pageSizePoints.width, accuracy: 2.0)
        XCTAssertEqual(bounds.height, EditorPDFPaperSize.letter.pageSizePoints.height, accuracy: 2.0)
    }

    private func renderPDF(from htmlURL: URL) async throws -> Data {
        let renderer = MarkdownPDFRenderer()
        return try await withCheckedThrowingContinuation { continuation in
            renderer.renderPDF(
                from: htmlURL,
                options: PDFExportOptions(
                    paperSize: .letter,
                    margin: 24,
                    printBackground: true
                )
            ) { result in
                continuation.resume(with: result)
            }
        }
    }
}
