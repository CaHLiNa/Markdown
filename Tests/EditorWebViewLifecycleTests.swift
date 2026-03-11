import XCTest
@testable import Markdown

@MainActor
final class EditorWebViewLifecycleTests: XCTestCase {
    private final class PendingScriptProbe {
        private(set) var results: [Result<Any?, Error>] = []

        func record(_ result: Result<Any?, Error>) {
            results.append(result)
        }
    }

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

    func testControllerPrepareForPageLoadFailsQueuedScriptsFromPreviousGeneration() {
        let controller = EditorWebView.Controller()
        let probe = PendingScriptProbe()

        controller.loadMarkdown("# queued") { result in
            probe.record(result)
        }

        XCTAssertEqual(controller.debugPendingScriptCount, 1)

        _ = controller.prepareForPageLoad()

        XCTAssertEqual(controller.debugPendingScriptCount, 0)
        RunLoop.main.run(until: Date().addingTimeInterval(0.05))
        XCTAssertEqual(probe.results.count, 1)

        guard case .failure(let error) = probe.results[0] else {
            return XCTFail("Expected queued scripts from the previous page generation to fail closed when a new page load starts.")
        }

        XCTAssertEqual(error as? EditorWebViewControllerError, .pageNotReady)
    }
}
