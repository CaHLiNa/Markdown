import XCTest

@testable import Markdown

final class MarkdownExportServiceTests: XCTestCase {
    func testResolveExportRequestUsesHTMLPresetAndYAMLOverrides() throws {
        let activePreset = ExportPreset(
            id: UUID(),
            key: "html-reading",
            name: "HTML 阅读",
            format: .html,
            theme: .sepia,
            suggestedFileStem: "reading-copy"
        )
        let publishPreset = ExportPreset(
            id: UUID(),
            key: "html-publish",
            name: "HTML 发布",
            format: .html,
            theme: .dark,
            suggestedFileStem: "publish-copy"
        )
        let settings = ExportSettings(
            defaultFormat: .html,
            destinationMode: .sameAsDocument,
            openExportedFile: true,
            revealExportedFileInFinder: false,
            allowYAMLOverrides: true,
            activeHTMLPresetID: activePreset.id
        )
        let markdown = """
        ---
        exportPreset: html-publish
        export:
          fileName: Quarterly Report
          theme: light
          preview:
            mode: compact
        ---
        # Report
        """

        let request = try MarkdownExportService.resolveExportRequest(
            markdown: markdown,
            requestedFormat: .html,
            documentTitle: "Ignored Title",
            settings: settings,
            presets: [activePreset, publishPreset],
            appearanceMode: .dark,
            interfaceStyle: .dark
        )

        XCTAssertEqual(request.format, .html)
        XCTAssertEqual(request.preset.id, publishPreset.id)
        XCTAssertEqual(request.suggestedFilename, "Quarterly Report.html")
        XCTAssertEqual(request.resolvedTheme, .light)
    }

    func testResolveExportRequestRejectsInvalidThemeOverride() {
        let settings = ExportSettings()
        let markdown = """
        ---
        export:
          theme: neon
        ---
        # Invalid
        """

        XCTAssertThrowsError(
            try MarkdownExportService.resolveExportRequest(
                markdown: markdown,
                requestedFormat: .html,
                documentTitle: "Invalid",
                settings: settings,
                presets: ExportPreset.builtInDefaults(),
                appearanceMode: .followSystem,
                interfaceStyle: .light
            )
        ) { error in
            XCTAssertEqual(
                error as? MarkdownExportError,
                .invalidOverrideValue(field: "theme", value: "neon")
            )
        }
    }

    func testResolveExportRequestRejectsUnknownPresetKey() {
        let markdown = """
        ---
        exportPreset: missing-preset
        ---
        # Missing
        """

        XCTAssertThrowsError(
            try MarkdownExportService.resolveExportRequest(
                markdown: markdown,
                requestedFormat: .html,
                documentTitle: "Missing",
                settings: ExportSettings(),
                presets: ExportPreset.builtInDefaults(),
                appearanceMode: .followSystem,
                interfaceStyle: .light
            )
        ) { error in
            XCTAssertEqual(error as? MarkdownExportError, .presetNotFound("missing-preset"))
        }
    }
}
