import XCTest
@testable import Markdown

@MainActor
final class EditorDocumentControllerTabTests: HostedXCTestCase {
    func testDefaultsToVisibleTabStrip() {
        resetPersistentState()
        let controller = EditorDocumentController()

        XCTAssertTrue(controller.isTabStripVisible, "Expected the tab strip to default to visible.")
    }

    func testCreateUntitledDocumentAppendsAndSelectsNewTab() {
        resetPersistentState()
        let controller = EditorDocumentController()
        let originalActiveTabID = controller.activeTabID

        controller.createUntitledDocument()

        XCTAssertEqual(controller.tabs.count, 1, "Expected creating the first untitled document to open a single tab.")
        XCTAssertNotEqual(controller.activeTabID, originalActiveTabID, "Expected the new tab to become active.")
        XCTAssertEqual(controller.activeTabID, controller.tabs.last?.id, "Expected the appended tab to be selected.")
        XCTAssertEqual(controller.tabs.last?.title, "Untitled-2", "Expected the first manually created untitled tab to use the next sequential title.")
    }

    func testClosingDirtyTabCanBeCancelled() {
        resetPersistentState()
        let controller = EditorDocumentController()
        controller.createUntitledDocument()
        controller.currentMarkdown = "modified"
        controller.unsavedChangesDecisionHandler = { _ in .cancel }

        controller.closeCurrentTab()

        XCTAssertEqual(controller.tabs.count, 1, "Expected cancel to keep the dirty tab open.")
        XCTAssertEqual(controller.currentMarkdown, "modified", "Expected the dirty markdown to remain untouched.")
    }

    func testClosingDirtyTabCanDiscardChanges() {
        resetPersistentState()
        let controller = EditorDocumentController()
        controller.createUntitledDocument()
        controller.currentMarkdown = "modified"
        controller.unsavedChangesDecisionHandler = { _ in .discard }

        controller.closeCurrentTab()

        XCTAssertTrue(controller.tabs.isEmpty, "Expected discard to close the only dirty tab.")
        XCTAssertNil(controller.activeTabID, "Expected there to be no active tab after closing the last dirty tab.")
    }

    func testClosingDirtyTabAfterSaveClosesTab() {
        resetPersistentState()
        let controller = EditorDocumentController()
        controller.createUntitledDocument()
        controller.currentMarkdown = "modified"
        controller.unsavedChangesDecisionHandler = { _ in .save }
        controller.saveTabOverride = { _, completion in
            completion(true)
        }

        controller.closeCurrentTab()

        XCTAssertTrue(controller.tabs.isEmpty, "Expected a dirty tab to close after saving succeeds.")
        XCTAssertNil(controller.activeTabID, "Expected there to be no active tab after saving and closing the last tab.")
    }

    func testRestoreLastSessionReopensFileBackedTabs() {
        resetPersistentState()

        let temporaryDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        XCTAssertNoThrow(try FileManager.default.createDirectory(at: temporaryDirectory, withIntermediateDirectories: true))
        defer { try? FileManager.default.removeItem(at: temporaryDirectory) }

        let fileURL = temporaryDirectory.appendingPathComponent("notes.md")
        XCTAssertNoThrow(try "# Restored".write(to: fileURL, atomically: true, encoding: .utf8))

        do {
            let preferences = EditorPreferences(appearanceMode: .followSystem, startupBehavior: .restoreLastSession)
            let preferencesData = try JSONEncoder().encode(preferences)
            UserDefaults.standard.set(preferencesData, forKey: "editorPreferences")

            let sessionObject: [String: Any] = [
                "folderPath": temporaryDirectory.path,
                "openFilePaths": [fileURL.path],
                "activeFilePath": fileURL.path
            ]
            let sessionData = try JSONSerialization.data(withJSONObject: sessionObject)
            UserDefaults.standard.set(sessionData, forKey: "editorSession")
        } catch {
            XCTFail("Failed to seed persisted session: \(error)")
        }

        let controller = EditorDocumentController()

        XCTAssertEqual(controller.tabs.count, 1, "Expected restoreLastSession to reopen the last file-backed tab.")
        XCTAssertEqual(controller.currentFileURL?.standardizedFileURL, fileURL.standardizedFileURL)
        XCTAssertEqual(controller.currentMarkdown, "# Restored")
    }

    func testCompactTitlePreservesBothEndsForLongTitles() {
        let tab = EditorTab(
            id: UUID(),
            title: "this-is-a-very-long-markdown-document-title.md",
            markdown: "",
            fileURL: nil,
            lastSavedMarkdown: ""
        )

        XCTAssertEqual(
            tab.compactTitle(maxLength: 18),
            "this-is…title.md",
            "Expected compactTitle to preserve both the prefix and the file extension for long tab titles."
        )
    }

    private func resetPersistentState() {
        UserDefaults.standard.removeObject(forKey: "editorPreferences")
        UserDefaults.standard.removeObject(forKey: "recentMarkdownFiles")
        UserDefaults.standard.removeObject(forKey: "editorSession")
        UserDefaults.standard.removeObject(forKey: "lastMarkdownExportDirectory")
    }
}
