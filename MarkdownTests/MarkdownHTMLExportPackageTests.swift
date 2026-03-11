import Foundation
import XCTest

@testable import Markdown

final class MarkdownHTMLExportPackageTests: XCTestCase {
    func testWriteHTMLPackageCopiesLocalAssetsAndLeavesRemoteURLs() throws {
        let rootURL = try makeTemporaryDirectory(named: "HTMLExport")
        defer { try? FileManager.default.removeItem(at: rootURL) }

        let documentDirectoryURL = rootURL.appendingPathComponent("docs", isDirectory: true)
        let exportDirectoryURL = rootURL.appendingPathComponent("exports", isDirectory: true)
        try FileManager.default.createDirectory(at: documentDirectoryURL, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: exportDirectoryURL, withIntermediateDirectories: true)

        let imageURL = documentDirectoryURL.appendingPathComponent("assets/photo.png")
        let posterURL = documentDirectoryURL.appendingPathComponent("media/poster.png")
        let videoURL = documentDirectoryURL.appendingPathComponent("media/clip.mp4")
        try FileManager.default.createDirectory(at: imageURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: posterURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data("image".utf8).write(to: imageURL)
        try Data("poster".utf8).write(to: posterURL)
        try Data("video".utf8).write(to: videoURL)

        let markdownURL = documentDirectoryURL.appendingPathComponent("note.md")
        try "# Note".write(to: markdownURL, atomically: true, encoding: .utf8)

        let destinationURL = exportDirectoryURL.appendingPathComponent("report.html")
        let bodyHTML = """
        <p><img src="assets/photo.png" alt="photo"></p>
        <video controls poster="./media/poster.png">
          <source src="./media/clip.mp4" type="video/mp4">
        </video>
        <img src="https://example.com/logo.png" alt="remote">
        """

        let writtenURL = try MarkdownExportService.writeHTMLPackage(
            bodyHTML: bodyHTML,
            destinationHTMLURL: destinationURL,
            documentTitle: "Report",
            theme: .light,
            documentBaseURL: markdownURL
        )

        XCTAssertEqual(writtenURL, destinationURL)

        let exportedHTML = try String(contentsOf: destinationURL, encoding: .utf8)
        XCTAssertTrue(exportedHTML.contains("report.assets/assets/photo.png"))
        XCTAssertTrue(exportedHTML.contains("report.assets/media/poster.png"))
        XCTAssertTrue(exportedHTML.contains("report.assets/media/clip.mp4"))
        XCTAssertTrue(exportedHTML.contains("https://example.com/logo.png"))

        XCTAssertTrue(
            FileManager.default.fileExists(
                atPath: exportDirectoryURL
                    .appendingPathComponent("report.assets/assets/photo.png")
                    .path
            )
        )
        XCTAssertTrue(
            FileManager.default.fileExists(
                atPath: exportDirectoryURL
                    .appendingPathComponent("report.assets/media/poster.png")
                    .path
            )
        )
        XCTAssertTrue(
            FileManager.default.fileExists(
                atPath: exportDirectoryURL
                    .appendingPathComponent("report.assets/media/clip.mp4")
                    .path
            )
        )
    }

    func testRenderedHTMLDocumentIncludesPrintCSS() {
        let document = MarkdownFileService.renderedHTMLDocument(
            title: "Print",
            bodyHTML: "<p>Hello</p>",
            theme: .light,
            printOptions: PDFExportOptions(
                paperSize: .letter,
                margin: 36,
                printBackground: true
            )
        )

        XCTAssertTrue(document.contains("@page"))
        XCTAssertTrue(document.contains("size: Letter;"))
        XCTAssertTrue(document.contains("margin: 36pt;"))
        XCTAssertTrue(document.contains("print-color-adjust: exact;"))
    }
}
