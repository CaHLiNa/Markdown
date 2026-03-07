import Foundation

@main
struct EditorDocumentSearchTests {
    static func main() {
        testSearchFindsAllMatchesAcrossDocument()
        testSearchReportsRegularExpressionErrors()
        testReplaceCurrentAdvancesToNextMatch()
        testReplaceAllSupportsRegularExpressionTemplates()
    }

    private static func testSearchFindsAllMatchesAcrossDocument() {
        let result = EditorDocumentSearch.search(
            query: "beta",
            in: """
            alpha beta
            beta gamma beta
            """,
            isCaseSensitive: false,
            useRegularExpression: false
        )

        guard result.errorDescription == nil else {
            fatalError("Expected plain-text document search to compile without errors.")
        }

        guard result.matches.count == 3 else {
            fatalError("Expected all document matches to be returned, got \(result.matches.count).")
        }

        guard result.matches.map(\.offset) == [6, 11, 22] else {
            fatalError("Expected document search offsets to preserve every match location.")
        }

        guard result.matches.map(\.columnNumber) == [7, 1, 12] else {
            fatalError("Expected document search columns to align with each match.")
        }
    }

    private static func testSearchReportsRegularExpressionErrors() {
        let result = EditorDocumentSearch.search(
            query: "(",
            in: "alpha beta",
            isCaseSensitive: false,
            useRegularExpression: true
        )

        guard result.matches.isEmpty else {
            fatalError("Expected invalid regular expressions to produce no matches.")
        }

        guard result.errorDescription != nil else {
            fatalError("Expected invalid regular expressions to surface an error message.")
        }
    }

    private static func testReplaceCurrentAdvancesToNextMatch() {
        let result = EditorDocumentSearch.replaceCurrentMatch(
            query: "beta",
            replacement: "delta",
            in: "beta beta beta",
            currentMatchIndex: 1,
            isCaseSensitive: false,
            useRegularExpression: false
        )

        guard result.updatedText == "beta delta beta" else {
            fatalError("Expected only the active match to be replaced.")
        }

        guard result.replacedCount == 1 else {
            fatalError("Expected single-match replacement to report one replacement.")
        }

        guard result.nextMatchIndex == 1 else {
            fatalError("Expected replacement to advance to the next remaining match.")
        }
    }

    private static func testReplaceAllSupportsRegularExpressionTemplates() {
        let result = EditorDocumentSearch.replaceAllMatches(
            query: "a(\\d)",
            replacement: "b$1",
            in: "a1 a2 a3",
            isCaseSensitive: false,
            useRegularExpression: true
        )

        guard result.updatedText == "b1 b2 b3" else {
            fatalError("Expected regex replacement templates to be applied to all matches.")
        }

        guard result.replacedCount == 3 else {
            fatalError("Expected replace-all to report the total number of replacements.")
        }
    }
}
