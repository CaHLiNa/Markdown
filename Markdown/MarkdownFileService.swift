//
//  MarkdownFileService.swift
//  Markdown
//
//  Created by Codex on 2026/3/7.
//

import Foundation
import UniformTypeIdentifiers

enum MarkdownFileService {
    static let markdownContentType = UTType(filenameExtension: "md") ?? .plainText
    static let htmlContentType = UTType.html
    static let pdfContentType = UTType.pdf
    static let supportedPathExtensions = ["md", "markdown", "mdown", "mkd"]

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
        alongsideMarkdownFile markdownFileURL: URL
    ) throws -> String {
        let assetDirectoryURL = markdownFileURL
            .deletingPathExtension()
            .appendingPathExtension("assets", conformingTo: .folder)

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

        return "\(assetDirectoryURL.lastPathComponent)/\(destinationURL.lastPathComponent)"
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

    static func renderedHTMLDocument(title: String, bodyHTML: String) -> String {
        let escapedTitle = htmlEscaped(title)

        return """
        <!doctype html>
        <html lang="zh-CN">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>\(escapedTitle)</title>
          <style>
            :root {
              color-scheme: light;
            }

            * {
              box-sizing: border-box;
            }

            body {
              margin: 0;
              font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Hiragino Sans GB", sans-serif;
              background: #f6f3ed;
              color: #111827;
            }

            .markdown-body {
              max-width: 840px;
              margin: 0 auto;
              padding: 56px 48px 72px;
              line-height: 1.72;
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
              background: #181a1f;
              color: #f5f7fa;
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
              border: 1px solid #d5d9e0;
              text-align: left;
            }

            .markdown-body blockquote {
              margin: 20px 0;
              padding: 8px 0 8px 18px;
              border-left: 4px solid #8b9bb4;
              color: #4b5563;
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

    private static func htmlEscaped(_ value: String) -> String {
        value
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
            .replacingOccurrences(of: "\"", with: "&quot;")
            .replacingOccurrences(of: "'", with: "&#39;")
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
