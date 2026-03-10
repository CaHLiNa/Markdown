//
//  MarkdownFileService.swift
//  Markdown
//
//  Created by Codex on 2026/3/7.
//

import Foundation
import UniformTypeIdentifiers

enum MarkdownRenderedTheme: String {
    case light
    case dark
    case sepia
}

enum MarkdownFileService {
    static let markdownContentType = UTType(filenameExtension: "md") ?? .plainText
    static let htmlContentType = UTType.html
    static let pdfContentType = UTType.pdf
    static let supportedPathExtensions = ["md", "markdown", "mdown", "mkd"]

    private struct MarkdownImageReference {
        let path: String
        let range: NSRange
    }

    private struct ParsedMarkdownImageReference {
        let reference: MarkdownImageReference
        let nextIndex: String.Index
    }

    private struct ParsedMarkdownLinkDestination {
        let path: String
        let range: NSRange
        let nextIndex: String.Index
    }

    private struct MarkdownFence {
        let marker: Character
        let length: Int
        let start: String.Index
    }

    static func readMarkdown(from fileURL: URL) throws -> String {
        try String(contentsOf: fileURL, encoding: .utf8)
    }

    static func write(_ markdown: String, to fileURL: URL) throws {
        let destinationURL = normalizedMarkdownURL(from: fileURL)
        try markdown.write(to: destinationURL, atomically: true, encoding: .utf8)
    }

    static func persistImageAsset(
        _ data: Data,
        originalFilename: String,
        mimeType: String,
        alongsideMarkdownFile markdownFileURL: URL,
        preferences: EditorPreferences
    ) throws -> String {
        let assetDirectoryURL = imageAssetDirectoryURL(
            for: markdownFileURL,
            preferences: preferences
        )

        try FileManager.default.createDirectory(
            at: assetDirectoryURL,
            withIntermediateDirectories: true
        )

        let preferredExtension = imagePathExtension(
            originalFilename: originalFilename,
            mimeType: mimeType
        )
        let baseName = sanitizedAssetBaseName(from: originalFilename)
        let destinationURL = uniqueAssetURL(
            in: assetDirectoryURL,
            baseName: baseName,
            pathExtension: preferredExtension
        )

        try data.write(to: destinationURL, options: .atomic)

        let relativePath = relativeImagePath(
            from: markdownFileURL.deletingLastPathComponent(),
            to: destinationURL
        )

        let rawPath = preferences.imageUseRelativePath
            ? relativePath
            : destinationURL.standardizedFileURL.path

        let normalizedPath: String
        if preferences.imageUseRelativePath &&
            preferences.imagePreferDotSlash &&
            !rawPath.hasPrefix("./") &&
            !rawPath.hasPrefix("../")
        {
            normalizedPath = "./\(rawPath)"
        } else {
            normalizedPath = rawPath
        }

        return preferences.imageAutoEncodeURL
            ? encodeMarkdownPath(normalizedPath)
            : normalizedPath
    }

    static func relocateSiblingImageAssetsForSaveAs(
        _ markdown: String,
        from originalMarkdownFileURL: URL,
        to destinationMarkdownFileURL: URL,
        preferences: EditorPreferences
    ) throws -> String {
        guard originalMarkdownFileURL.standardizedFileURL != destinationMarkdownFileURL.standardizedFileURL else {
            return markdown
        }

        let originalAssetDirectoryURL = imageAssetDirectoryURL(
            for: originalMarkdownFileURL,
            preferences: preferences
        )
        let destinationAssetDirectoryURL = imageAssetDirectoryURL(
            for: destinationMarkdownFileURL,
            preferences: preferences
        )
        let originalAssetDirectoryName = originalAssetDirectoryURL.lastPathComponent
        let destinationAssetDirectoryName = destinationAssetDirectoryURL.lastPathComponent
        let sourceRootURL = originalMarkdownFileURL.deletingLastPathComponent()
        let destinationRootURL = destinationMarkdownFileURL.deletingLastPathComponent()
        let fileManager = FileManager.default
        let references = markdownImageReferences(in: markdown)
        var relocatedMarkdown = markdown
        var copiedRelativePaths = Set<String>()

        for reference in references.reversed() {
            guard let referencedPathRange = Range(reference.range, in: relocatedMarkdown) else {
                continue
            }

            let referencedPath = reference.path

            guard referencedPath.hasPrefix("\(originalAssetDirectoryName)/") else {
                continue
            }

            let relativeAssetPath = String(referencedPath.dropFirst(originalAssetDirectoryName.count + 1))
            guard !relativeAssetPath.isEmpty else {
                continue
            }

            let sourceAssetURL = sourceRootURL.appendingPathComponent(referencedPath)
            let destinationRelativePath = "\(destinationAssetDirectoryName)/\(relativeAssetPath)"
            let destinationAssetURL = destinationRootURL.appendingPathComponent(destinationRelativePath)

            if !copiedRelativePaths.contains(referencedPath) {
                try fileManager.createDirectory(
                    at: destinationAssetURL.deletingLastPathComponent(),
                    withIntermediateDirectories: true
                )

                if fileManager.fileExists(atPath: destinationAssetURL.path) {
                    try fileManager.removeItem(at: destinationAssetURL)
                }

                try fileManager.copyItem(at: sourceAssetURL, to: destinationAssetURL)
                copiedRelativePaths.insert(referencedPath)
            }

            relocatedMarkdown.replaceSubrange(referencedPathRange, with: destinationRelativePath)
        }

        return relocatedMarkdown
    }

