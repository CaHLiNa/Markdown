import Foundation

@main
struct EditorWorkspaceTreeTests {
    static func main() {
        testBuildsHierarchicalWorkspaceTree()
        testFiltersTreeByQueryWhileKeepingAncestors()
        testCollectsOnlyFolderIDs()
    }

    private static func testBuildsHierarchicalWorkspaceTree() {
        let files = [
            makeFile("README.md"),
            makeFile("notes/math/algebra.md"),
            makeFile("notes/math/geometry.md"),
            makeFile("notes/todo.md")
        ]

        let tree = EditorWorkspaceTreeBuilder.build(from: files)

        guard tree.count == 2 else {
            fatalError("Expected two top-level nodes, got \(tree.count)")
        }

        guard tree[0].isFolder, tree[0].name == "notes" else {
            fatalError("Expected top-level folder 'notes'")
        }

        guard tree[1].isFile, tree[1].name == "README.md" else {
            fatalError("Expected top-level file 'README.md'")
        }

        let notesChildren = tree[0].children
        guard notesChildren.count == 2 else {
            fatalError("Expected two children under notes, got \(notesChildren.count)")
        }

        guard notesChildren[0].isFolder, notesChildren[0].name == "math" else {
            fatalError("Expected nested folder 'math'")
        }

        guard notesChildren[1].isFile, notesChildren[1].name == "todo.md" else {
            fatalError("Expected file 'todo.md' under notes")
        }

        let mathChildren = notesChildren[0].children.map(\.name)
        guard mathChildren == ["algebra.md", "geometry.md"] else {
            fatalError("Unexpected math folder contents: \(mathChildren)")
        }
    }

    private static func testFiltersTreeByQueryWhileKeepingAncestors() {
        let files = [
            makeFile("notes/math/algebra.md"),
            makeFile("notes/math/geometry.md"),
            makeFile("notes/todo.md")
        ]

        let tree = EditorWorkspaceTreeBuilder.build(from: files)
        let filtered = EditorWorkspaceTreeBuilder.filter(nodes: tree, query: "geo")

        guard filtered.count == 1 else {
            fatalError("Expected one top-level match branch, got \(filtered.count)")
        }

        let notes = filtered[0]
        guard notes.name == "notes", notes.children.count == 1 else {
            fatalError("Expected filtered notes branch to keep one child")
        }

        let math = notes.children[0]
        guard math.name == "math", math.children.count == 1 else {
            fatalError("Expected filtered math branch to keep one child")
        }

        guard math.children[0].name == "geometry.md" else {
            fatalError("Expected geometry.md to match search")
        }
    }

    private static func testCollectsOnlyFolderIDs() {
        let files = [
            makeFile("README.md"),
            makeFile("notes/math/algebra.md"),
            makeFile("notes/todo.md")
        ]

        let tree = EditorWorkspaceTreeBuilder.build(from: files)
        let folderIDs = EditorWorkspaceTreeBuilder.folderIDs(in: tree)

        let expected: Set<String> = ["notes", "notes/math"]
        guard folderIDs == expected else {
            fatalError("Expected folder IDs \(expected), got \(folderIDs)")
        }
    }

    private static func makeFile(_ relativePath: String) -> EditorWorkspaceFile {
        EditorWorkspaceFile(
            url: URL(fileURLWithPath: "/tmp/\(relativePath)"),
            relativePath: relativePath
        )
    }
}
