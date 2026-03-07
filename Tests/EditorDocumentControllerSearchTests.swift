import Foundation

@main
struct EditorDocumentControllerSearchTests {
    @MainActor
    static func main() {
        testShowingReplacePanelKeepsFindVisible()
        testTypingAQueryCreatesDocumentMatches()
        testNavigatingMatchesCyclesAcrossDocument()
        testReplacingCurrentMatchUpdatesMarkdown()
    }

    @MainActor
    private static func testShowingReplacePanelKeepsFindVisible() {
        let controller = EditorDocumentController(markdown: "alpha beta")

        controller.showDocumentSearch(replacing: true)

        guard controller.isDocumentSearchPresented else {
            fatalError("Expected showDocumentSearch(replacing:) to present the find panel.")
        }

        guard controller.isDocumentReplacePresented else {
            fatalError("Expected replace mode to expose the replacement field.")
        }
    }

    @MainActor
    private static func testTypingAQueryCreatesDocumentMatches() {
        let controller = EditorDocumentController(markdown: "beta\nalpha beta")
        controller.showDocumentSearch()
        controller.documentSearchQuery = "beta"

        guard controller.documentSearchResults.count == 2 else {
            fatalError("Expected document search to scan the active markdown tab.")
        }

        guard controller.documentSearchCurrentMatchIndex == 0 else {
            fatalError("Expected document search to select the first match by default.")
        }
    }

    @MainActor
    private static func testNavigatingMatchesCyclesAcrossDocument() {
        let controller = EditorDocumentController(markdown: "beta beta beta")
        controller.showDocumentSearch()
        controller.documentSearchQuery = "beta"

        controller.selectNextDocumentSearchMatch()
        guard controller.documentSearchCurrentMatchIndex == 1 else {
            fatalError("Expected next-match navigation to advance to the second match.")
        }

        controller.selectPreviousDocumentSearchMatch()
        guard controller.documentSearchCurrentMatchIndex == 0 else {
            fatalError("Expected previous-match navigation to wrap back to the first match.")
        }
    }

    @MainActor
    private static func testReplacingCurrentMatchUpdatesMarkdown() {
        let controller = EditorDocumentController(markdown: "beta beta beta")
        controller.showDocumentSearch(replacing: true)
        controller.documentSearchQuery = "beta"
        controller.documentSearchReplacement = "delta"

        controller.selectNextDocumentSearchMatch()
        controller.replaceCurrentDocumentSearchMatch()

        guard controller.currentMarkdown == "beta delta beta" else {
            fatalError("Expected replacing the active match to mutate the current markdown.")
        }

        guard controller.documentSearchResults.count == 2 else {
            fatalError("Expected search results to refresh after replacement.")
        }
    }
}