    static func removeUnusedSiblingImageAssets(
        for markdown: String,
        alongsideMarkdownFile markdownFileURL: URL,
        preferences: EditorPreferences
    ) throws {
        let assetDirectoryURL = imageAssetDirectoryURL(
            for: markdownFileURL,
            preferences: preferences
        )
        let fileManager = FileManager.default

        guard fileManager.fileExists(atPath: assetDirectoryURL.path) else {
            return
        }

        let referencedRelativePaths = referencedSiblingAssetRelativePaths(
            in: markdown,
            siblingAssetDirectoryName: assetDirectoryURL.lastPathComponent
        )

        guard let enumerator = fileManager.enumerator(
            at: assetDirectoryURL,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: [.skipsHiddenFiles]
        ) else {
            return
        }

        var directoryURLs: [URL] = []

        for case let fileURL as URL in enumerator {
            let resourceValues = try fileURL.resourceValues(forKeys: [.isDirectoryKey])

            if resourceValues.isDirectory == true {
                directoryURLs.append(fileURL)
                continue
            }

            guard let relativePath = relativePath(
                of: fileURL,
                relativeToDirectory: assetDirectoryURL
            ) else {
                continue
            }

            if !referencedRelativePaths.contains(relativePath) {
                try fileManager.removeItem(at: fileURL)
            }
        }

        for directoryURL in directoryURLs.sorted(by: { $0.path.count > $1.path.count }) {
            let contents = try fileManager.contentsOfDirectory(
                at: directoryURL,
                includingPropertiesForKeys: nil
            )

            if contents.isEmpty {
                try fileManager.removeItem(at: directoryURL)
            }
        }

        let rootContents = try fileManager.contentsOfDirectory(
            at: assetDirectoryURL,
            includingPropertiesForKeys: nil
        )

        if rootContents.isEmpty {
            try fileManager.removeItem(at: assetDirectoryURL)
        }
    }

    static func renameMarkdownFile(at fileURL: URL, to proposedName: String) throws -> URL {
        let trimmedName = proposedName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else {
            throw NSError(
                domain: "Markdown",
                code: 2,
                userInfo: [NSLocalizedDescriptionKey: "文件名不能为空。"]
            )
        }

        let destinationURL = renamedMarkdownURL(from: fileURL, to: trimmedName)
        guard destinationURL.standardizedFileURL != fileURL.standardizedFileURL else {
            return fileURL
        }

        if FileManager.default.fileExists(atPath: destinationURL.path) {
            throw NSError(
                domain: NSCocoaErrorDomain,
                code: CocoaError.fileWriteFileExists.rawValue,
                userInfo: [NSLocalizedDescriptionKey: "已存在同名文件。"]
            )
        }

        try FileManager.default.moveItem(at: fileURL, to: destinationURL)
        return destinationURL
    }

    static func createMarkdownFile(
        named proposedName: String,
        in directoryURL: URL,
        contents: String = ""
    ) throws -> URL {
        let trimmedName = try validatedWorkspaceItemName(proposedName)
        let destinationURL = normalizedMarkdownURL(
            from: directoryURL.appendingPathComponent(trimmedName, isDirectory: false)
        )
        try ensureWorkspaceItemDoesNotExist(at: destinationURL)
        try contents.write(to: destinationURL, atomically: true, encoding: .utf8)
        return destinationURL
    }

