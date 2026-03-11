import XCTest

@testable import Markdown

final class EditorPreferencesExportMigrationTests: XCTestCase {
    func testLegacyExportPreferencesMigrateToStructuredPresetsAndSettings() throws {
        let json = """
        {
          "appearanceMode": "跟随系统",
          "exportTheme": "深色",
          "defaultExportFormat": "PDF",
          "exportDestinationMode": "上次导出目录",
          "openExportedFile": false,
          "revealExportedFileInFinder": true,
          "allowYAMLExportOverrides": false,
          "pdfPaperSize": "Letter",
          "pdfMargin": 36,
          "pdfPrintBackground": false
        }
        """

        let preferences = try JSONDecoder().decode(
            EditorPreferences.self,
            from: Data(json.utf8)
        )

        XCTAssertEqual(preferences.exportPresets.count, 2)

        let htmlPreset = try XCTUnwrap(
            preferences.exportPresets.first(where: { $0.format == .html })
        )
        let pdfPreset = try XCTUnwrap(
            preferences.exportPresets.first(where: { $0.format == .pdf })
        )

        XCTAssertEqual(htmlPreset.key, "html-default")
        XCTAssertEqual(htmlPreset.theme, .dark)
        XCTAssertEqual(pdfPreset.key, "pdf-default")
        XCTAssertEqual(pdfPreset.theme, .dark)
        XCTAssertEqual(
            pdfPreset.effectivePDFOptions,
            PDFExportOptions(
                paperSize: .letter,
                margin: 36,
                printBackground: false
            )
        )

        XCTAssertEqual(preferences.exportSettings.defaultFormat, .pdf)
        XCTAssertEqual(preferences.exportSettings.destinationMode, .lastUsed)
        XCTAssertFalse(preferences.exportSettings.openExportedFile)
        XCTAssertTrue(preferences.exportSettings.revealExportedFileInFinder)
        XCTAssertFalse(preferences.exportSettings.allowYAMLOverrides)
        XCTAssertEqual(preferences.exportSettings.activeHTMLPresetID, htmlPreset.id)
        XCTAssertEqual(preferences.exportSettings.activePDFPresetID, pdfPreset.id)
    }
}
