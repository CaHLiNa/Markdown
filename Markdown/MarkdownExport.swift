//
//  MarkdownExport.swift
//  Markdown
//
//  Created by Codex on 2026/3/11.
//

import Foundation
import UniformTypeIdentifiers

struct PDFExportOptions: Codable, Equatable {
    var paperSize: EditorPDFPaperSize
    var margin: Double
    var printBackground: Bool

    static let defaultValue = PDFExportOptions(
        paperSize: .a4,
        margin: 24,
        printBackground: true
    )

    var normalized: PDFExportOptions {
        PDFExportOptions(
            paperSize: paperSize,
            margin: min(max(margin, 8), 96),
            printBackground: printBackground
        )
    }
}

struct ExportPreset: Codable, Equatable, Identifiable {
    let id: UUID
    var key: String
    var name: String
    var format: EditorExportFormat
    var theme: MarkdownExportTheme
    var suggestedFileStem: String
    var pdfOptions: PDFExportOptions?

    init(
        id: UUID = UUID(),
        key: String,
        name: String,
        format: EditorExportFormat,
        theme: MarkdownExportTheme = .matchAppearance,
        suggestedFileStem: String = "",
        pdfOptions: PDFExportOptions? = nil
    ) {
        self.id = id
        self.key = key
        self.name = name
        self.format = format
        self.theme = theme
        self.suggestedFileStem = suggestedFileStem
        self.pdfOptions = format == .pdf ? (pdfOptions ?? .defaultValue) : nil
    }

    var normalized: ExportPreset {
        ExportPreset(
            id: id,
            key: MarkdownExportService.sanitizedPresetKey(key, fallback: format.defaultPresetKeyBase),
            name: name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                ? format.defaultPresetName
                : name.trimmingCharacters(in: .whitespacesAndNewlines),
            format: format,
            theme: theme,
            suggestedFileStem: suggestedFileStem.trimmingCharacters(in: .whitespacesAndNewlines),
            pdfOptions: format == .pdf ? (pdfOptions ?? .defaultValue).normalized : nil
        )
    }

    var effectivePDFOptions: PDFExportOptions {
        (pdfOptions ?? .defaultValue).normalized
    }

    static func builtInDefaults(
        theme: MarkdownExportTheme = .matchAppearance,
        pdfOptions: PDFExportOptions = .defaultValue
    ) -> [ExportPreset] {
        [
            ExportPreset(
                key: "html-default",
                name: "HTML 默认",
                format: .html,
                theme: theme,
                suggestedFileStem: ""
            ),
            ExportPreset(
                key: "pdf-default",
                name: "PDF 默认",
                format: .pdf,
                theme: theme,
                suggestedFileStem: "",
                pdfOptions: pdfOptions.normalized
            )
        ]
    }
}

struct ExportSettings: Codable, Equatable {
    var defaultFormat: EditorExportFormat
    var destinationMode: EditorExportDestinationMode
    var openExportedFile: Bool
    var revealExportedFileInFinder: Bool
    var allowYAMLOverrides: Bool
    var activeHTMLPresetID: UUID?
    var activePDFPresetID: UUID?

    init(
        defaultFormat: EditorExportFormat = .html,
        destinationMode: EditorExportDestinationMode = .sameAsDocument,
        openExportedFile: Bool = true,
        revealExportedFileInFinder: Bool = false,
        allowYAMLOverrides: Bool = true,
        activeHTMLPresetID: UUID? = nil,
        activePDFPresetID: UUID? = nil
    ) {
        self.defaultFormat = defaultFormat
        self.destinationMode = destinationMode
        self.openExportedFile = openExportedFile
        self.revealExportedFileInFinder = revealExportedFileInFinder
        self.allowYAMLOverrides = allowYAMLOverrides
        self.activeHTMLPresetID = activeHTMLPresetID
        self.activePDFPresetID = activePDFPresetID
    }

    func activePresetID(for format: EditorExportFormat) -> UUID? {
        switch format {
        case .html:
            return activeHTMLPresetID
        case .pdf:
            return activePDFPresetID
        }
    }

