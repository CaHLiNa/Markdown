import XCTest
@testable import Markdown

final class EditorCommandPaletteTests: XCTestCase {
    func testCatalogIncludesCoreWorkspaceCommands() {
        let ids = Set(EditorCommandPaletteCatalog.allItems.map(\.id))

        XCTAssertTrue(ids.contains("file.quick-open"), "Expected command palette catalog to include quick open.")
        XCTAssertTrue(ids.contains("view.command-palette"), "Expected command palette catalog to include command palette.")
        XCTAssertTrue(ids.contains("view.toggle-global-source-mode"), "Expected command palette catalog to include global source mode toggle.")
    }

    func testCatalogIncludesRichEditorCommands() {
        let ids = Set(EditorCommandPaletteCatalog.allItems.map(\.id))

        XCTAssertTrue(ids.contains(EditorCommand.table.rawValue), "Expected command palette catalog to include table insertion.")
        XCTAssertTrue(ids.contains(EditorCommand.bold.rawValue), "Expected command palette catalog to include bold formatting.")
        XCTAssertTrue(ids.contains(EditorCommand.mathBlock.rawValue), "Expected command palette catalog to include math block insertion.")
    }

    func testCatalogIncludesExtendedWorkspaceAndTransformCommands() {
        let ids = Set(EditorCommandPaletteCatalog.allItems.map(\.id))

        XCTAssertTrue(ids.contains("file.save"), "Expected command palette catalog to include save.")
        XCTAssertTrue(ids.contains("view.search"), "Expected command palette catalog to include workspace search.")
        XCTAssertTrue(ids.contains("edit.find"), "Expected command palette catalog to include in-document find.")
        XCTAssertTrue(ids.contains("edit.replace"), "Expected command palette catalog to include in-document replace.")
        XCTAssertTrue(ids.contains(EditorCommand.upgradeHeading.rawValue), "Expected command palette catalog to include heading promotion.")
        XCTAssertTrue(ids.contains(EditorCommand.clearFormat.rawValue), "Expected command palette catalog to include clear format.")
    }
}