    static func createFolder(named proposedName: String, in directoryURL: URL) throws -> URL {
        let trimmedName = try validatedWorkspaceItemName(proposedName)
        let destinationURL = directoryURL.appendingPathComponent(trimmedName, isDirectory: true)
        try ensureWorkspaceItemDoesNotExist(at: destinationURL)
        try FileManager.default.createDirectory(
            at: destinationURL,
            withIntermediateDirectories: false,
            attributes: nil
        )
        return destinationURL
    }

    static func renameWorkspaceItem(at itemURL: URL, to proposedName: String) throws -> URL {
        let trimmedName = try validatedWorkspaceItemName(proposedName)
        let resourceValues = try itemURL.resourceValues(forKeys: [.isDirectoryKey])
        let isDirectory = resourceValues.isDirectory == true
        let destinationURL: URL

        if isDirectory {
            destinationURL = itemURL
                .deletingLastPathComponent()
                .appendingPathComponent(trimmedName, isDirectory: true)
        } else {
            destinationURL = renamedMarkdownURL(from: itemURL, to: trimmedName)
        }

        guard destinationURL.standardizedFileURL != itemURL.standardizedFileURL else {
            return itemURL
        }

        try ensureWorkspaceItemDoesNotExist(at: destinationURL)
        try FileManager.default.moveItem(at: itemURL, to: destinationURL)
        return destinationURL
    }

    static func deleteWorkspaceItem(at itemURL: URL) throws {
        do {
            try FileManager.default.trashItem(at: itemURL, resultingItemURL: nil)
        } catch let error as NSError
            where error.domain == NSCocoaErrorDomain &&
                error.code == CocoaError.featureUnsupported.rawValue
        {
            try FileManager.default.removeItem(at: itemURL)
        }
    }

    static func normalizedMarkdownURL(from fileURL: URL) -> URL {
        guard fileURL.pathExtension.isEmpty else {
            return fileURL
        }

        return fileURL.appendingPathExtension("md")
    }

    static func normalizedExportURL(from fileURL: URL, contentType: UTType) -> URL {
        guard fileURL.pathExtension.isEmpty else {
            return fileURL
        }

        guard let preferredPathExtension = contentType.preferredFilenameExtension else {
            return fileURL
        }

        return fileURL.appendingPathExtension(preferredPathExtension)
    }

    static func renamedMarkdownURL(from fileURL: URL, to proposedName: String) -> URL {
        let trimmedName = proposedName.trimmingCharacters(in: .whitespacesAndNewlines)
        let pathExtension = fileURL.pathExtension.isEmpty ? "md" : fileURL.pathExtension
        let candidateURL = fileURL.deletingLastPathComponent().appendingPathComponent(trimmedName)
        let candidatePathExtension = candidateURL.pathExtension.lowercased()

        if supportedPathExtensions.contains(candidatePathExtension) {
            return candidateURL
        }

        return candidateURL.appendingPathExtension(pathExtension)
    }

    static func writeHTMLDocument(_ html: String, to fileURL: URL) throws {
        let destinationURL = normalizedExportURL(from: fileURL, contentType: htmlContentType)
        try html.write(to: destinationURL, atomically: true, encoding: .utf8)
    }

    static func writePDF(_ data: Data, to fileURL: URL) throws {
        let destinationURL = normalizedExportURL(from: fileURL, contentType: pdfContentType)
        try data.write(to: destinationURL, options: .atomic)
    }