    func settingActivePresetID(_ presetID: UUID?, for format: EditorExportFormat) -> ExportSettings {
        var copy = self

        switch format {
        case .html:
            copy.activeHTMLPresetID = presetID
        case .pdf:
            copy.activePDFPresetID = presetID
        }

        return copy
    }

    func normalized(using presets: [ExportPreset]) -> ExportSettings {
        let htmlPresets = presets.filter { $0.format == .html }
        let pdfPresets = presets.filter { $0.format == .pdf }
        let resolvedDefaultFormat: EditorExportFormat

        switch defaultFormat {
        case .html where htmlPresets.isEmpty:
            resolvedDefaultFormat = pdfPresets.isEmpty ? .html : .pdf
        case .pdf where pdfPresets.isEmpty:
            resolvedDefaultFormat = htmlPresets.isEmpty ? .pdf : .html
        default:
            resolvedDefaultFormat = defaultFormat
        }

        return ExportSettings(
            defaultFormat: resolvedDefaultFormat,
            destinationMode: destinationMode,
            openExportedFile: openExportedFile,
            revealExportedFileInFinder: revealExportedFileInFinder,
            allowYAMLOverrides: allowYAMLOverrides,
            activeHTMLPresetID: htmlPresets.contains(where: { $0.id == activeHTMLPresetID })
                ? activeHTMLPresetID
                : htmlPresets.first?.id,
            activePDFPresetID: pdfPresets.contains(where: { $0.id == activePDFPresetID })
                ? activePDFPresetID
                : pdfPresets.first?.id
        )
    }
}

struct DocumentPDFExportOverride: Equatable {
    var paperSize: EditorPDFPaperSize?
    var margin: Double?
    var printBackground: Bool?
}

struct DocumentExportOverride: Equatable {
    var presetKey: String?
    var fileName: String?
    var theme: MarkdownExportTheme?
    var pdf: DocumentPDFExportOverride

    init(
        presetKey: String? = nil,
        fileName: String? = nil,
        theme: MarkdownExportTheme? = nil,
        pdf: DocumentPDFExportOverride = .init()
    ) {
        self.presetKey = presetKey
        self.fileName = fileName
        self.theme = theme
        self.pdf = pdf
    }
}

struct ResolvedExportRequest: Equatable {
    let format: EditorExportFormat
    let preset: ExportPreset
    let resolvedTheme: MarkdownRenderedTheme
    let suggestedFileStem: String
    let pdfOptions: PDFExportOptions?

    var suggestedFilename: String {
        "\(suggestedFileStem).\(format.fileExtension)"
    }
}

enum MarkdownExportError: LocalizedError, Equatable {
    case missingPreset(format: EditorExportFormat)
    case presetNotFound(String)
    case presetFormatMismatch(expected: EditorExportFormat, actual: EditorExportFormat)
    case invalidOverrideValue(field: String, value: String)
    case invalidOverrideStructure(field: String)
    case unresolvedLocalResource(String)
    case renderFailed(String)

    var errorDescription: String? {
        switch self {
        case .missingPreset(let format):
            return "未找到可用的 \(format.rawValue) 导出预设。"
        case .presetNotFound(let key):
            return "文档引用的导出预设“\(key)”不存在。"
        case .presetFormatMismatch(let expected, let actual):
            return "文档引用的导出预设格式为 \(actual.rawValue)，与当前导出格式 \(expected.rawValue) 不匹配。"
        case .invalidOverrideValue(let field, let value):
            return "Front Matter 中 export.\(field) 的值“\(value)”无效。"
        case .invalidOverrideStructure(let field):
            return "Front Matter 中 export.\(field) 的结构无效。"
        case .unresolvedLocalResource(let resource):
            return "无法解析本地资源：\(resource)"
        case .renderFailed(let message):
            return message
        }
    }
}

