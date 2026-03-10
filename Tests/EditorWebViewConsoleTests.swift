import XCTest
@testable import Markdown

final class EditorWebViewConsoleTests: XCTestCase {
    func testConsoleForwardingScriptClassifiesResourceFailuresAsWarnings() {
        let script = EditorWebView.consoleForwardingScript

        XCTAssertTrue(script.contains("post('warn', ["))
        XCTAssertTrue(script.contains("'Resource load failed'"))
        XCTAssertTrue(script.contains("target.tagName ?? null"))
        XCTAssertTrue(script.contains("target.getAttribute?.('src') ?? null"))
        XCTAssertTrue(script.contains("target.getAttribute?.('href') ?? null"))
    }
}
