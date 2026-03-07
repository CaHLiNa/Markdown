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
    let columnNumber: Int
    let lineText: String
    let matchedText: String
    let matchOffset: Int
    let matchLength: Int
    let url: URL

    var id: String {
        "\(relativePath)#\(lineNumber)#\(matchOffset)"
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
            let lines = file.content.components(separatedBy: .newlines)
            var lineStartOffset = 0

            for (lineIndex, lineText) in lines.enumerated() {
                let options: String.CompareOptions = isCaseSensitive ? [] : [.caseInsensitive]
                guard let matchRange = lineText.range(of: query, options: options) else {
                    lineStartOffset += lineText.count + 1
                    continue
                }

                let columnNumber = lineText.distance(from: lineText.startIndex, to: matchRange.lowerBound) + 1
                let matchLength = lineText.distance(from: matchRange.lowerBound, to: matchRange.upperBound)

                results.append(
                    EditorWorkspaceSearchResult(
                        relativePath: file.relativePath,
                        lineNumber: lineIndex + 1,
                        columnNumber: columnNumber,
                        lineText: lineText,
                        matchedText: String(lineText[matchRange]),
                        matchOffset: lineStartOffset + columnNumber - 1,
                        matchLength: matchLength,
                        url: file.url
                    )
                )

                lineStartOffset += lineText.count + 1
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
            let lines = file.content.components(separatedBy: .newlines)
            var lineStartOffset = 0

            for (lineIndex, lineText) in lines.enumerated() {
                let nsLineText = lineText as NSString
                let range = NSRange(location: 0, length: nsLineText.length)

                guard let match = regex.firstMatch(in: lineText, options: [], range: range) else {
                    lineStartOffset += lineText.count + 1
                    continue
                }

                guard let matchRange = Range(match.range, in: lineText) else {
                    lineStartOffset += lineText.count + 1
                    continue
                }

                let columnNumber = lineText.distance(from: lineText.startIndex, to: matchRange.lowerBound) + 1
                let matchedText = nsLineText.substring(with: match.range)
                results.append(
                    EditorWorkspaceSearchResult(
                        relativePath: file.relativePath,
                        lineNumber: lineIndex + 1,
                        columnNumber: columnNumber,
                        lineText: lineText,
                        matchedText: matchedText,
                        matchOffset: lineStartOffset + columnNumber - 1,
                        matchLength: matchedText.count,
                        url: file.url
                    )
                )

                lineStartOffset += lineText.count + 1
            }
        }

        return results
    }
}
