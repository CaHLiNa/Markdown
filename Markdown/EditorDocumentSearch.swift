//
//  EditorDocumentSearch.swift
//  Markdown
//
//  Created by Codex on 2026/3/8.
//

import Foundation

struct EditorDocumentSearchMatch: Identifiable, Equatable {
    let offset: Int
    let length: Int
    let lineNumber: Int
    let columnNumber: Int
    let lineText: String
    let matchedText: String

    var id: String {
        "\(offset)#\(length)"
    }
}

struct EditorDocumentSearchResult: Equatable {
    let matches: [EditorDocumentSearchMatch]
    let errorDescription: String?
}

struct EditorDocumentReplaceResult: Equatable {
    let updatedText: String
    let replacedCount: Int
    let nextMatchIndex: Int?
    let errorDescription: String?
}

enum EditorDocumentSearch {
    static func search(
        query: String,
        in text: String,
        isCaseSensitive: Bool,
        useRegularExpression: Bool
    ) -> EditorDocumentSearchResult {
        let compilation = compile(
            query: query,
            in: text,
            isCaseSensitive: isCaseSensitive,
            useRegularExpression: useRegularExpression
        )

        return EditorDocumentSearchResult(
            matches: compilation.occurrences.map(\.match),
            errorDescription: compilation.errorDescription
        )
    }

    static func replaceCurrentMatch(
        query: String,
        replacement: String,
        in text: String,
        currentMatchIndex: Int,
        isCaseSensitive: Bool,
        useRegularExpression: Bool
    ) -> EditorDocumentReplaceResult {
        let compilation = compile(
            query: query,
            in: text,
            isCaseSensitive: isCaseSensitive,
            useRegularExpression: useRegularExpression
        )

        guard compilation.errorDescription == nil else {
            return EditorDocumentReplaceResult(
                updatedText: text,
                replacedCount: 0,
                nextMatchIndex: nil,
                errorDescription: compilation.errorDescription
            )
        }

        guard compilation.occurrences.indices.contains(currentMatchIndex) else {
            return EditorDocumentReplaceResult(
                updatedText: text,
                replacedCount: 0,
                nextMatchIndex: nil,
                errorDescription: nil
            )
        }

        let occurrence = compilation.occurrences[currentMatchIndex]
        let resolvedReplacement = compilation.replacementText(
            for: occurrence,
            originalText: text,
            replacementTemplate: replacement
        )

        var updatedText = text
        updatedText.replaceSubrange(occurrence.stringRange, with: resolvedReplacement)

        let nextOffset = occurrence.match.offset + resolvedReplacement.count
        let refreshedResult = search(
            query: query,
            in: updatedText,
            isCaseSensitive: isCaseSensitive,
            useRegularExpression: useRegularExpression
        )
        let nextIndex = resolveNextMatchIndex(
            matches: refreshedResult.matches,
            preferredOffset: nextOffset
        )

        return EditorDocumentReplaceResult(
            updatedText: updatedText,
            replacedCount: 1,
            nextMatchIndex: nextIndex,
            errorDescription: refreshedResult.errorDescription
        )
    }

    static func replaceAllMatches(
        query: String,
        replacement: String,
        in text: String,
        isCaseSensitive: Bool,
        useRegularExpression: Bool
    ) -> EditorDocumentReplaceResult {
        let compilation = compile(
            query: query,
            in: text,
            isCaseSensitive: isCaseSensitive,
            useRegularExpression: useRegularExpression
        )

        guard compilation.errorDescription == nil else {
            return EditorDocumentReplaceResult(
                updatedText: text,
                replacedCount: 0,
                nextMatchIndex: nil,
                errorDescription: compilation.errorDescription
            )
        }

        guard !compilation.occurrences.isEmpty else {
            return EditorDocumentReplaceResult(
                updatedText: text,
                replacedCount: 0,
                nextMatchIndex: nil,
                errorDescription: nil
            )
        }

        let updatedText: String
        if useRegularExpression, let regex = compilation.regex {
            let fullRange = NSRange(text.startIndex..., in: text)
            updatedText = regex.stringByReplacingMatches(
                in: text,
                options: [],
                range: fullRange,
                withTemplate: replacement
            )
        } else {
            updatedText = compilation.occurrences.reversed().reduce(into: text) { partial, occurrence in
                partial.replaceSubrange(occurrence.stringRange, with: replacement)
            }
        }

        let refreshedResult = search(
            query: query,
            in: updatedText,
            isCaseSensitive: isCaseSensitive,
            useRegularExpression: useRegularExpression
        )

        return EditorDocumentReplaceResult(
            updatedText: updatedText,
            replacedCount: compilation.occurrences.count,
            nextMatchIndex: refreshedResult.matches.isEmpty ? nil : 0,
            errorDescription: refreshedResult.errorDescription
        )
    }