    static func renderedHTMLDocument(
        title: String,
        bodyHTML: String,
        theme: MarkdownRenderedTheme = .light
    ) -> String {
        let escapedTitle = htmlEscaped(title)
        let palette = exportPalette(for: theme)

        return """
        <!doctype html>
        <html lang="zh-CN">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>\(escapedTitle)</title>
          <style>
            :root {
              color-scheme: \(palette.colorScheme);
            }

            * {
              box-sizing: border-box;
            }

            body {
              margin: 0;
              font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Hiragino Sans GB", sans-serif;
              background: \(palette.backgroundColor);
              color: \(palette.textColor);
            }

            .markdown-body {
              max-width: 840px;
              margin: 0 auto;
              padding: 56px 48px 72px;
              line-height: 1.72;
            }

            .markdown-body h1,
            .markdown-body h2,
            .markdown-body h3,
            .markdown-body h4,
            .markdown-body h5,
            .markdown-body h6 {
              color: \(palette.headingColor);
            }

            .markdown-body img,
            .markdown-body video {
              max-width: 100%;
              height: auto;
            }

            .markdown-body pre {
              overflow-x: auto;
              padding: 16px 18px;
              border-radius: 14px;
              background: \(palette.codeBackgroundColor);
              color: \(palette.codeTextColor);
            }

            .markdown-body code {
              font-family: "SF Mono", "JetBrains Mono", ui-monospace, monospace;
            }

            .markdown-body table {
              width: 100%;
              border-collapse: collapse;
              margin: 20px 0;
            }

            .markdown-body th,
            .markdown-body td {
              padding: 10px 12px;
              border: 1px solid \(palette.tableBorderColor);
              text-align: left;
            }

            .markdown-body th {
              background: \(palette.tableHeaderBackgroundColor);
            }

            .markdown-body blockquote {
              margin: 20px 0;
              padding: 8px 0 8px 18px;
              border-left: 4px solid \(palette.blockquoteBorderColor);
              color: \(palette.blockquoteTextColor);
            }
          </style>
        </head>
        <body>
          <main class="markdown-body">\(bodyHTML)</main>
        </body>
        </html>
        """
    }

    static func markdownFileURLs(in folderURL: URL) throws -> [URL] {
        let resourceKeys: [URLResourceKey] = [.isDirectoryKey, .isRegularFileKey]
        guard let enumerator = FileManager.default.enumerator(
            at: folderURL,
            includingPropertiesForKeys: resourceKeys,
            options: [.skipsHiddenFiles, .skipsPackageDescendants]
        ) else {
            return []
        }

        var results: [URL] = []

        for case let fileURL as URL in enumerator {
            let resourceValues = try fileURL.resourceValues(forKeys: Set(resourceKeys))

            if resourceValues.isDirectory == true {
                continue
            }

            guard resourceValues.isRegularFile == true else {
                continue
            }

            if supportedPathExtensions.contains(fileURL.pathExtension.lowercased()) {
                results.append(fileURL)
            }
        }

        return results.sorted {
            $0.path.localizedStandardCompare($1.path) == .orderedAscending
        }
    }

    private struct ExportPalette {
        let colorScheme: String
        let backgroundColor: String
        let textColor: String
        let headingColor: String
        let codeBackgroundColor: String
        let codeTextColor: String
        let tableBorderColor: String
        let tableHeaderBackgroundColor: String
        let blockquoteBorderColor: String
        let blockquoteTextColor: String
    }

    private static func exportPalette(for theme: MarkdownRenderedTheme) -> ExportPalette {
        switch theme {
        case .light:
            return ExportPalette(
                colorScheme: "light",
                backgroundColor: "#f6f3ed",
                textColor: "#111827",
                headingColor: "#0f172a",
                codeBackgroundColor: "#181a1f",
                codeTextColor: "#f5f7fa",
                tableBorderColor: "#d5d9e0",
                tableHeaderBackgroundColor: "#eceff4",
                blockquoteBorderColor: "#8b9bb4",
                blockquoteTextColor: "#4b5563"
            )
        case .dark:
            return ExportPalette(
                colorScheme: "dark",
                backgroundColor: "#111318",
                textColor: "#e7ebf3",
                headingColor: "#ffffff",
                codeBackgroundColor: "#1b2230",
                codeTextColor: "#f8fbff",
                tableBorderColor: "#394251",
                tableHeaderBackgroundColor: "#1c2432",
                blockquoteBorderColor: "#6c88b8",
                blockquoteTextColor: "#b9c5d8"
            )
        case .sepia:
            return ExportPalette(
                colorScheme: "light",
                backgroundColor: "#f3efe6",
                textColor: "#4a463f",
                headingColor: "#2f2c27",
                codeBackgroundColor: "#ebe6dc",
                codeTextColor: "#454039",
                tableBorderColor: "#cbc5b8",
                tableHeaderBackgroundColor: "#e6e0d5",
                blockquoteBorderColor: "#88906f",
                blockquoteTextColor: "#666055"
            )
        }
    }

