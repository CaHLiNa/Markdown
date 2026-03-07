//
//  EditorWorkspaceSearch.swift
//  Markdown
//
//  Created by Codex on 2026/3/8.
//

import Foundation

struct EditorWorkspaceSearchFile: Equatable {
    let url: URL
    let relativePath: String
    let content: String
}

struct EditorWorkspaceSearchResult: Identifiable, Equatable {
    let relativePath: String
    let lineNumber: Int
    let lineText: String
    let matchedText: String
    let url: URL

    var id: String {
        "\(relativePath)#\(lineNumber)#\(matchedText)"
    }
}

enum EditorWorkspaceSearch {
    static func search(
        query: String,
        in files: [EditorWorkspaceSearchFile],
        isCaseSensitive: Bool,
        useRegularExpression: Bool
    ) -> [EditorWorkspaceSearchResult] {
        let trimmedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedQuery.isEmpty else {
            return []
        }

        if useRegularExpression {
            return regexResults(
                query: trimmedQuery,
                files: files,
                isCaseSensitive: isCaseSensitive
            )
        }

        return plainTextResults(
            query: trimmedQuery,
            files: files,
            isCaseSensitive: isCaseSensitive
        )
    }

    private static func plainTextResults(
        query: String,
        files: [EditorWorkspaceSearchFile],
        isCaseSensitive: Bool
    ) -> [EditorWorkspaceSearchResult] {
        var results: [EditorWorkspaceSearchResult] = []

        for file in files {
            for (lineIndex, lineText) in file.content.components(separatedBy: .newlines).enumerated() {
                let haystack = isCaseSensitive ? lineText : lineText.lowercased()
                let needle = isCaseSensitive ? query : query.lowercased()

                guard haystack.contains(needle) else {
                    continue
                }

                results.append(
                    EditorWorkspaceSearchResult(
                        relativePath: file.relativePath,
                        lineNumber: lineIndex + 1,
                        lineText: lineText,
                        matchedText: query,
                        url: file.url
                    )
                )
            }
        }

        return results
    }

    private static func regexResults(
        query: String,
        files: [EditorWorkspaceSearchFile],
        isCaseSensitive: Bool
    ) -> [EditorWorkspaceSearchResult] {
        let options: NSRegularExpression.Options = isCaseSensitive ? [] : [.caseInsensitive]
        guard let regex = try? NSRegularExpression(pattern: query, options: options) else {
            return []
        }

        var results: [EditorWorkspaceSearchResult] = []

        for file in files {
            for (lineIndex, lineText) in file.content.components(separatedBy: .newlines).enumerated() {
                let nsLineText = lineText as NSString
                let range = NSRange(location: 0, length: nsLineText.length)

                guard let match = regex.firstMatch(in: lineText, options: [], range: range) else {
                    continue
                }

                let matchedText = nsLineText.substring(with: match.range)
                results.append(
                    EditorWorkspaceSearchResult(
                        relativePath: file.relativePath,
                        lineNumber: lineIndex + 1,
                        lineText: lineText,
                        matchedText: matchedText,
                        url: file.url
                    )
                )
            }
        }

        return results
    }
}
