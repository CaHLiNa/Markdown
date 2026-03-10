import XCTest
@testable import Markdown

@MainActor
final class EditorWebViewLifecycleTests: XCTestCase {
    func testPageLoadStatePrepareForPageLoadClearsReadyState() {
        var state = EditorWebView.PageLoadState()

        let generation = state.prepareForPageLoad()
        XCTAssertEqual(generation, 1)
        XCTAssertTrue(state.markReady(for: generation))
        XCTAssertTrue(state.isReady)

        state.prepareForPageLoad()
        XCTAssertFalse(state.isReady)
    }

    func testPageLoadStateOnlyAcceptsCurrentGenerationMessages() {
        var state = EditorWebView.PageLoadState()

        let firstGeneration = state.prepareForPageLoad()
        XCTAssertTrue(state.markReady(for: firstGeneration))
        XCTAssertTrue(state.acceptsMessage(for: firstGeneration))

        let secondGeneration = state.prepareForPageLoad()
        XCTAssertEqual(secondGeneration, 2)
        XCTAssertFalse(state.acceptsMessage(for: firstGeneration))
        XCTAssertFalse(state.markReady(for: firstGeneration))
        XCTAssertTrue(state.markReady(for: secondGeneration))
        XCTAssertTrue(state.acceptsMessage(for: secondGeneration))
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