    private static func htmlEscaped(_ value: String) -> String {
        value
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
            .replacingOccurrences(of: "\"", with: "&quot;")
            .replacingOccurrences(of: "'", with: "&#39;")
    }

    private static func validatedWorkspaceItemName(_ proposedName: String) throws -> String {
        let trimmedName = proposedName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else {
            throw NSError(
                domain: "Markdown",
                code: 2,
                userInfo: [NSLocalizedDescriptionKey: "名称不能为空。"]
            )
        }

        guard !trimmedName.contains("/") else {
            throw NSError(
                domain: "Markdown",
                code: 3,
                userInfo: [NSLocalizedDescriptionKey: "名称不能包含“/”。"]
            )
        }

        return trimmedName
    }

    private static func ensureWorkspaceItemDoesNotExist(at itemURL: URL) throws {
        guard !FileManager.default.fileExists(atPath: itemURL.path) else {
            throw NSError(
                domain: NSCocoaErrorDomain,
                code: CocoaError.fileWriteFileExists.rawValue,
                userInfo: [NSLocalizedDescriptionKey: "已存在同名项目。"]
            )
        }
    }

    private static func siblingAssetDirectoryURL(for markdownFileURL: URL) -> URL {
        markdownFileURL
            .deletingPathExtension()
            .appendingPathExtension("assets")
    }

    private static func imageAssetDirectoryURL(
        for markdownFileURL: URL,
        preferences: EditorPreferences
    ) -> URL {
        switch preferences.imageFolderMode {
        case .documentAssets:
            return siblingAssetDirectoryURL(for: markdownFileURL)
        case .customRelativePath:
            let trimmed = preferences.imageCustomFolder.trimmingCharacters(in: .whitespacesAndNewlines)
            let folderName = trimmed.isEmpty ? "assets" : trimmed
            return markdownFileURL
                .deletingLastPathComponent()
                .appendingPathComponent(folderName, isDirectory: true)
        }
    }

    private static func relativeImagePath(from baseDirectory: URL, to targetURL: URL) -> String {
        let baseComponents = baseDirectory.standardizedFileURL.pathComponents
        let targetComponents = targetURL.standardizedFileURL.pathComponents
        var sharedCount = 0

        while sharedCount < min(baseComponents.count, targetComponents.count),
              baseComponents[sharedCount] == targetComponents[sharedCount]
        {
            sharedCount += 1
        }

        let parentComponents = Array(repeating: "..", count: max(0, baseComponents.count - sharedCount))
        let childComponents = Array(targetComponents.dropFirst(sharedCount))
        return (parentComponents + childComponents).joined(separator: "/")
    }

    private static func encodeMarkdownPath(_ value: String) -> String {
        value
            .replacingOccurrences(of: " ", with: "%20")
            .replacingOccurrences(of: "#", with: "%23")
    }

    private static func referencedSiblingAssetRelativePaths(
        in markdown: String,
        siblingAssetDirectoryName: String
    ) -> Set<String> {
        markdownImageReferences(in: markdown).reduce(into: Set<String>()) { result, reference in
            let referencedPath = reference.path
            guard referencedPath.hasPrefix("\(siblingAssetDirectoryName)/") else {
                return
            }

            let relativePath = String(referencedPath.dropFirst(siblingAssetDirectoryName.count + 1))
            guard !relativePath.isEmpty else {
                return
            }

            result.insert(relativePath)
        }
    }

    static func relativePath(
        of fileURL: URL,
        relativeToDirectory directoryURL: URL
    ) -> String? {
        let resolvedDirectoryPath = directoryURL
            .resolvingSymlinksInPath()
            .standardizedFileURL
            .path
        let resolvedFilePath = fileURL
            .resolvingSymlinksInPath()
            .standardizedFileURL
            .path
        let directoryPrefix = resolvedDirectoryPath.hasSuffix("/") ? resolvedDirectoryPath : resolvedDirectoryPath + "/"

        guard resolvedFilePath.hasPrefix(directoryPrefix) else {
            return nil
        }

        return String(resolvedFilePath.dropFirst(directoryPrefix.count))
    }

