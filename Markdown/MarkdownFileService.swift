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
}
