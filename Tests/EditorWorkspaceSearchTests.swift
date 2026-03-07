import XCTest
@testable import Markdown

final class EditorWorkspaceSearchTests: XCTestCase {
    func testSearchFindsPlainTextMatches() {
        let results = EditorWorkspaceSearch.search(
            query: "Euler",
            in: [
                makeFile("notes/math.md", """
                # Math
                Euler identity appears here.
                """),
                makeFile("notes/physics.md", """
                # Physics
                No match.
                """)
            ],
            isCaseSensitive: false,
            useRegularExpression: false
        )

        XCTAssertEqual(results.count, 1, "Expected one plain-text search result, got \(results.count)")
        XCTAssertEqual(results[0].relativePath, "notes/math.md", "Expected match to point at notes/math.md.")
        XCTAssertEqual(results[0].lineNumber, 2, "Expected match on line 2.")
        XCTAssertEqual(results[0].columnNumber, 1, "Expected match to start at column 1.")
        XCTAssertEqual(results[0].matchOffset, 7, "Expected match offset to account for the heading line and newline.")
    }

    func testSearchHonorsCaseSensitivity() {
        let files = [
            makeFile("notes/one.md", "Euler"),
            makeFile("notes/two.md", "euler")
        ]

        let insensitiveResults = EditorWorkspaceSearch.search(
            query: "Euler",
            in: files,
            isCaseSensitive: false,
            useRegularExpression: false
        )

        let sensitiveResults = EditorWorkspaceSearch.search(
            query: "Euler",
            in: files,
            isCaseSensitive: true,
            useRegularExpression: false
        )

        XCTAssertEqual(insensitiveResults.count, 2, "Expected case-insensitive search to match both files.")
        XCTAssertEqual(sensitiveResults.count, 1, "Expected case-sensitive search to match only notes/one.md.")
        XCTAssertEqual(sensitiveResults[0].relativePath, "notes/one.md", "Expected case-sensitive search to match only notes/one.md.")
    }

    func testSearchSupportsRegularExpressions() {
        let results = EditorWorkspaceSearch.search(
            query: "a\\d",
            in: [
                makeFile("notes/math.md", "a1\nb2"),
                makeFile("notes/other.md", "plain text")
            ],
            isCaseSensitive: false,
            useRegularExpression: true
        )

        XCTAssertEqual(results.count, 1, "Expected regex search to return one result, got \(results.count)")
        XCTAssertEqual(results[0].matchedText, "a1", "Expected regex search to preserve the matched text.")
    }

    func testSearchReportsMatchOffsetsAndColumns() {
        let results = EditorWorkspaceSearch.search(
            query: "beta",
            in: [
                makeFile("notes/example.md", """
                alpha
                gamma beta delta
                """)
            ],
            isCaseSensitive: false,
            useRegularExpression: false
        )

        XCTAssertEqual(results.count, 1, "Expected exactly one match for offset test.")
        XCTAssertEqual(results[0].columnNumber, 7, "Expected match to start at column 7, got \(results[0].columnNumber).")
        XCTAssertEqual(results[0].matchLength, 4, "Expected match length to equal the matched text length.")
        XCTAssertEqual(results[0].matchOffset, 12, "Expected absolute match offset to include the first line and newline.")
    }

    private func makeFile(_ relativePath: String, _ content: String) -> EditorWorkspaceSearchFile {
        EditorWorkspaceSearchFile(
            url: URL(fileURLWithPath: "/tmp/\(relativePath)"),
            relativePath: relativePath,
            content: content
        )
    }
}
