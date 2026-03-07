import XCTest
@testable import Markdown

final class EditorDocumentSearchTests: XCTestCase {
    func testSearchFindsAllMatchesAcrossDocument() {
        let result = EditorDocumentSearch.search(
            query: "beta",
            in: """
            alpha beta
            beta gamma beta
            """,
            isCaseSensitive: false,
            useRegularExpression: false
        )

        XCTAssertNil(result.errorDescription, "Expected plain-text document search to compile without errors.")
        XCTAssertEqual(result.matches.count, 3, "Expected all document matches to be returned, got \(result.matches.count).")
        XCTAssertEqual(result.matches.map(\.offset), [6, 11, 22], "Expected document search offsets to preserve every match location.")
        XCTAssertEqual(result.matches.map(\.columnNumber), [7, 1, 12], "Expected document search columns to align with each match.")
    }

    func testSearchReportsRegularExpressionErrors() {
        let result = EditorDocumentSearch.search(
            query: "(",
            in: "alpha beta",
            isCaseSensitive: false,
            useRegularExpression: true
        )

        XCTAssertTrue(result.matches.isEmpty, "Expected invalid regular expressions to produce no matches.")
        XCTAssertNotNil(result.errorDescription, "Expected invalid regular expressions to surface an error message.")
    }

    func testReplaceCurrentAdvancesToNextMatch() {
        let result = EditorDocumentSearch.replaceCurrentMatch(
            query: "beta",
            replacement: "delta",
            in: "beta beta beta",
            currentMatchIndex: 1,
            isCaseSensitive: false,
            useRegularExpression: false
        )

        XCTAssertEqual(result.updatedText, "beta delta beta", "Expected only the active match to be replaced.")
        XCTAssertEqual(result.replacedCount, 1, "Expected single-match replacement to report one replacement.")
        XCTAssertEqual(result.nextMatchIndex, 1, "Expected replacement to advance to the next remaining match.")
    }

    func testReplaceAllSupportsRegularExpressionTemplates() {
        let result = EditorDocumentSearch.replaceAllMatches(
            query: "a(\\d)",
            replacement: "b$1",
            in: "a1 a2 a3",
            isCaseSensitive: false,
            useRegularExpression: true
        )

        XCTAssertEqual(result.updatedText, "b1 b2 b3", "Expected regex replacement templates to be applied to all matches.")
        XCTAssertEqual(result.replacedCount, 3, "Expected replace-all to report the total number of replacements.")
    }
}
