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

        XCTAssertEqual(controller.tabs.count, 2, "Expected creating an untitled document to append a new tab.")
        XCTAssertNotEqual(controller.activeTabID, originalActiveTabID, "Expected the new tab to become active.")
        XCTAssertEqual(controller.activeTabID, controller.tabs.last?.id, "Expected the appended tab to be selected.")
        XCTAssertEqual(controller.tabs.last?.title, "Untitled-2", "Expected the new untitled tab to use the next sequential title.")
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
    }
}
