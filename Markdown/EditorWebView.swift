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
    case markdownUnavailable

    var errorDescription: String? {
        switch self {
        case .pageNotReady:
            return "编辑器内容尚未准备好，请稍后再试。"
        case .renderedContentUnavailable:
            return "当前无法读取编辑器的渲染内容。"
        case .markdownUnavailable:
            return "当前无法读取编辑器的 Markdown 内容。"
        }
    }
}

struct EditorWebView: NSViewRepresentable {
    static let contentChangedMessageName = "editorContentChanged"
    static let readyMessageName = "editorReady"
    static let imageAssetRequestMessageName = "editorImageAssetRequest"
    static let openLinkMessageName = "editorOpenLink"
    static let consoleMessageName = "editorConsole"

    @Binding var markdown: String
    let controller: Controller
    var documentBaseURL: URL?
    var presentation: Presentation
    var revealRequest: EditorRevealRequest?
    var onContentChanged: ((String) -> Void)?
    var onImageAssetRequest: ((ImageAssetRequest, @escaping (Result<String, Error>) -> Void) -> Void)?

    init(
        markdown: Binding<String>,
        controller: Controller,
        documentBaseURL: URL? = nil,
        presentation: Presentation = .default,
        revealRequest: EditorRevealRequest? = nil,
        onContentChanged: ((String) -> Void)? = nil,
        onImageAssetRequest: ((ImageAssetRequest, @escaping (Result<String, Error>) -> Void) -> Void)? = nil
    ) {
        _markdown = markdown
        self.controller = controller
        self.documentBaseURL = documentBaseURL
        self.presentation = presentation
        self.revealRequest = revealRequest
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
        configuration.userContentController.add(context.coordinator, name: Self.readyMessageName)
        configuration.userContentController.add(context.coordinator, name: Self.imageAssetRequestMessageName)
        configuration.userContentController.add(context.coordinator, name: Self.openLinkMessageName)
        configuration.userContentController.add(context.coordinator, name: Self.consoleMessageName)
        configuration.userContentController.addUserScript(
            WKUserScript(
                source: Self.consoleForwardingScript,
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true
            )
        )

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
        context.coordinator.syncDocumentBaseURLToJavaScript()
        context.coordinator.syncPresentationToJavaScript()
        context.coordinator.syncRevealRequestToJavaScript()
    }

