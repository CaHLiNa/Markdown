import Foundation

@main
struct EditorCommandPaletteTests {
    static func main() {
        testCatalogIncludesCoreWorkspaceCommands()
        testCatalogIncludesRichEditorCommands()
        testCatalogIncludesExtendedWorkspaceAndTransformCommands()
    }

    private static func testCatalogIncludesCoreWorkspaceCommands() {
        let ids = Set(EditorCommandPaletteCatalog.allItems.map(\.id))

        guard ids.contains("file.quick-open") else {
            fatalError("Expected command palette catalog to include quick open.")
        }

        guard ids.contains("view.command-palette") else {
            fatalError("Expected command palette catalog to include command palette.")
        }

        guard ids.contains("view.source-code-mode") else {
            fatalError("Expected command palette catalog to include source mode toggle.")
        }
    }

    private static func testCatalogIncludesRichEditorCommands() {
        let ids = Set(EditorCommandPaletteCatalog.allItems.map(\.id))

        guard ids.contains(EditorCommand.table.rawValue) else {
            fatalError("Expected command palette catalog to include table insertion.")
        }

        guard ids.contains(EditorCommand.bold.rawValue) else {
            fatalError("Expected command palette catalog to include bold formatting.")
        }

        guard ids.contains(EditorCommand.mathBlock.rawValue) else {
            fatalError("Expected command palette catalog to include math block insertion.")
        }
    }

    private static func testCatalogIncludesExtendedWorkspaceAndTransformCommands() {
        let ids = Set(EditorCommandPaletteCatalog.allItems.map(\.id))

        guard ids.contains("file.save") else {
            fatalError("Expected command palette catalog to include save.")
        }

        guard ids.contains("view.search") else {
            fatalError("Expected command palette catalog to include workspace search.")
        }

        guard ids.contains(EditorCommand.upgradeHeading.rawValue) else {
            fatalError("Expected command palette catalog to include heading promotion.")
        }

        guard ids.contains(EditorCommand.clearFormat.rawValue) else {
            fatalError("Expected command palette catalog to include clear format.")
        }
    }
}
