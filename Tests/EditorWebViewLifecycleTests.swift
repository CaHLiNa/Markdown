import XCTest
@testable import Markdown

@MainActor
final class EditorWebViewLifecycleTests: XCTestCase {
    func testPageLoadStatePrepareForPageLoadClearsReadyState() {
        var state = EditorWebView.PageLoadState()

        state.markReady()
        XCTAssertTrue(state.isReady)

        state.prepareForPageLoad()
        XCTAssertFalse(state.isReady)
    }

    func testSynchronizedPageStateResetClearsAllCachedValues() {
        var state = EditorWebView.SynchronizedPageState(
            markdown: "# Title",
            documentBaseURL: URL(fileURLWithPath: "/tmp/example.md"),
            presentation: .default,
            revealRequestID: UUID()
        )

        state.resetForPageLoad()

        XCTAssertNil(state.markdown)
        XCTAssertNil(state.documentBaseURL)
        XCTAssertNil(state.presentation)
        XCTAssertNil(state.revealRequestID)
    }
}