    static func dismantleNSView(_ nsView: WKWebView, coordinator: Coordinator) {
        nsView.configuration.userContentController.removeScriptMessageHandler(forName: contentChangedMessageName)
        nsView.configuration.userContentController.removeScriptMessageHandler(forName: readyMessageName)
        nsView.configuration.userContentController.removeScriptMessageHandler(forName: imageAssetRequestMessageName)
        nsView.configuration.userContentController.removeScriptMessageHandler(forName: openLinkMessageName)
        nsView.configuration.userContentController.removeScriptMessageHandler(forName: consoleMessageName)
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

    static let consoleForwardingScript = """
    (() => {
      const handler = window.webkit?.messageHandlers?.editorConsole;

      if (!handler || window.__editorConsoleForwardingInstalled) {
        return;
      }

      window.__editorConsoleForwardingInstalled = true;

      const normalize = (value) => {
        if (typeof value === 'string') {
          return value;
        }

        if (value instanceof Error) {
          return value.stack || value.message || String(value);
        }

        try {
          return JSON.stringify(value);
        } catch {
          return String(value);
        }
      };

      const post = (level, values) => {
        try {
          const result = handler.postMessage({
            level,
            message: values.map(normalize).join(' ')
          });

          if (result && typeof result === 'object' && typeof result.catch === 'function') {
            result.catch(() => {});
          }
        } catch {}
      };

      for (const level of ['log', 'info', 'warn', 'error']) {
        const original = console[level]?.bind(console);

        console[level] = (...values) => {
          post(level, values);
          original?.(...values);
        };
      }

      window.addEventListener('error', (event) => {
        const errorEvent = event;
        const target = errorEvent.target instanceof Element ? errorEvent.target : null;

        post('error', [
          errorEvent.message,
          errorEvent.filename,
          errorEvent.lineno,
          errorEvent.colno,
          errorEvent.error,
          target?.tagName ?? null,
          target?.getAttribute?.('src') ?? null,
          target?.getAttribute?.('href') ?? null,
          target?.outerHTML ?? null
        ]);
      }, true);

      window.addEventListener('unhandledrejection', (event) => {
        post('error', ['Unhandled promise rejection', event.reason]);
      });
    })();
    """

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
        var spellCheckEnabled: Bool
        var indentWidth: Int
        var useSpacesForIndent: Bool
        var hideQuickInsertHint: Bool
        var autoPairBracket: Bool
        var autoPairMarkdownSyntax: Bool
        var autoPairQuote: Bool
        var enableTables: Bool
        var enableTaskList: Bool
        var enableStrikethrough: Bool
        var enableFootnotes: Bool
        var enableTOC: Bool
        var enableMath: Bool
        var enableMermaid: Bool
        var enableYAMLFrontMatter: Bool
        var imageRootURL: String
        var imagePreferDotSlash: Bool
        var imageAutoEncodeURL: Bool
        var linkOpenRequiresCommand: Bool

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
            spellCheckEnabled: true,
            indentWidth: 4,
            useSpacesForIndent: true,
            hideQuickInsertHint: false,
            autoPairBracket: true,
            autoPairMarkdownSyntax: true,
            autoPairQuote: true,
            enableTables: true,
            enableTaskList: true,
            enableStrikethrough: true,
            enableFootnotes: true,
            enableTOC: true,
            enableMath: true,
            enableMermaid: true,
            enableYAMLFrontMatter: true,
            imageRootURL: "",
            imagePreferDotSlash: false,
            imageAutoEncodeURL: true,
            linkOpenRequiresCommand: true
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

        func setDocumentBaseURL(
            _ documentBaseURL: URL?,
            completion: ((Result<Any?, Error>) -> Void)? = nil
        ) {
            let literal = documentBaseURL.map { EditorWebView.javaScriptStringLiteral(for: $0.absoluteString) } ?? "null"
            let script = """
            if (typeof window.setEditorDocumentBaseURL === 'function') {
                window.setEditorDocumentBaseURL(\(literal));
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

        func revealOffset(
            _ offset: Int,
            length: Int = 0,
            completion: ((Result<Any?, Error>) -> Void)? = nil
        ) {
            let clampedOffset = max(0, offset)
            let clampedLength = max(0, length)
            let script = """
            if (typeof window.revealOffset === 'function') {
                window.revealOffset(\(clampedOffset), \(clampedLength));
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

        func currentMarkdown(completion: @escaping (Result<String, Error>) -> Void) {
            let script = """
            (() => {
                if (typeof window.getEditorState === 'function') {
                    const state = window.getEditorState();
                    return typeof state?.markdown === 'string' ? state.markdown : null;
                }

                return null;
            })();
            """

            evaluateJavaScript(script) { result in
                switch result {
                case .success(let value):
                    guard let markdown = value as? String else {
                        completion(.failure(EditorWebViewControllerError.markdownUnavailable))
                        return
                    }

                    completion(.success(markdown))
                case .failure(let error):
                    completion(.failure(error))
                }
            }
        }

        func renderedHTML(completion: @escaping (Result<String, Error>) -> Void) {
            let script = """
            (() => {
                if (typeof window.getRenderedHTML === 'function') {
                    return window.getRenderedHTML();
                }

                const root = document.querySelector('.md-editor__wysiwyg .ProseMirror');
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
        private var lastSyncedDocumentBaseURL: URL?
        private var lastSyncedPresentation: Presentation?
        private var lastRevealRequestID: UUID?
        private var didAttemptInlineFallback = false
        private var didReceiveEditorReady = false
        private var readyFallbackWorkItem: DispatchWorkItem?

        init(parent: EditorWebView) {
            self.parent = parent
        }

        func loadLocalEditor(in webView: WKWebView) {
            guard let indexURL = Self.editorIndexURL() else {
                NSLog("[EditorWebView] Missing bundled index.html resource")
                webView.loadHTMLString(Self.missingEditorHTML, baseURL: nil)
                return
            }

            didAttemptInlineFallback = false
            didReceiveEditorReady = false
            cancelReadyFallback()
            let readAccessURL = URL(fileURLWithPath: "/", isDirectory: true)
            scheduleReadyFallback(for: webView)
            webView.loadFileURL(indexURL, allowingReadAccessTo: readAccessURL)
        }

        func syncMarkdownToJavaScript() {
            guard parent.markdown != lastSyncedMarkdown else {
                return
            }

            lastSyncedMarkdown = parent.markdown
            parent.controller.loadMarkdown(parent.markdown)
        }

        func syncDocumentBaseURLToJavaScript() {
            guard parent.documentBaseURL != lastSyncedDocumentBaseURL else {
                return
            }

            lastSyncedDocumentBaseURL = parent.documentBaseURL
            parent.controller.setDocumentBaseURL(parent.documentBaseURL)
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
            let spellCheckEnabled = parent.presentation.spellCheckEnabled ? "true" : "false"
            let indentWidth = String(parent.presentation.indentWidth)
            let useSpacesForIndent = parent.presentation.useSpacesForIndent ? "true" : "false"
            let hideQuickInsertHint = parent.presentation.hideQuickInsertHint ? "true" : "false"
            let autoPairBracket = parent.presentation.autoPairBracket ? "true" : "false"
            let autoPairMarkdownSyntax = parent.presentation.autoPairMarkdownSyntax ? "true" : "false"
            let autoPairQuote = parent.presentation.autoPairQuote ? "true" : "false"
            let enableTables = parent.presentation.enableTables ? "true" : "false"
            let enableTaskList = parent.presentation.enableTaskList ? "true" : "false"
            let enableStrikethrough = parent.presentation.enableStrikethrough ? "true" : "false"
            let enableFootnotes = parent.presentation.enableFootnotes ? "true" : "false"
            let enableTOC = parent.presentation.enableTOC ? "true" : "false"
            let enableMath = parent.presentation.enableMath ? "true" : "false"
            let enableMermaid = parent.presentation.enableMermaid ? "true" : "false"
            let enableYAMLFrontMatter = parent.presentation.enableYAMLFrontMatter ? "true" : "false"
            let imageRootURL = EditorWebView.javaScriptStringLiteral(for: parent.presentation.imageRootURL)
            let imagePreferDotSlash = parent.presentation.imagePreferDotSlash ? "true" : "false"
            let imageAutoEncodeURL = parent.presentation.imageAutoEncodeURL ? "true" : "false"
            let linkOpenRequiresCommand = parent.presentation.linkOpenRequiresCommand ? "true" : "false"
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
                    spellCheckEnabled: \(spellCheckEnabled),
                    indentWidth: \(indentWidth),
                    useSpacesForIndent: \(useSpacesForIndent),
                    hideQuickInsertHint: \(hideQuickInsertHint),
                    autoPairBracket: \(autoPairBracket),
                    autoPairMarkdownSyntax: \(autoPairMarkdownSyntax),
                    autoPairQuote: \(autoPairQuote),
                    enableTables: \(enableTables),
                    enableTaskList: \(enableTaskList),
                    enableStrikethrough: \(enableStrikethrough),
                    enableFootnotes: \(enableFootnotes),
                    enableTOC: \(enableTOC),
                    enableMath: \(enableMath),
                    enableMermaid: \(enableMermaid),
                    enableYAMLFrontMatter: \(enableYAMLFrontMatter),
                    imageRootURL: \(imageRootURL),
                    imagePreferDotSlash: \(imagePreferDotSlash),
                    imageAutoEncodeURL: \(imageAutoEncodeURL),
                    linkOpenRequiresCommand: \(linkOpenRequiresCommand)
                });
            }
            """

            parent.controller.evaluateJavaScript(script)
        }

        func syncRevealRequestToJavaScript() {
            guard let revealRequest = parent.revealRequest else {
                return
            }

            guard revealRequest.id != lastRevealRequestID else {
                return
            }

            lastRevealRequestID = revealRequest.id
            parent.controller.revealOffset(
                revealRequest.offset,
                length: revealRequest.length
            )
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            NSLog("[EditorWebView] didFinish url=%@", webView.url?.absoluteString ?? "<nil>")
            logRuntimeDiagnostics(in: webView, label: "didFinish")
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

            if message.name == EditorWebView.readyMessageName {
                didReceiveEditorReady = true
                cancelReadyFallback()
                parent.controller.markPageReady()
                syncMarkdownToJavaScript()
                syncDocumentBaseURLToJavaScript()
                syncPresentationToJavaScript()
                syncRevealRequestToJavaScript()
                return
            }

            if message.name == EditorWebView.imageAssetRequestMessageName {
                handleImageAssetRequest(message)
                return
            }

            if message.name == EditorWebView.openLinkMessageName {
                handleOpenLink(message)
                return
            }

            if
                message.name == EditorWebView.consoleMessageName,
                let body = message.body as? [String: Any],
                let level = body["level"] as? String,
                let messageText = body["message"] as? String
            {
                NSLog("[EditorWebView][JS][%@] %@", level.uppercased(), messageText)
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

        private func handleOpenLink(_ message: WKScriptMessage) {
            guard let href = message.body as? String,
                  let url = resolvedEditorLinkURL(for: href)
            else {
                return
            }

            NSWorkspace.shared.open(url)
        }

        private func resolvedEditorLinkURL(for href: String) -> URL? {
            let trimmed = href.trimmingCharacters(in: .whitespacesAndNewlines)

            guard !trimmed.isEmpty else {
                return nil
            }

            if let documentBaseURL = parent.documentBaseURL {
                return URL(string: trimmed, relativeTo: documentBaseURL)?.absoluteURL
            }

            return URL(string: trimmed)
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
            loadInlineFallbackIfNeeded(in: webView)
        }

        func webView(
            _ webView: WKWebView,
            didFailProvisionalNavigation navigation: WKNavigation!,
            withError error: Error
        ) {
            NSLog("[EditorWebView] didFailProvisionalNavigation url=%@ error=%@", webView.url?.absoluteString ?? "<nil>", error.localizedDescription)
            loadInlineFallbackIfNeeded(in: webView)
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            NSLog("[EditorWebView] web content process terminated")
        }

        private static func editorIndexURL() -> URL? {
            EditorRuntimeStager.resolvedIndexURL()
        }

        private func loadInlineFallbackIfNeeded(in webView: WKWebView) {
            guard !didAttemptInlineFallback else {
                return
            }

            guard let indexURL = Self.editorIndexURL(),
                  let inlinedHTML = Self.inlinedEditorHTML(from: indexURL)
            else {
                return
            }

            didAttemptInlineFallback = true
            didReceiveEditorReady = false
            cancelReadyFallback()
            let baseURL = indexURL.deletingLastPathComponent()
            scheduleReadyFallback(for: webView)
            webView.loadHTMLString(inlinedHTML, baseURL: baseURL)
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
                replacement: inlineScript(for: script)
            )

            return renderedHTML
        }

        private static func inlineScript(for script: String) -> String {
            let escapedSource = script
                .replacingOccurrences(of: "</script", with: "<\\/script")

            return """
            <script>
            \(escapedSource)
            </script>
            """
        }

        private func scheduleReadyFallback(for webView: WKWebView) {
            let workItem = DispatchWorkItem { [weak self, weak webView] in
                guard let self, let webView else {
                    return
                }

                guard !self.didReceiveEditorReady else {
                    return
                }

                self.logRuntimeDiagnostics(in: webView, label: "ready-timeout")
                NSLog("[EditorWebView] editor ready timeout, switching to inline fallback")
                self.loadInlineFallbackIfNeeded(in: webView)
            }

            readyFallbackWorkItem = workItem
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.2, execute: workItem)
        }

        private func cancelReadyFallback() {
            readyFallbackWorkItem?.cancel()
            readyFallbackWorkItem = nil
        }

        private func logRuntimeDiagnostics(in webView: WKWebView, label: String) {
            let script = """
            (() => {
                const debugState = window.__editorDebugState ?? null;
                const app = document.querySelector('#app');
                const handlers = window.webkit?.messageHandlers
                    ? Object.keys(window.webkit.messageHandlers)
                    : [];

                return JSON.stringify({
                    label: \(EditorWebView.javaScriptStringLiteral(for: label)),
                    href: window.location.href,
                    readyState: document.readyState,
                    hasAppRoot: !!app,
                    appChildCount: app?.childElementCount ?? 0,
                    appHTML: typeof app?.innerHTML === 'string' ? app.innerHTML.slice(0, 240) : '',
                    loadMarkdownType: typeof window.loadMarkdown,
                    runEditorCommandType: typeof window.runEditorCommand,
                    getEditorStateType: typeof window.getEditorState,
                    setEditorAppearanceType: typeof window.setEditorAppearance,
                    consoleForwardingInstalled: !!window.__editorConsoleForwardingInstalled,
                    handlerNames: handlers,
                    debugState
                });
            })();
            """

            webView.evaluateJavaScript(script) { result, error in
                if let error {
                    NSLog(
                        "[EditorWebView] runtime diagnostics failed label=%@ error=%@",
                        label,
                        error.localizedDescription
                    )
                    return
                }

                guard let json = result as? String else {
                    NSLog("[EditorWebView] runtime diagnostics unavailable label=%@", label)
                    return
                }

                NSLog("[EditorWebView] runtime diagnostics %@", json)
            }
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