enum MarkdownExportService {
    static func normalizedPresets(_ presets: [ExportPreset]) -> [ExportPreset] {
        let fallbackPresets = presets.isEmpty ? ExportPreset.builtInDefaults() : presets
        var seenKeys = Set<String>()
        var normalized: [ExportPreset] = []

        for preset in fallbackPresets {
            let uniqueKey = uniquePresetKey(
                base: sanitizedPresetKey(preset.key, fallback: preset.format.defaultPresetKeyBase),
                existingKeys: seenKeys
            )

            let normalizedPreset = ExportPreset(
                id: preset.id,
                key: uniqueKey,
                name: preset.name,
                format: preset.format,
                theme: preset.theme,
                suggestedFileStem: preset.suggestedFileStem,
                pdfOptions: preset.pdfOptions
            ).normalized

            seenKeys.insert(uniqueKey)
            normalized.append(normalizedPreset)
        }

        if normalized.contains(where: { $0.format == .html }) &&
            normalized.contains(where: { $0.format == .pdf })
        {
            return normalized
        }

        let template = ExportPreset.builtInDefaults()
        for preset in template where !normalized.contains(where: { $0.format == preset.format }) {
            let uniqueKey = uniquePresetKey(base: preset.key, existingKeys: seenKeys)
            seenKeys.insert(uniqueKey)
            normalized.append(
                ExportPreset(
                    key: uniqueKey,
                    name: preset.name,
                    format: preset.format,
                    theme: preset.theme,
                    suggestedFileStem: preset.suggestedFileStem,
                    pdfOptions: preset.pdfOptions
                )
            )
        }

        return normalized
    }

