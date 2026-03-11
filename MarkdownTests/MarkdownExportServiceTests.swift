import XCTest

@testable import Markdown

final class MarkdownExportServiceTests: XCTestCase {
    func testResolveExportRequestUsesFormatSpecificActivePresetAndYAMLOverrides() throws {
        let htmlPreset = ExportPreset(
            id: UUID(),
            key: "html-reading",
            name: "HTML 阅读",
            format: .html,
            theme: .sepia,
            suggestedFileStem: "html-output"
        )
        let pdfPreset = ExportPreset(
            id: UUID(),
            key: "pdf-print",
            name: "PDF 打印",
            format: .pdf,
            theme: .dark,
            suggestedFileStem: "pdf-output",
            pdfOptions: PDFExportOptions(
                paperSize: .letter,
                margin: 24,
                printBackground: false
            )
        )
        let settings = ExportSettings(
            defaultFormat: .html,
            destinationMode: .sameAsDocument,
            openExportedFile: true,
            revealExportedFileInFinder: false,
            allowYAMLOverrides: true,
            activeHTMLPresetID: htmlPreset.id,
            activePDFPresetID: pdfPreset.id
        )
        let markdown = """
        ---
        exportPreset: pdf-print
        export:
          fileName: Quarterly Report
          theme: light
          pdf:
            paperSize: A4
            margin: 48
            printBackground: true
        ---
        # Report
        """

        let request = try MarkdownExportService.resolveExportRequest(
            markdown: markdown,
            requestedFormat: .pdf,
            documentTitle: "Ignored Title",
            settings: settings,
            presets: [htmlPreset, pdfPreset],
            appearanceMode: .dark,
            interfaceStyle: .dark
        )

        XCTAssertEqual(request.format, .pdf)
        XCTAssertEqual(request.preset.id, pdfPreset.id)
        XCTAssertEqual(request.suggestedFilename, "Quarterly Report.pdf")
        XCTAssertEqual(request.resolvedTheme, .light)
        XCTAssertEqual(
            request.pdfOptions,
            PDFExportOptions(
                paperSize: .a4,
                margin: 48,
                printBackground: true
            )
        )
    }

    func testResolveExportRequestRejectsInvalidOverrideValue() {
        let settings = ExportSettings()
        let markdown = """
        ---
        export:
          pdf:
            margin: abc
        ---
        # Invalid
        """

        XCTAssertThrowsError(
            try MarkdownExportService.resolveExportRequest(
                markdown: markdown,
                requestedFormat: .pdf,
                documentTitle: "Invalid",
                settings: settings,
                presets: ExportPreset.builtInDefaults(),
                appearanceMode: .followSystem,
                interfaceStyle: .light
            )
        ) { error in
            XCTAssertEqual(
                error as? MarkdownExportError,
                .invalidOverrideValue(field: "pdf.margin", value: "abc")
            )
        }
    }

    func testResolveExportRequestRejectsPresetFormatMismatch() {
        let htmlPreset = ExportPreset(
            key: "html-default",
            name: "HTML 默认",
            format: .html
        )
        let pdfPreset = ExportPreset(
            key: "pdf-default",
            name: "PDF 默认",
            format: .pdf
        )
        let markdown = """
        ---
        exportPreset: pdf-default
        ---
        # Mismatch
        """

        XCTAssertThrowsError(
            try MarkdownExportService.resolveExportRequest(
                markdown: markdown,
                requestedFormat: .html,
                documentTitle: "Mismatch",
                settings: ExportSettings(
                    activeHTMLPresetID: htmlPreset.id,
                    activePDFPresetID: pdfPreset.id
                ),
                presets: [htmlPreset, pdfPreset],
                appearanceMode: .followSystem,
                interfaceStyle: .light
            )
        ) { error in
            XCTAssertEqual(
                error as? MarkdownExportError,
                .presetFormatMismatch(expected: .html, actual: .pdf)
            )
        }
    }
}
