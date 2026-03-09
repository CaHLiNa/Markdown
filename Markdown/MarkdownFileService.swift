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
    private static let markdownImageReferenceRegex = try! NSRegularExpression(
        pattern: #"!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)"#
    )

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
        let markdownNSString = markdown as NSString
        let matches = markdownImageReferenceRegex.matches(
            in: markdown,
            range: NSRange(location: 0, length: markdownNSString.length)
        )
        var relocatedMarkdown = markdown
        var copiedRelativePaths = Set<String>()

        for match in matches.reversed() {
            guard match.numberOfRanges > 1,
                  let referencedPathRange = Range(match.range(at: 1), in: relocatedMarkdown)
            else {
                continue
            }

            let referencedPath = String(relocatedMarkdown[referencedPathRange])

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

        if candidateURL.pathExtension.isEmpty {
            return candidateURL.appendingPathExtension(pathExtension)
        }

        return candidateURL
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
        let markdownNSString = markdown as NSString
        let matches = markdownImageReferenceRegex.matches(
            in: markdown,
            range: NSRange(location: 0, length: markdownNSString.length)
        )

        return matches.reduce(into: Set<String>()) { result, match in
            guard match.numberOfRanges > 1,
                  let referencedPathRange = Range(match.range(at: 1), in: markdown)
            else {
                return
            }

            let referencedPath = String(markdown[referencedPathRange])
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

    private static func relativePath(
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
        let directoryPrefix = resolvedDirectoryPath + "/"

        guard resolvedFilePath.hasPrefix(directoryPrefix) else {
            return nil
        }

        return String(resolvedFilePath.dropFirst(directoryPrefix.count))
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
