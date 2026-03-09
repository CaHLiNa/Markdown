import Foundation

enum EditorRuntimeStager {
    static let requiredRuntimePaths = [
        "vditor/dist/js/lute/lute.min.js",
        "vditor/dist/js/i18n/zh_CN.js",
        "vditor/dist/js/icons/ant.js",
        "vditor/dist/js/highlight.js/highlight.min.js",
        "vditor/dist/js/highlight.js/third-languages.js",
        "vditor/dist/js/highlight.js/styles/github.min.css",
        "vditor/dist/js/highlight.js/styles/github-dark.min.css",
        "vditor/dist/js/katex/katex.min.css",
        "vditor/dist/js/katex/katex.min.js",
        "vditor/dist/js/katex/mhchem.min.js",
        "vditor/dist/js/katex/fonts/KaTeX_Main-Regular.woff2",
        "vditor/dist/css/content-theme/light.css",
        "vditor/dist/css/content-theme/dark.css",
        "vditor/dist/images/emoji/b3log.png",
    ]

    private static let rootEditorFiles = [
        "index.html",
        "index.js",
        "index.css",
    ]

    private static let flattenedRuntimeFiles: [(source: String, destination: String)] = [
        ("lute.min.js", "vditor/dist/js/lute/lute.min.js"),
        ("zh_CN.js", "vditor/dist/js/i18n/zh_CN.js"),
        ("ant.js", "vditor/dist/js/icons/ant.js"),
        ("highlight.min.js", "vditor/dist/js/highlight.js/highlight.min.js"),
        ("third-languages.js", "vditor/dist/js/highlight.js/third-languages.js"),
        ("github.min.css", "vditor/dist/js/highlight.js/styles/github.min.css"),
        ("github-dark.min.css", "vditor/dist/js/highlight.js/styles/github-dark.min.css"),
        ("katex.min.css", "vditor/dist/js/katex/katex.min.css"),
        ("katex.min.js", "vditor/dist/js/katex/katex.min.js"),
        ("mhchem.min.js", "vditor/dist/js/katex/mhchem.min.js"),
        ("light.css", "vditor/dist/css/content-theme/light.css"),
        ("dark.css", "vditor/dist/css/content-theme/dark.css"),
    ]

    private static let emojiFilenames = [
        "b3log.png",
        "chainbook.png",
        "doge.png",
        "hacpai.png",
        "huaji.gif",
        "latke.png",
        "liandi.png",
        "lute.png",
        "octocat.png",
        "pipe.png",
        "siyuan.png",
        "solo.png",
        "sym.png",
        "trollface.png",
        "vditor.png",
        "wide.png",
        "wulian.png",
    ]

    static func bundledIndexURL() -> URL? {
        Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "Editor")
            ?? Bundle.main.url(forResource: "index", withExtension: "html")
    }

    static func resolvedIndexURL() -> URL? {
        guard let bundledIndexURL = bundledIndexURL() else {
            return nil
        }

        let bundleRoot = bundledIndexURL.deletingLastPathComponent()

        if hasStructuredRuntime(at: bundleRoot) {
            return bundledIndexURL
        }

        do {
            return try stageFlattenedBundle(from: bundleRoot)
        } catch {
            NSLog("[EditorWebView] Failed to stage flattened editor bundle: %@", error.localizedDescription)
            return bundledIndexURL
        }
    }

    static func hasStructuredRuntime(at root: URL) -> Bool {
        let fileManager = FileManager.default

        for relativePath in requiredRuntimePaths {
            if !fileManager.fileExists(atPath: root.appendingPathComponent(relativePath).path) {
                return false
            }
        }

        return fileManager.fileExists(atPath: root.appendingPathComponent("index.html").path)
    }

    @discardableResult
    static func stageFlattenedBundle(from bundleRoot: URL, into stagingRoot: URL? = nil) throws -> URL {
        let fileManager = FileManager.default
        let runtimeRoot = stagingRoot ?? fileManager.temporaryDirectory
            .appendingPathComponent("MarkdownEditorRuntime", isDirectory: true)

        if fileManager.fileExists(atPath: runtimeRoot.path) {
            try fileManager.removeItem(at: runtimeRoot)
        }

        try fileManager.createDirectory(at: runtimeRoot, withIntermediateDirectories: true)

        for filename in rootEditorFiles {
            try copyItem(
                from: bundleRoot.appendingPathComponent(filename),
                to: runtimeRoot.appendingPathComponent(filename),
                using: fileManager
            )
        }

        for mapping in flattenedRuntimeFiles {
            try copyItem(
                from: bundleRoot.appendingPathComponent(mapping.source),
                to: runtimeRoot.appendingPathComponent(mapping.destination),
                using: fileManager
            )
        }

        let katexFontRoot = runtimeRoot.appendingPathComponent("vditor/dist/js/katex/fonts", isDirectory: true)
        try fileManager.createDirectory(at: katexFontRoot, withIntermediateDirectories: true)

        for sourceURL in try fileManager.contentsOfDirectory(
            at: bundleRoot,
            includingPropertiesForKeys: nil,
            options: [.skipsHiddenFiles]
        ) where sourceURL.lastPathComponent.hasPrefix("KaTeX_") {
            try copyItem(
                from: sourceURL,
                to: katexFontRoot.appendingPathComponent(sourceURL.lastPathComponent),
                using: fileManager
            )
        }

        let emojiRoot = runtimeRoot.appendingPathComponent("vditor/dist/images/emoji", isDirectory: true)
        try fileManager.createDirectory(at: emojiRoot, withIntermediateDirectories: true)

        for filename in emojiFilenames {
            try copyItem(
                from: bundleRoot.appendingPathComponent(filename),
                to: emojiRoot.appendingPathComponent(filename),
                using: fileManager
            )
        }

        return runtimeRoot.appendingPathComponent("index.html")
    }

    private static func copyItem(from sourceURL: URL, to destinationURL: URL, using fileManager: FileManager) throws {
        guard fileManager.fileExists(atPath: sourceURL.path) else {
            throw CocoaError(.fileNoSuchFile, userInfo: [NSFilePathErrorKey: sourceURL.path])
        }

        try fileManager.createDirectory(
            at: destinationURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )

        if fileManager.fileExists(atPath: destinationURL.path) {
            try fileManager.removeItem(at: destinationURL)
        }

        try fileManager.copyItem(at: sourceURL, to: destinationURL)
    }
}
