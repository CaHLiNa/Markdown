import XCTest
@testable import Markdown

final class EditorWorkspaceTreeTests: HostedXCTestCase {
    private let rootFolderURL = URL(fileURLWithPath: "/tmp/workspace", isDirectory: true)

    func testBuildsHierarchicalWorkspaceTree() {
        let files = [
            makeFile("README.md"),
            makeFile("notes/math/algebra.md"),
            makeFile("notes/math/geometry.md"),
            makeFile("notes/todo.md")
        ]

        let tree = EditorWorkspaceTreeBuilder.build(from: files, rootFolderURL: rootFolderURL)

        XCTAssertEqual(tree.count, 2, "Expected two top-level nodes, got \(tree.count)")
        XCTAssertTrue(tree[0].isFolder, "Expected top-level folder 'notes'")
        XCTAssertEqual(tree[0].name, "notes", "Expected top-level folder 'notes'")
        XCTAssertTrue(tree[1].isFile, "Expected top-level file 'README.md'")
        XCTAssertEqual(tree[1].name, "README.md", "Expected top-level file 'README.md'")

        let notesChildren = tree[0].children
        XCTAssertEqual(notesChildren.count, 2, "Expected two children under notes, got \(notesChildren.count)")
        XCTAssertTrue(notesChildren[0].isFolder, "Expected nested folder 'math'")
        XCTAssertEqual(notesChildren[0].name, "math", "Expected nested folder 'math'")
        XCTAssertTrue(notesChildren[1].isFile, "Expected file 'todo.md' under notes")
        XCTAssertEqual(notesChildren[1].name, "todo.md", "Expected file 'todo.md' under notes")

        let mathChildren = notesChildren[0].children.map { $0.name }
        XCTAssertEqual(mathChildren, ["algebra.md", "geometry.md"], "Unexpected math folder contents: \(mathChildren)")
    }

    func testFiltersTreeByQueryWhileKeepingAncestors() {
        let files = [
            makeFile("notes/math/algebra.md"),
            makeFile("notes/math/geometry.md"),
            makeFile("notes/todo.md")
        ]

        let tree = EditorWorkspaceTreeBuilder.build(from: files, rootFolderURL: rootFolderURL)
        let filtered = EditorWorkspaceTreeBuilder.filter(nodes: tree, query: "geo")

        XCTAssertEqual(filtered.count, 1, "Expected one top-level match branch, got \(filtered.count)")

        let notes = filtered[0]
        XCTAssertEqual(notes.name, "notes", "Expected filtered notes branch to keep one child")
        XCTAssertEqual(notes.children.count, 1, "Expected filtered notes branch to keep one child")

        let math = notes.children[0]
        XCTAssertEqual(math.name, "math", "Expected filtered math branch to keep one child")
        XCTAssertEqual(math.children.count, 1, "Expected filtered math branch to keep one child")
        XCTAssertEqual(math.children[0].name, "geometry.md", "Expected geometry.md to match search")
    }

    func testCollectsOnlyFolderIDs() {
        let files = [
            makeFile("README.md"),
            makeFile("notes/math/algebra.md"),
            makeFile("notes/todo.md")
        ]

        let tree = EditorWorkspaceTreeBuilder.build(from: files, rootFolderURL: rootFolderURL)
        let folderIDs = EditorWorkspaceTreeBuilder.folderIDs(in: tree)

        let expected: Set<String> = ["notes", "notes/math"]
        XCTAssertEqual(folderIDs, expected, "Expected folder IDs \(expected), got \(folderIDs)")
    }

    private func makeFile(_ relativePath: String) -> EditorWorkspaceFile {
        EditorWorkspaceFile(
            url: URL(fileURLWithPath: "/tmp/\(relativePath)"),
            relativePath: relativePath
        )
    }
}
