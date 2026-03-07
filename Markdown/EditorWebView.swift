//
//  EditorWebView.swift
//  Markdown
//
//  Created by Codex on 2026/3/7.
//

import SwiftUI
import WebKit

enum EditorWebViewControllerError: LocalizedError {
    case pageNotReady
    case renderedContentUnavailable

    var errorDescription: String? {
        switch self {
        case .pageNotReady:
            return "编辑器内容尚未准备好，请稍后再试。"
        case .renderedContentUnavailable:
            return "当前无法读取编辑器的渲染内容。"
        }
    }
}

struct EditorWebView: NSViewRepresentable {
    static let contentChangedMessageName = "editorContentChanged"
    static let imageAssetRequestMessageName = "editorImageAssetRequest"

    @Binding var markdown: String
    let controller: Controller
    var presentation: Presentation
    var onContentChanged: ((String) -> Void)?
    var onImageAssetRequest: ((ImageAssetRequest, @escaping (Result<String, Error>) -> Void) -> Void)?

    init(
        markdown: Binding<String>,
        controller: Controller,
        presentation: Presentation = .default,
        onContentChanged: ((String) -> Void)? = nil,
        onImageAssetRequest: ((ImageAssetRequest, @escaping (Result<String, Error>) -> Void) -> Void)? = nil
    ) {
        _markdown = markdown
        self.controller = controller
        self.presentation = presentation
        self.onContentChanged = onContentChanged
        self.onImageAssetRequest = onImageAssetRequest
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(parent: self)
    }

