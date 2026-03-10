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

struct EditorWorkspaceSearchResponse: Equatable {
    let results: [EditorWorkspaceSearchResult]
    let errorDescription: String?
}

enum EditorWorkspaceSearch {
    static func search(
        query: String,
        in files: [EditorWorkspaceSearchFile],
        isCaseSensitive: Bool,
        useRegularExpression: Bool
    ) -> EditorWorkspaceSearchResponse {
        let trimmedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedQuery.isEmpty else {
            return EditorWorkspaceSearchResponse(results: [], errorDescription: nil)
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
    ) -> EditorWorkspaceSearchResponse {
        var results: [EditorWorkspaceSearchResult] = []

        for file in files {
            for line in indexedLines(in: file.content) {
                let nsLineText = line.text as NSString
                let options: NSString.CompareOptions = isCaseSensitive ? [] : [.caseInsensitive]
                var searchRange = NSRange(location: 0, length: nsLineText.length)

                while searchRange.location < nsLineText.length {
                    let matchRange = nsLineText.range(
                        of: query,
                        options: options,
                        range: searchRange
                    )

                    guard matchRange.location != NSNotFound, matchRange.length > 0 else {
                        break
                    }

                    guard let stringRange = Range(matchRange, in: line.text) else {
                        break
                    }

                    let columnNumber = line.text.distance(from: line.text.startIndex, to: stringRange.lowerBound) + 1

                    results.append(
                        EditorWorkspaceSearchResult(
                            relativePath: file.relativePath,
                            lineNumber: line.number,
                            columnNumber: columnNumber,
                            lineText: line.text,
                            matchedText: nsLineText.substring(with: matchRange),
                            matchOffset: line.range.location + matchRange.location,
                            matchLength: matchRange.length,
                            url: file.url
                        )
                    )

                    let nextLocation = matchRange.location + max(matchRange.length, 1)
                    searchRange = NSRange(
                        location: nextLocation,
                        length: nsLineText.length - nextLocation
                    )
                }
            }
        }

        return EditorWorkspaceSearchResponse(results: results, errorDescription: nil)
    }

    private static func regexResults(
        query: String,
        files: [EditorWorkspaceSearchFile],
        isCaseSensitive: Bool
    ) -> EditorWorkspaceSearchResponse {
        let options: NSRegularExpression.Options = isCaseSensitive ? [] : [.caseInsensitive]
        let regex: NSRegularExpression

        do {
            regex = try NSRegularExpression(pattern: query, options: options)
        } catch {
            return EditorWorkspaceSearchResponse(results: [], errorDescription: "正则表达式无效。")
        }

        var results: [EditorWorkspaceSearchResult] = []

        for file in files {
            for line in indexedLines(in: file.content) {
                let nsLineText = line.text as NSString
                let range = NSRange(location: 0, length: nsLineText.length)

                for match in regex.matches(in: line.text, options: [], range: range) where match.range.length > 0 {
                    guard let stringRange = Range(match.range, in: line.text) else {
                        continue
                    }

                    let columnNumber = line.text.distance(from: line.text.startIndex, to: stringRange.lowerBound) + 1
                    let matchedText = nsLineText.substring(with: match.range)
                    results.append(
                        EditorWorkspaceSearchResult(
                            relativePath: file.relativePath,
                            lineNumber: line.number,
                            columnNumber: columnNumber,
                            lineText: line.text,
                            matchedText: matchedText,
                            matchOffset: line.range.location + match.range.location,
                            matchLength: match.range.length,
                            url: file.url
                        )
                    )
                }
            }
        }

        return EditorWorkspaceSearchResponse(results: results, errorDescription: nil)
    }

    private struct IndexedLine {
        let number: Int
        let text: String
        let range: NSRange
    }

    private static func indexedLines(in content: String) -> [IndexedLine] {
        let nsContent = content as NSString
        var lines: [IndexedLine] = []
        var lineNumber = 1

        nsContent.enumerateSubstrings(
            in: NSRange(location: 0, length: nsContent.length),
            options: [.byLines]
        ) { substring, substringRange, _, _ in
            lines.append(
                IndexedLine(
                    number: lineNumber,
                    text: substring ?? "",
                    range: substringRange
                )
            )
            lineNumber += 1
        }

        return lines
    }
}
