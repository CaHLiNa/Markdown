import Foundation

@main
struct EditorWorkspaceSearchTests {
    static func main() {
        testSearchFindsPlainTextMatches()
        testSearchHonorsCaseSensitivity()
        testSearchSupportsRegularExpressions()
    }

    private static func testSearchFindsPlainTextMatches() {
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

        guard results.count == 1 else {
            fatalError("Expected one plain-text search result, got \(results.count)")
        }

        guard results[0].relativePath == "notes/math.md" else {
            fatalError("Expected match to point at notes/math.md.")
        }

        guard results[0].lineNumber == 2 else {
            fatalError("Expected match on line 2.")
        }
    }

    private static func testSearchHonorsCaseSensitivity() {
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

        guard insensitiveResults.count == 2 else {
            fatalError("Expected case-insensitive search to match both files.")
        }

        guard sensitiveResults.count == 1, sensitiveResults[0].relativePath == "notes/one.md" else {
            fatalError("Expected case-sensitive search to match only notes/one.md.")
        }
    }

    private static func testSearchSupportsRegularExpressions() {
        let results = EditorWorkspaceSearch.search(
            query: "a\\d",
            in: [
                makeFile("notes/math.md", "a1\nb2"),
                makeFile("notes/other.md", "plain text")
            ],
            isCaseSensitive: false,
            useRegularExpression: true
        )

        guard results.count == 1 else {
            fatalError("Expected regex search to return one result, got \(results.count)")
        }

        guard results[0].matchedText == "a1" else {
            fatalError("Expected regex search to preserve the matched text.")
        }
    }

    private static func makeFile(_ relativePath: String, _ content: String) -> EditorWorkspaceSearchFile {
        EditorWorkspaceSearchFile(
            url: URL(fileURLWithPath: "/tmp/\(relativePath)"),
            relativePath: relativePath,
            content: content
        )
    }
}