    func makeNSView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        if #available(macOS 15.0, *) {
            configuration.writingToolsBehavior = .none
        }
        configuration.userContentController.add(context.coordinator, name: Self.contentChangedMessageName)
        configuration.userContentController.add(context.coordinator, name: Self.imageAssetRequestMessageName)

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.allowsMagnification = false
        webView.setValue(false, forKey: "drawsBackground")
        controller.attach(webView: webView)
        context.coordinator.loadLocalEditor(in: webView)
        return webView
    }

    func updateNSView(_ nsView: WKWebView, context: Context) {
        context.coordinator.parent = self
        controller.attach(webView: nsView)
        context.coordinator.syncMarkdownToJavaScript()
        context.coordinator.syncPresentationToJavaScript()
    }

    static func dismantleNSView(_ nsView: WKWebView, coordinator: Coordinator) {
        nsView.configuration.userContentController.removeScriptMessageHandler(forName: contentChangedMessageName)
        nsView.configuration.userContentController.removeScriptMessageHandler(forName: imageAssetRequestMessageName)
        nsView.navigationDelegate = nil
        coordinator.parent.controller.detach(webView: nsView)
        nsView.stopLoading()
    }

    func evaluateJavaScript(
        _ javaScript: String,
        completion: ((Result<Any?, Error>) -> Void)? = nil
    ) {
        controller.evaluateJavaScript(javaScript, completion: completion)
    }

    func loadMarkdown(
        _ markdown: String,
        completion: ((Result<Any?, Error>) -> Void)? = nil
    ) {
        controller.loadMarkdown(markdown, completion: completion)
    }

    func runCommand(
        _ command: String,
        completion: ((Result<Any?, Error>) -> Void)? = nil
    ) {
        controller.runCommand(command, completion: completion)
    }

    static func javaScriptStringLiteral(for string: String) -> String {
        guard
            let data = try? JSONSerialization.data(withJSONObject: [string]),
            let jsonArray = String(data: data, encoding: .utf8)
        else {
            return "\"\""
        }

        return String(jsonArray.dropFirst().dropLast())
    }

    struct Presentation: Equatable {
        var theme: String
        var focusMode: Bool
        var typewriterMode: Bool
        var fontFamily: String
        var fontSize: Double
        var lineHeight: Double
        var pageWidth: String
        var codeFontFamily: String
        var codeFontSize: Double
        var hideQuickInsertHint: Bool
        var autoPairBracket: Bool
        var autoPairMarkdownSyntax: Bool
        var autoPairQuote: Bool

        static let `default` = Presentation(
            theme: "light",
            focusMode: false,
            typewriterMode: false,
            fontFamily: "\"Iowan Old Style\", \"Palatino Linotype\", \"PingFang SC\", \"SF Pro Text\", serif",
            fontSize: 17,
            lineHeight: 1.86,
            pageWidth: "860px",
            codeFontFamily: "\"SF Mono\", \"JetBrains Mono\", ui-monospace, monospace",
            codeFontSize: 14,
            hideQuickInsertHint: false,
            autoPairBracket: true,
            autoPairMarkdownSyntax: true,
            autoPairQuote: true
        )
    }

    struct ImageAssetRequest {
        let filename: String
        let mimeType: String
        let data: Data
    }

    @MainActor
    final class Controller {
        private weak var webView: WKWebView?
        private var isPageReady = false
        private var pendingScripts: [PendingScript] = []

        func attach(webView: WKWebView) {
            let isNewWebView = self.webView !== webView
            self.webView = webView

            if isNewWebView {
                isPageReady = false
            }

            flushPendingScriptsIfPossible()
        }

        func detach(webView: WKWebView) {
            guard self.webView === webView else {
                return
            }

            self.webView = nil
            isPageReady = false
            pendingScripts.removeAll()
        }

        func markPageReady() {
            isPageReady = true
            flushPendingScriptsIfPossible()
        }

        func evaluateJavaScript(
            _ javaScript: String,
            completion: ((Result<Any?, Error>) -> Void)? = nil
        ) {
            guard let webView, isPageReady else {
                pendingScripts.append(PendingScript(javaScript: javaScript, completion: completion))
                return
            }

            webView.evaluateJavaScript(javaScript) { result, error in
                if let error {
                    completion?(.failure(error))
                    return
                }

                completion?(.success(result))
            }
        }

        func loadMarkdown(
            _ markdown: String,
            completion: ((Result<Any?, Error>) -> Void)? = nil
        ) {
            let literal = EditorWebView.javaScriptStringLiteral(for: markdown)
            let script = """
            if (typeof window.loadMarkdown === 'function') {
                window.loadMarkdown(\(literal));
            }
            """
            evaluateJavaScript(script, completion: completion)
        }

        func revealHeading(_ title: String, completion: ((Result<Any?, Error>) -> Void)? = nil) {
            let literal = EditorWebView.javaScriptStringLiteral(for: title)
            let script = """
            if (typeof window.revealHeading === 'function') {
                window.revealHeading(\(literal));
            }
            """
            evaluateJavaScript(script, completion: completion)
        }

        func runCommand(
            _ command: String,
            completion: ((Result<Any?, Error>) -> Void)? = nil
        ) {
            let literal = EditorWebView.javaScriptStringLiteral(for: command)
            let script = """
            if (typeof window.runEditorCommand === 'function') {
                window.runEditorCommand(\(literal));
            }
            """
            evaluateJavaScript(script, completion: completion)
        }

        func renderedHTML(completion: @escaping (Result<String, Error>) -> Void) {
            let script = """
            (() => {
                if (typeof window.getRenderedHTML === 'function') {
                    return window.getRenderedHTML();
                }

                const root = document.querySelector('.cm-editor .cm-content');
                return root ? root.innerHTML : '';
            })();
            """

            evaluateJavaScript(script) { result in
                switch result {
                case .success(let value):
                    guard let html = value as? String, !html.isEmpty else {
                        completion(.failure(EditorWebViewControllerError.renderedContentUnavailable))
                        return
                    }

                    completion(.success(html))
                case .failure(let error):
                    completion(.failure(error))
                }
            }
        }

        func exportPDF(completion: @escaping (Result<Data, Error>) -> Void) {
            guard let webView, isPageReady else {
                completion(.failure(EditorWebViewControllerError.pageNotReady))
                return
            }

            let configuration = WKPDFConfiguration()
            configuration.rect = webView.bounds

            webView.createPDF(configuration: configuration) { result in
                switch result {
                case .success(let data):
                    completion(.success(data))
                case .failure(let error):
                    completion(.failure(error))
                }
            }
        }

        func printDocument() throws {
            guard let webView, isPageReady else {
                throw EditorWebViewControllerError.pageNotReady
            }

            let operation = webView.printOperation(with: .shared)
            operation.showsPrintPanel = true
            operation.showsProgressPanel = true
            operation.run()
        }

        private func flushPendingScriptsIfPossible() {
            guard let webView, isPageReady, !pendingScripts.isEmpty else {
                return
            }

            let scripts = pendingScripts
            pendingScripts.removeAll()

            for pendingScript in scripts {
                webView.evaluateJavaScript(pendingScript.javaScript) { result, error in
                    if let error {
                        pendingScript.completion?(.failure(error))
                        return
                    }

                    pendingScript.completion?(.success(result))
                }
            }
        }
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        var parent: EditorWebView
        private var lastSyncedMarkdown: String?
        private var lastSyncedPresentation: Presentation?

        init(parent: EditorWebView) {
            self.parent = parent
        }

        func loadLocalEditor(in webView: WKWebView) {
            guard let indexURL = Self.editorIndexURL() else {
                NSLog("[EditorWebView] Missing bundled index.html resource")
                webView.loadHTMLString(Self.missingEditorHTML, baseURL: nil)
                return
            }

            let readAccessURL = indexURL.deletingLastPathComponent()

            if let inlinedHTML = Self.inlinedEditorHTML(from: indexURL) {
                webView.loadHTMLString(inlinedHTML, baseURL: readAccessURL)
                return
            }

            webView.loadFileURL(indexURL, allowingReadAccessTo: readAccessURL)
        }

        func syncMarkdownToJavaScript() {
            guard parent.markdown != lastSyncedMarkdown else {
                return
            }

            lastSyncedMarkdown = parent.markdown
            parent.controller.loadMarkdown(parent.markdown)
        }

        func syncPresentationToJavaScript() {
            guard parent.presentation != lastSyncedPresentation else {
                return
            }

            lastSyncedPresentation = parent.presentation

            let theme = EditorWebView.javaScriptStringLiteral(for: parent.presentation.theme)
            let focusMode = parent.presentation.focusMode ? "true" : "false"
            let typewriterMode = parent.presentation.typewriterMode ? "true" : "false"
            let fontFamily = EditorWebView.javaScriptStringLiteral(for: parent.presentation.fontFamily)
            let fontSize = String(parent.presentation.fontSize)
            let lineHeight = String(parent.presentation.lineHeight)
            let pageWidth = EditorWebView.javaScriptStringLiteral(for: parent.presentation.pageWidth)
            let codeFontFamily = EditorWebView.javaScriptStringLiteral(for: parent.presentation.codeFontFamily)
            let codeFontSize = String(parent.presentation.codeFontSize)
            let hideQuickInsertHint = parent.presentation.hideQuickInsertHint ? "true" : "false"
            let autoPairBracket = parent.presentation.autoPairBracket ? "true" : "false"
            let autoPairMarkdownSyntax = parent.presentation.autoPairMarkdownSyntax ? "true" : "false"
            let autoPairQuote = parent.presentation.autoPairQuote ? "true" : "false"
            let script = """
            if (typeof window.setEditorAppearance === 'function') {
                window.setEditorAppearance({
                    theme: \(theme),
                    focusMode: \(focusMode),
                    typewriterMode: \(typewriterMode),
                    fontFamily: \(fontFamily),
                    fontSize: \(fontSize),
                    lineHeight: \(lineHeight),
                    pageWidth: \(pageWidth),
                    codeFontFamily: \(codeFontFamily),
                    codeFontSize: \(codeFontSize),
                    hideQuickInsertHint: \(hideQuickInsertHint),
                    autoPairBracket: \(autoPairBracket),
                    autoPairMarkdownSyntax: \(autoPairMarkdownSyntax),
                    autoPairQuote: \(autoPairQuote)
                });
            }
            """

            parent.controller.evaluateJavaScript(script)
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            parent.controller.markPageReady()
            syncMarkdownToJavaScript()
            syncPresentationToJavaScript()
        }

        func userContentController(
            _ userContentController: WKUserContentController,
            didReceive message: WKScriptMessage
        ) {
            if
                message.name == EditorWebView.contentChangedMessageName,
                let content = message.body as? String
            {
                lastSyncedMarkdown = content

                if parent.markdown != content {
                    parent.markdown = content
                }

                parent.onContentChanged?(content)
                return
            }

            if message.name == EditorWebView.imageAssetRequestMessageName {
                handleImageAssetRequest(message)
            }
        }

        private func handleImageAssetRequest(_ message: WKScriptMessage) {
            guard
                let body = message.body as? [String: Any],
                let requestID = body["requestID"] as? String,
                let filename = body["filename"] as? String,
                let mimeType = body["mimeType"] as? String,
                let base64Data = body["base64Data"] as? String,
                let data = Data(base64Encoded: base64Data)
            else {
                resolveImageAssetRequest(
                    id: (message.body as? [String: Any])?["requestID"] as? String ?? "",
                    result: .failure(
                        NSError(
                            domain: "Markdown",
                            code: 21,
                            userInfo: [NSLocalizedDescriptionKey: "图片数据无效。"]
                        )
                    )
                )
                return
            }

            guard let onImageAssetRequest = parent.onImageAssetRequest else {
                resolveImageAssetRequest(
                    id: requestID,
                    result: .failure(
                        NSError(
                            domain: "Markdown",
                            code: 22,
                            userInfo: [NSLocalizedDescriptionKey: "当前无法处理图片资源请求。"]
                        )
                    )
                )
                return
            }

            onImageAssetRequest(
                ImageAssetRequest(filename: filename, mimeType: mimeType, data: data)
            ) { [weak self] result in
                self?.resolveImageAssetRequest(id: requestID, result: result)
            }
        }

        private func resolveImageAssetRequest(id: String, result: Result<String, Error>) {
            let requestLiteral = EditorWebView.javaScriptStringLiteral(for: id)

            let script: String
            switch result {
            case .success(let relativePath):
                let pathLiteral = EditorWebView.javaScriptStringLiteral(for: relativePath)
                script = """
                if (typeof window.__resolveEditorAssetRequest === 'function') {
                    window.__resolveEditorAssetRequest(\(requestLiteral), { path: \(pathLiteral) });
                }
                """
            case .failure(let error):
                let errorLiteral = EditorWebView.javaScriptStringLiteral(for: error.localizedDescription)
                script = """
                if (typeof window.__resolveEditorAssetRequest === 'function') {
                    window.__resolveEditorAssetRequest(\(requestLiteral), { error: \(errorLiteral) });
                }
                """
            }

            parent.controller.evaluateJavaScript(script)
        }

        func webView(
            _ webView: WKWebView,
            didFail navigation: WKNavigation!,
            withError error: Error
        ) {
            NSLog("[EditorWebView] didFail url=%@ error=%@", webView.url?.absoluteString ?? "<nil>", error.localizedDescription)
        }

        func webView(
            _ webView: WKWebView,
            didFailProvisionalNavigation navigation: WKNavigation!,
            withError error: Error
        ) {
            NSLog("[EditorWebView] didFailProvisionalNavigation url=%@ error=%@", webView.url?.absoluteString ?? "<nil>", error.localizedDescription)
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            NSLog("[EditorWebView] web content process terminated")
        }

        private static func editorIndexURL() -> URL? {
            Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "Editor")
                ?? Bundle.main.url(forResource: "index", withExtension: "html")
        }

        private static func inlinedEditorHTML(from indexURL: URL) -> String? {
            let baseURL = indexURL.deletingLastPathComponent()
            let cssURL = baseURL.appendingPathComponent("index.css")
            let scriptURL = baseURL.appendingPathComponent("index.js")

            guard
                let html = try? String(contentsOf: indexURL, encoding: .utf8),
                let css = try? String(contentsOf: cssURL, encoding: .utf8),
                let script = try? String(contentsOf: scriptURL, encoding: .utf8)
            else {
                NSLog("[EditorWebView] Failed to read editor assets for HTML inlining")
                return nil
            }

            var renderedHTML = html

            renderedHTML = replaceFirstMatch(
                in: renderedHTML,
                pattern: #"<link[^>]*href="\./index\.css"[^>]*>"#,
                replacement: "<style>\n\(css)\n</style>"
            )

            renderedHTML = replaceFirstMatch(
                in: renderedHTML,
                pattern: #"<script[^>]*src="\./index\.js"[^>]*></script>"#,
                replacement: inlineBootstrapScript(for: script)
            )

            return renderedHTML
        }

        private static func inlineBootstrapScript(for script: String) -> String {
            let sourceWithName = script + "\n//# sourceURL=index.inline.js"
            let literal = EditorWebView.javaScriptStringLiteral(for: sourceWithName)

            // The bundled editor is emitted for `type=\"module\"`, which normally defers execution
            // until the document has been parsed. We keep that timing when embedding the script inline.
            return """
            <script>
            (() => {
                const source = \(literal);
                const run = () => {
                    try {
                        (new Function(source))();
                    } catch (error) {
                        console.error("[EditorWebView] Failed to bootstrap bundled editor", error);

                        const app = document.getElementById("app");
                        if (app) {
                            app.innerHTML = "<div class=\\"editor-error\\">编辑器初始化失败。</div>";
                        }
                    }
                };

                if (document.readyState === "loading") {
                    document.addEventListener("DOMContentLoaded", run, { once: true });
                } else {
                    run();
                }
            })();
            </script>
            """
        }

        private static func replaceFirstMatch(
            in source: String,
            pattern: String,
            replacement: String
        ) -> String {
            guard let regex = try? NSRegularExpression(pattern: pattern, options: []) else {
                return source
            }

            let range = NSRange(source.startIndex..<source.endIndex, in: source)

            guard let match = regex.firstMatch(in: source, options: [], range: range),
                  let swiftRange = Range(match.range, in: source)
            else {
                return source
            }

            var result = source
            result.replaceSubrange(swiftRange, with: replacement)
            return result
        }

        private static let missingEditorHTML = """
        <!doctype html>
        <html lang="zh">
        <head>
          <meta charset="utf-8">
          <style>
            body {
              margin: 0;
              min-height: 100vh;
              display: grid;
              place-items: center;
              background: #111827;
              color: #f9fafb;
              font: 16px -apple-system, BlinkMacSystemFont, sans-serif;
            }
          </style>
        </head>
        <body>
          <p>缺少打包后的编辑器资源。</p>
        </body>
        </html>
        """
    }

    private struct PendingScript {
        let javaScript: String
        let completion: ((Result<Any?, Error>) -> Void)?
    }
}
