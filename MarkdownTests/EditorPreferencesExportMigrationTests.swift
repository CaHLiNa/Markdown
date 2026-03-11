import XCTest

@testable import Markdown

final class EditorPreferencesExportMigrationTests: XCTestCase {
    func testLegacyExportPreferencesMigrateToStructuredPresetsAndSettings() throws {
        let json = """
        {
          "appearanceMode": "跟随系统",
          "exportTheme": "深色",
          "exportDestinationMode": "上次导出目录",
          "openExportedFile": false,
          "revealExportedFileInFinder": true,
          "allowYAMLExportOverrides": false
        }
        """

        let preferences = try JSONDecoder().decode(
            EditorPreferences.self,
            from: Data(json.utf8)
        )

        XCTAssertEqual(preferences.exportPresets.count, 1)

        let htmlPreset = try XCTUnwrap(
            preferences.exportPresets.first(where: { $0.format == .html })
        )

        XCTAssertEqual(htmlPreset.key, "html-default")
        XCTAssertEqual(htmlPreset.theme, .dark)

        XCTAssertEqual(preferences.exportSettings.defaultFormat, .html)
        XCTAssertEqual(preferences.exportSettings.destinationMode, .lastUsed)
        XCTAssertFalse(preferences.exportSettings.openExportedFile)
        XCTAssertTrue(preferences.exportSettings.revealExportedFileInFinder)
        XCTAssertFalse(preferences.exportSettings.allowYAMLOverrides)
        XCTAssertEqual(preferences.exportSettings.activeHTMLPresetID, htmlPreset.id)
    }
}