    static func sanitizedPresetKey(_ rawValue: String, fallback: String) -> String {
        let cleaned = rawValue
            .lowercased()
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "_", with: "-")
            .replacingOccurrences(of: " ", with: "-")
        let allowed = cleaned.unicodeScalars.map { scalar -> Character in
            if CharacterSet.alphanumerics.contains(scalar) || scalar == "-" {
                return Character(scalar)
            }
            return "-"
        }
        let collapsed = String(allowed)
            .replacingOccurrences(of: "-{2,}", with: "-", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "-"))

        return collapsed.isEmpty ? fallback : collapsed
    }

    static func uniquePresetKey(
        base: String,
        existingKeys: Set<String>,
        excluding excludedKey: String? = nil
    ) -> String {
        let normalizedBase = sanitizedPresetKey(base, fallback: "preset")
        var candidate = normalizedBase
        var suffix = 2

        while existingKeys.contains(candidate) && candidate != excludedKey {
            candidate = "\(normalizedBase)-\(suffix)"
            suffix += 1
        }

        return candidate
    }

    static func resolveExportRequest(
        markdown: String,
        requestedFormat: EditorExportFormat,
        documentTitle: String,
        settings: ExportSettings,
        presets: [ExportPreset],
        appearanceMode: EditorAppearanceMode,
        interfaceStyle: EditorInterfaceStyle
    ) throws -> ResolvedExportRequest {
        let normalizedPresets = normalizedPresets(presets)
        let normalizedSettings = settings.normalized(using: normalizedPresets)
        let override = normalizedSettings.allowYAMLOverrides
            ? try parseDocumentExportOverride(from: markdown)
            : DocumentExportOverride()
        let formatPresets = normalizedPresets.filter { $0.format == requestedFormat }

        guard !formatPresets.isEmpty else {
            throw MarkdownExportError.missingPreset(format: requestedFormat)
        }

        let basePreset: ExportPreset
        if let presetKey = override.presetKey?.trimmingCharacters(in: .whitespacesAndNewlines),
           !presetKey.isEmpty
        {
            guard let preset = normalizedPresets.first(where: { $0.key == presetKey }) else {
                throw MarkdownExportError.presetNotFound(presetKey)
            }

            guard preset.format == requestedFormat else {
                throw MarkdownExportError.presetFormatMismatch(
                    expected: requestedFormat,
                    actual: preset.format
                )
            }

            basePreset = preset
        } else if let activePresetID = normalizedSettings.activePresetID(for: requestedFormat),
                  let preset = formatPresets.first(where: { $0.id == activePresetID })
        {
            basePreset = preset
        } else if let firstPreset = formatPresets.first {
            basePreset = firstPreset
        } else {
            throw MarkdownExportError.missingPreset(format: requestedFormat)
        }

        let resolvedTheme = (override.theme ?? basePreset.theme).resolvedTheme(
            matching: appearanceMode,
            style: interfaceStyle
        )
        let baseFileStem = preferredFileStem(
            overrideFileName: override.fileName,
            presetFileStem: basePreset.suggestedFileStem,
            documentTitle: documentTitle,
            format: requestedFormat
        )

        let resolvedPDFOptions: PDFExportOptions?
        switch requestedFormat {
        case .html:
            resolvedPDFOptions = nil
        case .pdf:
            var options = basePreset.effectivePDFOptions
            if let paperSize = override.pdf.paperSize {
                options.paperSize = paperSize
            }
            if let margin = override.pdf.margin {
                options.margin = margin
            }
            if let printBackground = override.pdf.printBackground {
                options.printBackground = printBackground
            }
            resolvedPDFOptions = options.normalized
        }

        return ResolvedExportRequest(
            format: requestedFormat,
            preset: basePreset,
            resolvedTheme: resolvedTheme,
            suggestedFileStem: baseFileStem,
            pdfOptions: resolvedPDFOptions
        )
    }

    @discardableResult
    static func writeHTMLPackage(
        bodyHTML: String,
        destinationHTMLURL: URL,
        documentTitle: String,
        theme: MarkdownRenderedTheme,
        documentBaseURL: URL?,
        printOptions: PDFExportOptions? = nil
    ) throws -> URL {
        let normalizedDestinationURL = MarkdownFileService.normalizedExportURL(
            from: destinationHTMLURL,
            contentType: .html
        )
        let assetDirectoryURL = normalizedDestinationURL
            .deletingPathExtension()
            .appendingPathExtension("assets")
        let packagedBodyHTML = try packagedHTMLBody(
            from: bodyHTML,
            documentBaseURL: documentBaseURL,
            exportHTMLURL: normalizedDestinationURL,
            exportAssetDirectoryURL: assetDirectoryURL
        )
        let htmlDocument = MarkdownFileService.renderedHTMLDocument(
            title: documentTitle,
            bodyHTML: packagedBodyHTML,
            theme: theme,
            printOptions: printOptions
        )
        try htmlDocument.write(to: normalizedDestinationURL, atomically: true, encoding: .utf8)
        return normalizedDestinationURL
    }

    static func createTemporaryHTMLPackage(
        bodyHTML: String,
        documentTitle: String,
        theme: MarkdownRenderedTheme,
        documentBaseURL: URL?,
        printOptions: PDFExportOptions?
    ) throws -> URL {
        let temporaryRootURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("MarkdownExport-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(
            at: temporaryRootURL,
            withIntermediateDirectories: true
        )

        let htmlURL = temporaryRootURL.appendingPathComponent("document.html")
        try writeHTMLPackage(
            bodyHTML: bodyHTML,
            destinationHTMLURL: htmlURL,
            documentTitle: documentTitle,
            theme: theme,
            documentBaseURL: documentBaseURL,
            printOptions: printOptions
        )
        return htmlURL
    }

    static func parseDocumentExportOverride(from markdown: String) throws -> DocumentExportOverride {
        guard let frontMatter = frontMatterBlock(in: markdown) else {
            return DocumentExportOverride()
        }

        var override = DocumentExportOverride()
        var contextStack: [(indent: Int, key: String)] = []

        for rawLine in frontMatter.components(separatedBy: .newlines) {
            let line = rawLine.replacingOccurrences(of: "\t", with: "    ")
            let trimmedLine = line.trimmingCharacters(in: .whitespaces)

            guard !trimmedLine.isEmpty, !trimmedLine.hasPrefix("#") else {
                continue
            }

            let indent = line.prefix { $0 == " " }.count
            let content = String(line.dropFirst(indent))
            guard let separatorIndex = content.firstIndex(of: ":") else {
                continue
            }

            let key = content[..<separatorIndex].trimmingCharacters(in: .whitespaces)
            let value = content[content.index(after: separatorIndex)...]
                .trimmingCharacters(in: .whitespaces)

            while let last = contextStack.last, indent <= last.indent {
                contextStack.removeLast()
            }

            let path = (contextStack.map(\.key) + [key]).joined(separator: ".")

            switch path {
            case "exportPreset":
                guard !value.isEmpty else {
                    throw MarkdownExportError.invalidOverrideStructure(field: "exportPreset")
                }
                override.presetKey = scalarValue(from: value)
            case "export":
                guard value.isEmpty else {
                    throw MarkdownExportError.invalidOverrideStructure(field: "export")
                }
                contextStack.append((indent, key))
            case "export.fileName":
                guard !value.isEmpty else {
                    throw MarkdownExportError.invalidOverrideStructure(field: "fileName")
                }
                override.fileName = scalarValue(from: value)
            case "export.theme":
                guard !value.isEmpty else {
                    throw MarkdownExportError.invalidOverrideStructure(field: "theme")
                }
                let scalar = scalarValue(from: value)
                guard let theme = MarkdownExportTheme(rawValue: scalar) ?? markdownTheme(from: scalar) else {
                    throw MarkdownExportError.invalidOverrideValue(field: "theme", value: scalar)
                }
                override.theme = theme
            case "export.pdf":
                guard value.isEmpty else {
                    throw MarkdownExportError.invalidOverrideStructure(field: "pdf")
                }
                contextStack.append((indent, key))
            case "export.pdf.paperSize":
                guard !value.isEmpty else {
                    throw MarkdownExportError.invalidOverrideStructure(field: "pdf.paperSize")
                }
                let scalar = scalarValue(from: value)
                guard let paperSize = EditorPDFPaperSize(rawValue: scalar) else {
                    throw MarkdownExportError.invalidOverrideValue(field: "pdf.paperSize", value: scalar)
                }
                override.pdf.paperSize = paperSize
            case "export.pdf.margin":
                guard !value.isEmpty else {
                    throw MarkdownExportError.invalidOverrideStructure(field: "pdf.margin")
                }
                let scalar = scalarValue(from: value)
                guard let margin = Double(scalar) else {
                    throw MarkdownExportError.invalidOverrideValue(field: "pdf.margin", value: scalar)
                }
                override.pdf.margin = margin
            case "export.pdf.printBackground":
                guard !value.isEmpty else {
                    throw MarkdownExportError.invalidOverrideStructure(field: "pdf.printBackground")
                }
                let scalar = scalarValue(from: value).lowercased()
                switch scalar {
                case "true":
                    override.pdf.printBackground = true
                case "false":
                    override.pdf.printBackground = false
                default:
                    throw MarkdownExportError.invalidOverrideValue(field: "pdf.printBackground", value: scalar)
                }
            default:
                if value.isEmpty {
                    contextStack.append((indent, key))
                }
            }
        }

        return override
    }

    private static func frontMatterBlock(in markdown: String) -> String? {
        guard markdown.hasPrefix("---") else {
            return nil
        }

        let lines = markdown.components(separatedBy: .newlines)
        guard lines.first == "---" else {
            return nil
        }

        var collected: [String] = []
        for line in lines.dropFirst() {
            if line == "---" || line == "..." {
                return collected.joined(separator: "\n")
            }
            collected.append(line)
        }

        return nil
    }

    private static func scalarValue(from rawValue: String) -> String {
        let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= 2 else {
            return trimmed
        }

        if (trimmed.hasPrefix("\"") && trimmed.hasSuffix("\"")) ||
            (trimmed.hasPrefix("'") && trimmed.hasSuffix("'"))
        {
            return String(trimmed.dropFirst().dropLast())
        }

        return trimmed
    }

    private static func markdownTheme(from rawValue: String) -> MarkdownExportTheme? {
        switch rawValue.lowercased() {
        case "light":
            return .light
        case "dark":
            return .dark
        case "sepia":
            return .sepia
        case "match", "matchappearance", "system":
            return .matchAppearance
        default:
            return nil
        }
    }

    private static func preferredFileStem(
        overrideFileName: String?,
        presetFileStem: String,
        documentTitle: String,
        format: EditorExportFormat
    ) -> String {
        let overrideStem = overrideFileName?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .deletingPathExtension
        let presetStem = presetFileStem.trimmingCharacters(in: .whitespacesAndNewlines)
        let documentStem = documentTitle.trimmingCharacters(in: .whitespacesAndNewlines)

        if let overrideStem, !overrideStem.isEmpty {
            return overrideStem
        }

        if !presetStem.isEmpty {
            return presetStem.deletingPathExtension
        }

        let fallbackStem = documentStem.isEmpty ? format.defaultPresetName : documentStem
        return fallbackStem.deletingPathExtension
    }

    private static func packagedHTMLBody(
        from bodyHTML: String,
        documentBaseURL: URL?,
        exportHTMLURL: URL,
        exportAssetDirectoryURL: URL
    ) throws -> String {
        let pattern = #"(?i)\b(src|poster)=("([^"]*)"|'([^']*)')"#
        let regularExpression = try NSRegularExpression(pattern: pattern)
        let fileManager = FileManager.default
        let nsBodyHTML = bodyHTML as NSString
        let matches = regularExpression.matches(
            in: bodyHTML,
            range: NSRange(location: 0, length: nsBodyHTML.length)
        )
        var rewrittenHTML = bodyHTML
        var copiedTargetsBySource: [String: String] = [:]
        var reservedRelativePaths = Set<String>()

        for match in matches.reversed() {
            let valueRange = match.range(at: 3).location != NSNotFound
                ? match.range(at: 3)
                : match.range(at: 4)
            guard valueRange.location != NSNotFound else {
                continue
            }

            let originalValue = nsBodyHTML.substring(with: valueRange)
            guard let resolvedResourceURL = resolvedLocalResourceURL(
                from: originalValue,
                documentBaseURL: documentBaseURL
            ) else {
                continue
            }

            let sourceKey = resolvedResourceURL.standardizedFileURL.path
            let relativeTargetPath: String

            if let cachedPath = copiedTargetsBySource[sourceKey] {
                relativeTargetPath = cachedPath
            } else {
                let targetRelativePath = uniqueAssetRelativePath(
                    for: resolvedResourceURL,
                    rawReference: originalValue,
                    baseURL: documentBaseURL,
                    reservedPaths: reservedRelativePaths
                )
                let targetURL = exportAssetDirectoryURL.appendingPathComponent(targetRelativePath)

                try fileManager.createDirectory(
                    at: targetURL.deletingLastPathComponent(),
                    withIntermediateDirectories: true
                )

                if targetURL.standardizedFileURL != resolvedResourceURL.standardizedFileURL {
                    if fileManager.fileExists(atPath: targetURL.path) {
                        try fileManager.removeItem(at: targetURL)
                    }
                    try fileManager.copyItem(at: resolvedResourceURL, to: targetURL)
                }

                copiedTargetsBySource[sourceKey] = targetRelativePath
                reservedRelativePaths.insert(targetRelativePath)
                relativeTargetPath = targetRelativePath
            }

            guard let swiftRange = Range(valueRange, in: rewrittenHTML) else {
                continue
            }

            let assetDirectoryName = exportAssetDirectoryURL.lastPathComponent
            let rewrittenValue = "\(assetDirectoryName)/\(relativeTargetPath)"
            rewrittenHTML.replaceSubrange(swiftRange, with: rewrittenValue)
        }

        return rewrittenHTML
    }

    private static func resolvedLocalResourceURL(
        from rawReference: String,
        documentBaseURL: URL?
    ) -> URL? {
        let trimmedReference = rawReference.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedReference.isEmpty else {
            return nil
        }

        if let candidateURL = URL(string: trimmedReference), let scheme = candidateURL.scheme?.lowercased() {
            switch scheme {
            case "http", "https", "data", "mailto", "javascript", "about":
                return nil
            case "file":
                return candidateURL.isFileURL ? candidateURL.standardizedFileURL : nil
            default:
                return nil
            }
        }

        let decodedReference = trimmedReference.removingPercentEncoding ?? trimmedReference
        if decodedReference.hasPrefix("/") {
            return URL(fileURLWithPath: decodedReference).standardizedFileURL
        }

        guard let documentBaseURL, documentBaseURL.isFileURL else {
            return nil
        }

        let baseDirectoryURL = documentBaseURL.hasDirectoryPath
            ? documentBaseURL.standardizedFileURL
            : documentBaseURL.deletingLastPathComponent().standardizedFileURL
        return baseDirectoryURL
            .appendingPathComponent(decodedReference)
            .standardizedFileURL
    }

    private static func uniqueAssetRelativePath(
        for sourceURL: URL,
        rawReference: String,
        baseURL: URL?,
        reservedPaths: Set<String>
    ) -> String {
        let preferredRelativePath = sanitizedRelativeAssetPath(
            for: sourceURL,
            rawReference: rawReference,
            baseURL: baseURL
        )
        let pathExtension = sourceURL.pathExtension
        let stem = preferredRelativePath.deletingPathExtension
        var candidate = preferredRelativePath
        var suffix = 2

        while reservedPaths.contains(candidate) {
            if pathExtension.isEmpty {
                candidate = "\(stem)-\(suffix)"
            } else {
                candidate = "\(stem)-\(suffix).\(pathExtension)"
            }
            suffix += 1
        }

        return candidate
    }

    private static func sanitizedRelativeAssetPath(
        for sourceURL: URL,
        rawReference: String,
        baseURL: URL?
    ) -> String {
        let decodedReference = (rawReference.removingPercentEncoding ?? rawReference)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let relativeReference = decodedReference
            .split(separator: "#", maxSplits: 1, omittingEmptySubsequences: false)
            .first
            .map(String.init) ?? decodedReference
        let withoutQuery = relativeReference
            .split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false)
            .first
            .map(String.init) ?? relativeReference

        if !withoutQuery.isEmpty,
           !withoutQuery.hasPrefix("/"),
           let baseURL
        {
            let baseDirectoryURL = baseURL.hasDirectoryPath
                ? baseURL.standardizedFileURL
                : baseURL.deletingLastPathComponent().standardizedFileURL
            let absoluteCandidate = baseDirectoryURL.appendingPathComponent(withoutQuery).standardizedFileURL

            if absoluteCandidate == sourceURL.standardizedFileURL {
                let components = withoutQuery
                    .split(separator: "/")
                    .filter { $0 != "." && $0 != ".." && !$0.isEmpty }
                    .map { sanitizedFileNameComponent(String($0)) }
                let joined = components.joined(separator: "/")
                if !joined.isEmpty {
                    return joined
                }
            }
        }

        return sanitizedFileNameComponent(sourceURL.lastPathComponent)
    }

    private static func sanitizedFileNameComponent(_ component: String) -> String {
        let trimmed = component.trimmingCharacters(in: .whitespacesAndNewlines)
        let invalidCharacters = CharacterSet(charactersIn: ":*?\"<>|\\")
        let sanitized = trimmed.unicodeScalars.map { scalar -> Character in
            invalidCharacters.contains(scalar) ? "-" : Character(scalar)
        }
        let value = String(sanitized).trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? "asset" : value
    }
}

extension EditorExportFormat {
    var fileExtension: String {
        switch self {
        case .html:
            return "html"
        case .pdf:
            return "pdf"
        }
    }

    var contentType: UTType {
        switch self {
        case .html:
            return .html
        case .pdf:
            return .pdf
        }
    }

    var defaultPresetName: String {
        switch self {
        case .html:
            return "HTML 预设"
        case .pdf:
            return "PDF 预设"
        }
    }

    var defaultPresetKeyBase: String {
        switch self {
        case .html:
            return "html"
        case .pdf:
            return "pdf"
        }
    }
}

extension EditorPDFPaperSize {
    var pageSizePoints: CGSize {
        switch self {
        case .a4:
            return CGSize(width: 595.2, height: 841.8)
        case .letter:
            return CGSize(width: 612, height: 792)
        }
    }
}

private extension String {
    var deletingPathExtension: String {
        (self as NSString).deletingPathExtension
    }
}