    // Keep the asset cleanup/save pipeline lightweight while handling the Markdown edge cases
    // that regularly appear in notes: fenced code blocks and paths containing parentheses.
    private static func markdownImageReferences(in markdown: String) -> [MarkdownImageReference] {
        let fencedCodeBlockRanges = fencedCodeBlockRanges(in: markdown)
        var fencedRangeIndex = 0
        var references: [MarkdownImageReference] = []
        var index = markdown.startIndex

        while index < markdown.endIndex {
            while fencedRangeIndex < fencedCodeBlockRanges.count,
                  index >= fencedCodeBlockRanges[fencedRangeIndex].upperBound
            {
                fencedRangeIndex += 1
            }

            if fencedRangeIndex < fencedCodeBlockRanges.count,
               index >= fencedCodeBlockRanges[fencedRangeIndex].lowerBound,
               index < fencedCodeBlockRanges[fencedRangeIndex].upperBound
            {
                index = fencedCodeBlockRanges[fencedRangeIndex].upperBound
                continue
            }

            guard markdown[index] == "!" else {
                index = markdown.index(after: index)
                continue
            }

            let nextIndex = markdown.index(after: index)
            guard nextIndex < markdown.endIndex, markdown[nextIndex] == "[" else {
                index = nextIndex
                continue
            }

            if let parsedReference = parseMarkdownImageReference(in: markdown, startingAt: index) {
                references.append(parsedReference.reference)
                index = parsedReference.nextIndex
                continue
            }

            index = nextIndex
        }

        return references
    }

    private static func fencedCodeBlockRanges(in markdown: String) -> [Range<String.Index>] {
        guard !markdown.isEmpty else {
            return []
        }

        var ranges: [Range<String.Index>] = []
        var lineStart = markdown.startIndex
        var activeFence: MarkdownFence?

        while lineStart < markdown.endIndex {
            let lineRange = markdown.lineRange(for: lineStart..<lineStart)
            let line = markdown[lineRange]

            if let currentFence = activeFence {
                if isClosingFenceLine(line, marker: currentFence.marker, minimumLength: currentFence.length) {
                    ranges.append(currentFence.start..<lineRange.upperBound)
                    activeFence = nil
                }
            } else if let openingFence = openingFence(in: line) {
                activeFence = MarkdownFence(
                    marker: openingFence.marker,
                    length: openingFence.length,
                    start: lineRange.lowerBound
                )
            }

            lineStart = lineRange.upperBound
        }

        if let activeFence {
            ranges.append(activeFence.start..<markdown.endIndex)
        }

        return ranges
    }

    private static func openingFence(in line: Substring) -> (marker: Character, length: Int)? {
        guard let prefix = fencePrefix(in: line) else {
            return nil
        }

        return (prefix.marker, prefix.length)
    }

    private static func isClosingFenceLine(
        _ line: Substring,
        marker: Character,
        minimumLength: Int
    ) -> Bool {
        guard let prefix = fencePrefix(in: line),
              prefix.marker == marker,
              prefix.length >= minimumLength
        else {
            return false
        }

        let content = lineWithoutTrailingNewlines(line)
        return content[prefix.remainderStart...].allSatisfy { $0 == " " || $0 == "\t" }
    }

    private static func fencePrefix(
        in line: Substring
    ) -> (marker: Character, length: Int, remainderStart: Substring.Index)? {
        let content = lineWithoutTrailingNewlines(line)
        var index = content.startIndex
        var leadingSpaceCount = 0

        while index < content.endIndex, content[index] == " " {
            leadingSpaceCount += 1
            if leadingSpaceCount > 3 {
                return nil
            }

            index = content.index(after: index)
        }

        guard index < content.endIndex else {
            return nil
        }

        let marker = content[index]
        guard marker == "`" || marker == "~" else {
            return nil
        }

        var length = 0
        while index < content.endIndex, content[index] == marker {
            length += 1
            index = content.index(after: index)
        }

        guard length >= 3 else {
            return nil
        }

        return (marker, length, index)
    }

    private static func lineWithoutTrailingNewlines(_ line: Substring) -> Substring {
        var end = line.endIndex

        while end > line.startIndex {
            let previous = line.index(before: end)
            guard line[previous].isNewline else {
                break
            }

            end = previous
        }

        return line[line.startIndex..<end]
    }