    private static func resolveNextMatchIndex(
        matches: [EditorDocumentSearchMatch],
        preferredOffset: Int
    ) -> Int? {
        guard !matches.isEmpty else {
            return nil
        }

        if let exactIndex = matches.firstIndex(where: { $0.offset >= preferredOffset }) {
            return exactIndex
        }

        return matches.indices.last
    }

    private static func compile(
        query: String,
        in text: String,
        isCaseSensitive: Bool,
        useRegularExpression: Bool
    ) -> SearchCompilation {
        let trimmedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedQuery.isEmpty else {
            return SearchCompilation(regex: nil, occurrences: [], errorDescription: nil)
        }

        let pattern = useRegularExpression
            ? trimmedQuery
            : NSRegularExpression.escapedPattern(for: trimmedQuery)
        let options: NSRegularExpression.Options = isCaseSensitive ? [] : [.caseInsensitive]

        let regex: NSRegularExpression
        do {
            regex = try NSRegularExpression(pattern: pattern, options: options)
        } catch {
            return SearchCompilation(
                regex: nil,
                occurrences: [],
                errorDescription: "正则表达式无效。"
            )
        }

        let fullRange = NSRange(text.startIndex..., in: text)
        let rawMatches = regex.matches(in: text, options: [], range: fullRange).filter { $0.range.length > 0 }
        let occurrences = rawMatches.compactMap { makeOccurrence(for: $0, in: text) }

        return SearchCompilation(
            regex: regex,
            occurrences: occurrences,
            errorDescription: nil
        )
    }

    private static func makeOccurrence(
        for checkingResult: NSTextCheckingResult,
        in text: String
    ) -> SearchOccurrence? {
        guard let matchRange = Range(checkingResult.range, in: text) else {
            return nil
        }

        let lineStart = text[text.startIndex..<matchRange.lowerBound].lastIndex(of: "\n").map {
            text.index(after: $0)
        } ?? text.startIndex
        let lineEnd = text[matchRange.lowerBound..<text.endIndex].firstIndex(of: "\n") ?? text.endIndex
        let prefix = text[text.startIndex..<matchRange.lowerBound]
        let lineNumber = prefix.reduce(into: 1) { count, character in
            if character == "\n" {
                count += 1
            }
        }

        return SearchOccurrence(
            match: EditorDocumentSearchMatch(
                offset: text.distance(from: text.startIndex, to: matchRange.lowerBound),
                length: text.distance(from: matchRange.lowerBound, to: matchRange.upperBound),
                lineNumber: lineNumber,
                columnNumber: text.distance(from: lineStart, to: matchRange.lowerBound) + 1,
                lineText: String(text[lineStart..<lineEnd]),
                matchedText: String(text[matchRange])
            ),
            stringRange: matchRange,
            checkingResult: checkingResult
        )
    }
}

private struct SearchOccurrence {
    let match: EditorDocumentSearchMatch
    let stringRange: Range<String.Index>
    let checkingResult: NSTextCheckingResult
}

private struct SearchCompilation {
    let regex: NSRegularExpression?
    let occurrences: [SearchOccurrence]
    let errorDescription: String?

    func replacementText(
        for occurrence: SearchOccurrence,
        originalText: String,
        replacementTemplate: String
    ) -> String {
        guard let regex else {
            return replacementTemplate
        }

        return regex.replacementString(
            for: occurrence.checkingResult,
            in: originalText,
            offset: 0,
            template: replacementTemplate
        )
    }
}
