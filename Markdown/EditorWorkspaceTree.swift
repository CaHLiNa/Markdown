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

struct EditorWorkspaceNode: Identifiable {
    enum Kind {
        case folder
        case file
    }

    let id: String
    let name: String
    let relativePath: String
    let url: URL
    let kind: Kind
    var children: [EditorWorkspaceNode]

    var isFolder: Bool {
        if case .folder = kind {
            return true
        }

        return false
    }

    var isFile: Bool {
        if case .file = kind {
            return true
        }

        return false
    }
}

enum EditorWorkspaceTreeBuilder {
    static func build(from files: [EditorWorkspaceFile], rootFolderURL: URL) -> [EditorWorkspaceNode] {
        let root = MutableNode(
            name: "",
            relativePath: "",
            url: rootFolderURL,
            kind: .folder
        )

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

    static func buildWorkspace(from rootFolderURL: URL) throws -> [EditorWorkspaceNode] {
        try contents(of: rootFolderURL, relativePath: "")
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

    static func rootFolderIDs(in nodes: [EditorWorkspaceNode]) -> Set<String> {
        Set(nodes.filter(\.isFolder).map(\.id))
    }

    static func folderURLs(in nodes: [EditorWorkspaceNode]) -> [URL] {
        nodes.flatMap { node -> [URL] in
            guard node.isFolder else {
                return []
            }

            return [node.url] + folderURLs(in: node.children)
        }
    }

    static func itemIDs(in nodes: [EditorWorkspaceNode]) -> Set<String> {
        Set(nodes.flatMap(itemIDs(for:)))
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
        let nextURL = parent.url.appendingPathComponent(name, isDirectory: !isLeaf)

        if isLeaf {
            parent.children[name] = MutableNode(
                name: name,
                relativePath: nextPath,
                url: file.url,
                kind: .file
            )
            return
        }

        let child = parent.children[name] ?? MutableNode(
            name: name,
            relativePath: nextPath,
            url: nextURL,
            kind: .folder
        )
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

    private static func contents(of directoryURL: URL, relativePath: String) throws -> [EditorWorkspaceNode] {
        let resourceKeys: Set<URLResourceKey> = [
            .isDirectoryKey,
            .isRegularFileKey,
            .isHiddenKey,
            .isPackageKey
        ]
        let entries = try FileManager.default.contentsOfDirectory(
            at: directoryURL,
            includingPropertiesForKeys: Array(resourceKeys),
            options: [.skipsHiddenFiles]
        )

        return try entries.compactMap { url in
            let values = try url.resourceValues(forKeys: resourceKeys)

            if values.isHidden == true {
                return nil
            }

            let name = url.lastPathComponent
            let nextRelativePath = relativePath.isEmpty ? name : "\(relativePath)/\(name)"

            if values.isDirectory == true {
                if values.isPackage == true {
                    return nil
                }

                return EditorWorkspaceNode(
                    id: nextRelativePath,
                    name: name,
                    relativePath: nextRelativePath,
                    url: url,
                    kind: .folder,
                    children: try contents(of: url, relativePath: nextRelativePath)
                )
            }

            guard
                values.isRegularFile == true,
                MarkdownFileService.supportedPathExtensions.contains(url.pathExtension.lowercased())
            else {
                return nil
            }

            return EditorWorkspaceNode(
                id: nextRelativePath,
                name: name,
                relativePath: nextRelativePath,
                url: url,
                kind: .file,
                children: []
            )
        }
        .sorted(by: sort)
    }

    nonisolated private static func sort(lhs: EditorWorkspaceNode, rhs: EditorWorkspaceNode) -> Bool {
        switch (lhs.kind, rhs.kind) {
        case (.folder, .file):
            return true
        case (.file, .folder):
            return false
        case (.folder, .folder), (.file, .file):
            break
        }

        return lhs.name.localizedStandardCompare(rhs.name) == .orderedAscending
    }

    private static func itemIDs(for node: EditorWorkspaceNode) -> [String] {
        [node.id] + node.children.flatMap(itemIDs(for:))
    }
}

private final class MutableNode {
    let name: String
    let relativePath: String
    let url: URL
    let kind: EditorWorkspaceNode.Kind
    var children: [String: MutableNode]

    init(
        name: String,
        relativePath: String,
        url: URL,
        kind: EditorWorkspaceNode.Kind,
        children: [String: MutableNode] = [:]
    ) {
        self.name = name
        self.relativePath = relativePath
        self.url = url
        self.kind = kind
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
                    kind: child.kind,
                    children: child.sortedChildren()
                )
            }
    }

    nonisolated private static func sort(lhs: MutableNode, rhs: MutableNode) -> Bool {
        switch (lhs.kind, rhs.kind) {
        case (.folder, .file):
            return true
        case (.file, .folder):
            return false
        case (.folder, .folder), (.file, .file):
            break
        }

        return lhs.name.localizedStandardCompare(rhs.name) == .orderedAscending
    }
}