    private static func parseMarkdownImageReference(
        in markdown: String,
        startingAt startIndex: String.Index
    ) -> ParsedMarkdownImageReference? {
        let openingBracketIndex = markdown.index(after: startIndex)
        guard openingBracketIndex < markdown.endIndex, markdown[openingBracketIndex] == "[" else {
            return nil
        }

        guard let closingBracketIndex = closingAltTextBracket(
            in: markdown,
            startingAt: openingBracketIndex
        ) else {
            return nil
        }

        let openingParenthesisIndex = markdown.index(after: closingBracketIndex)
        guard openingParenthesisIndex < markdown.endIndex, markdown[openingParenthesisIndex] == "(" else {
            return nil
        }

        guard let destination = parseMarkdownLinkDestination(
            in: markdown,
            startingAt: markdown.index(after: openingParenthesisIndex)
        ) else {
            return nil
        }

        return ParsedMarkdownImageReference(
            reference: MarkdownImageReference(path: destination.path, range: destination.range),
            nextIndex: destination.nextIndex
        )
    }

    private static func closingAltTextBracket(
        in markdown: String,
        startingAt openingBracketIndex: String.Index
    ) -> String.Index? {
        var index = markdown.index(after: openingBracketIndex)
        var bracketDepth = 1
        var isEscaping = false

        while index < markdown.endIndex {
            let character = markdown[index]

            if isEscaping {
                isEscaping = false
                index = markdown.index(after: index)
                continue
            }

            if character == "\\" {
                isEscaping = true
                index = markdown.index(after: index)
                continue
            }

            if character == "[" {
                bracketDepth += 1
            } else if character == "]" {
                bracketDepth -= 1
                if bracketDepth == 0 {
                    return index
                }
            }

            index = markdown.index(after: index)
        }

        return nil
    }

    private static func parseMarkdownLinkDestination(
        in markdown: String,
        startingAt startIndex: String.Index
    ) -> ParsedMarkdownLinkDestination? {
        let destinationStart = skipMarkdownWhitespace(in: markdown, from: startIndex)
        guard destinationStart < markdown.endIndex else {
            return nil
        }

        if markdown[destinationStart] == "<" {
            return parseAngleBracketLinkDestination(in: markdown, startingAt: destinationStart)
        }

        return parseParenthesizedLinkDestination(in: markdown, startingAt: destinationStart)
    }

    private static func parseAngleBracketLinkDestination(
        in markdown: String,
        startingAt startIndex: String.Index
    ) -> ParsedMarkdownLinkDestination? {
        let pathStart = markdown.index(after: startIndex)
        var index = pathStart
        var isEscaping = false

        while index < markdown.endIndex {
            let character = markdown[index]

            if isEscaping {
                isEscaping = false
                index = markdown.index(after: index)
                continue
            }

            if character == "\\" {
                isEscaping = true
                index = markdown.index(after: index)
                continue
            }

            if character == ">" {
                let pathRange = pathStart..<index
                guard !pathRange.isEmpty else {
                    return nil
                }

                guard let nextIndex = consumeOptionalMarkdownLinkTitleAndClosingParen(
                    in: markdown,
                    startingAt: markdown.index(after: index)
                ) else {
                    return nil
                }

                return ParsedMarkdownLinkDestination(
                    path: String(markdown[pathRange]),
                    range: NSRange(pathRange, in: markdown),
                    nextIndex: nextIndex
                )
            }

            index = markdown.index(after: index)
        }

        return nil
    }

    private static func parseParenthesizedLinkDestination(
        in markdown: String,
        startingAt startIndex: String.Index
    ) -> ParsedMarkdownLinkDestination? {
        let pathStart = startIndex
        var index = startIndex
        var nestedParentheses = 0
        var isEscaping = false

        while index < markdown.endIndex {
            let character = markdown[index]

            if isEscaping {
                isEscaping = false
                index = markdown.index(after: index)
                continue
            }

            if character == "\\" {
                isEscaping = true
                index = markdown.index(after: index)
                continue
            }

            if character == "(" {
                nestedParentheses += 1
                index = markdown.index(after: index)
                continue
            }

            if character == ")" {
                if nestedParentheses == 0 {
                    let pathEnd = trimTrailingMarkdownWhitespace(
                        in: markdown,
                        from: pathStart,
                        to: index
                    )
                    guard pathEnd > pathStart else {
                        return nil
                    }

                    let pathRange = pathStart..<pathEnd
                    return ParsedMarkdownLinkDestination(
                        path: String(markdown[pathRange]),
                        range: NSRange(pathRange, in: markdown),
                        nextIndex: markdown.index(after: index)
                    )
                }

                nestedParentheses -= 1
                index = markdown.index(after: index)
                continue
            }

            if nestedParentheses == 0, character.isWhitespace {
                let pathEnd = trimTrailingMarkdownWhitespace(
                    in: markdown,
                    from: pathStart,
                    to: index
                )
                guard pathEnd > pathStart else {
                    return nil
                }

                guard let nextIndex = consumeOptionalMarkdownLinkTitleAndClosingParen(
                    in: markdown,
                    startingAt: index
                ) else {
                    return nil
                }

                let pathRange = pathStart..<pathEnd
                return ParsedMarkdownLinkDestination(
                    path: String(markdown[pathRange]),
                    range: NSRange(pathRange, in: markdown),
                    nextIndex: nextIndex
                )
            }

            index = markdown.index(after: index)
        }

        return nil
    }

