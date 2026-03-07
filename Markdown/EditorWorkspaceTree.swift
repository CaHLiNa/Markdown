//
//  EditorWorkspaceTree.swift
//  Markdown
//
//  Created by Codex on 2026/3/8.
//

import Foundation

struct EditorWorkspaceFile: Identifiable, Equatable {
    let url: URL
    let relativePath: String

    var id: URL { url }
    var displayName: String { url.lastPathComponent }
}

struct EditorWorkspaceNode: Identifiable, Equatable {
    let id: String
    let name: String
    let relativePath: String
    let url: URL?
    var children: [EditorWorkspaceNode]

    var isFolder: Bool {
        url == nil
    }

    var isFile: Bool {
        url != nil
    }
}

enum EditorWorkspaceTreeBuilder {
    static func build(from files: [EditorWorkspaceFile]) -> [EditorWorkspaceNode] {
        let root = MutableNode(name: "", relativePath: "")

        for file in files {
            let components = file.relativePath
                .split(separator: "/")
                .map(String.init)

            insert(
                file: file,
                components: components,
                componentIndex: 0,
                currentPath: "",
                parent: root
            )
        }

        return root.sortedChildren()
    }

    static func filter(nodes: [EditorWorkspaceNode], query: String) -> [EditorWorkspaceNode] {
        let trimmedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedQuery.isEmpty else {
            return nodes
        }

        return nodes.compactMap { filter(node: $0, query: trimmedQuery) }
    }

    static func folderIDs(in nodes: [EditorWorkspaceNode]) -> Set<String> {
        var ids: Set<String> = []

        for node in nodes where node.isFolder {
            ids.insert(node.id)
            ids.formUnion(folderIDs(in: node.children))
        }

        return ids
    }

    private static func insert(
        file: EditorWorkspaceFile,
        components: [String],
        componentIndex: Int,
        currentPath: String,
        parent: MutableNode
    ) {
        guard componentIndex < components.count else {
            return
        }

        let name = components[componentIndex]
        let nextPath = currentPath.isEmpty ? name : "\(currentPath)/\(name)"
        let isLeaf = componentIndex == components.count - 1

        if isLeaf {
            parent.children[name] = MutableNode(
                name: name,
                relativePath: nextPath,
                url: file.url
            )
            return
        }

        let child = parent.children[name] ?? MutableNode(name: name, relativePath: nextPath)
        parent.children[name] = child

        insert(
            file: file,
            components: components,
            componentIndex: componentIndex + 1,
            currentPath: nextPath,
            parent: child
        )
    }

    private static func filter(node: EditorWorkspaceNode, query: String) -> EditorWorkspaceNode? {
        if matches(node: node, query: query) {
            return node
        }

        guard node.isFolder else {
            return nil
        }

        let filteredChildren = node.children.compactMap { filter(node: $0, query: query) }
        guard !filteredChildren.isEmpty else {
            return nil
        }

        var copy = node
        copy.children = filteredChildren
        return copy
    }

    private static func matches(node: EditorWorkspaceNode, query: String) -> Bool {
        node.name.localizedCaseInsensitiveContains(query) ||
            node.relativePath.localizedCaseInsensitiveContains(query)
    }
}

private final class MutableNode {
    let name: String
    let relativePath: String
    var url: URL?
    var children: [String: MutableNode]

    init(
        name: String,
        relativePath: String,
        url: URL? = nil,
        children: [String: MutableNode] = [:]
    ) {
        self.name = name
        self.relativePath = relativePath
        self.url = url
        self.children = children
    }

    func sortedChildren() -> [EditorWorkspaceNode] {
        children.values
            .sorted(by: Self.sort)
            .map { child in
                EditorWorkspaceNode(
                    id: child.relativePath,
                    name: child.name,
                    relativePath: child.relativePath,
                    url: child.url,
                    children: child.sortedChildren()
                )
            }
    }

    private static func sort(lhs: MutableNode, rhs: MutableNode) -> Bool {
        if lhs.url == nil && rhs.url != nil {
            return true
        }

        if lhs.url != nil && rhs.url == nil {
            return false
        }

        return lhs.name.localizedStandardCompare(rhs.name) == .orderedAscending
    }
}