    private static func consumeOptionalMarkdownLinkTitleAndClosingParen(
        in markdown: String,
        startingAt startIndex: String.Index
    ) -> String.Index? {
        var index = skipMarkdownWhitespace(in: markdown, from: startIndex)
        guard index < markdown.endIndex else {
            return nil
        }

        if markdown[index] == ")" {
            return markdown.index(after: index)
        }

        let delimiter = markdown[index]
        guard delimiter == "\"" || delimiter == "'" else {
            return nil
        }

        index = markdown.index(after: index)
        var isEscaping = false

        while index < markdown.endIndex {
            let character = markdown[index]

            if isEscaping {
                isEscaping = false
                index = markdown.index(after: index)
                continue
            }

            if character == "\\" {
                isEscaping = true
                index = markdown.index(after: index)
                continue
            }

            if character == delimiter {
                index = markdown.index(after: index)
                index = skipMarkdownWhitespace(in: markdown, from: index)
                guard index < markdown.endIndex, markdown[index] == ")" else {
                    return nil
                }

                return markdown.index(after: index)
            }

            index = markdown.index(after: index)
        }

        return nil
    }

    private static func skipMarkdownWhitespace(
        in markdown: String,
        from startIndex: String.Index
    ) -> String.Index {
        var index = startIndex

        while index < markdown.endIndex, markdown[index].isWhitespace {
            index = markdown.index(after: index)
        }

        return index
    }

    private static func trimTrailingMarkdownWhitespace(
        in markdown: String,
        from startIndex: String.Index,
        to endIndex: String.Index
    ) -> String.Index {
        var trimmedEnd = endIndex

        while trimmedEnd > startIndex {
            let previous = markdown.index(before: trimmedEnd)
            guard markdown[previous].isWhitespace else {
                break
            }

            trimmedEnd = previous
        }

        return trimmedEnd
    }

    private static func imagePathExtension(originalFilename: String, mimeType: String) -> String {
        let filenameExtension = URL(fileURLWithPath: originalFilename).pathExtension.lowercased()
        if !filenameExtension.isEmpty {
            return filenameExtension == "jpeg" ? "jpg" : filenameExtension
        }

        if let type = UTType(mimeType: mimeType),
           let preferredExtension = type.preferredFilenameExtension?.lowercased()
        {
            return preferredExtension == "jpeg" ? "jpg" : preferredExtension
        }

        return "png"
    }

    private static func sanitizedAssetBaseName(from originalFilename: String) -> String {
        let rawBaseName = URL(fileURLWithPath: originalFilename).deletingPathExtension().lastPathComponent
        let trimmedBaseName = rawBaseName.trimmingCharacters(in: .whitespacesAndNewlines)
        let sanitizedBaseName = trimmedBaseName
            .replacingOccurrences(of: "/", with: "-")
            .replacingOccurrences(of: ":", with: "-")

        if sanitizedBaseName.isEmpty {
            return "image"
        }

        return sanitizedBaseName
    }

    private static func uniqueAssetURL(
        in directoryURL: URL,
        baseName: String,
        pathExtension: String
    ) -> URL {
        let fileManager = FileManager.default
        var suffix = 1
        var candidateURL = directoryURL.appendingPathComponent(baseName).appendingPathExtension(pathExtension)

        while fileManager.fileExists(atPath: candidateURL.path) {
            suffix += 1
            candidateURL = directoryURL
                .appendingPathComponent("\(baseName)-\(suffix)")
                .appendingPathExtension(pathExtension)
        }

        return candidateURL
    }
}
