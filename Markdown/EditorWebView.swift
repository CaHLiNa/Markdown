//
//  EditorWebView.swift
//  Markdown
//
//  Created by Codex on 2026/3/7.
//

import SwiftUI
import WebKit

enum EditorWebViewControllerError: LocalizedError, Equatable {
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

struct EditorWebViewEvaluatedValue<Value> {
    let generation: Int
    let value: Value
}

struct EditorReadyMessagePayload: Equatable {
    let generation: Int

    init?(body: Any) {
        guard
            let payload = body as? [String: Any],
            payload["ready"] as? Bool == true,
            let generation = payload["generation"] as? Int,
            generation >= 0
        else {
            return nil
        }

        self.generation = generation
    }
}

struct EditorContentChangedMessagePayload: Equatable {
    let generation: Int
    let markdown: String

    init?(body: Any) {
        guard
            let payload = body as? [String: Any],
            let generation = payload["generation"] as? Int,
            generation >= 0,
            let markdown = payload["markdown"] as? String
        else {
            return nil
        }

        self.generation = generation
        self.markdown = markdown
    }
}

struct EditorWebView: NSViewRepresentable {
    static let contentChangedMessageName = "editorContentChanged"
    static let readyMessageName = "editorReady"
    static let imageAssetRequestMessageName = "editorImageAssetRequest"
    static let openLinkMessageName = "editorOpenLink"
    static let consoleMessageName = "editorConsole"
    static let contextMenuRequestMessageName = "editorContextMenuRequest"

    @Binding var markdown: String
    let controller: Controller
    var documentBaseURL: URL?
    var presentation: Presentation
    var revealRequest: EditorRevealRequest?
    var onContentChanged: ((String) -> Void)?
    var onImageAssetRequest: ((ImageAssetRequest, @escaping (Result<String, Error>) -> Void) -> Void)?
    var onContextMenuCommand: ((EditorCommand) -> Void)?

    init(
        markdown: Binding<String>,
        controller: Controller,
        documentBaseURL: URL? = nil,
        presentation: Presentation = .default,
        revealRequest: EditorRevealRequest? = nil,
        onContentChanged: ((String) -> Void)? = nil,
        onImageAssetRequest: ((ImageAssetRequest, @escaping (Result<String, Error>) -> Void) -> Void)? = nil,
        onContextMenuCommand: ((EditorCommand) -> Void)? = nil
    ) {
        _markdown = markdown
        self.controller = controller
        self.documentBaseURL = documentBaseURL
        self.presentation = presentation
        self.revealRequest = revealRequest
        self.onContentChanged = onContentChanged
        self.onImageAssetRequest = onImageAssetRequest
        self.onContextMenuCommand = onContextMenuCommand
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
        configuration.userContentController.add(context.coordinator, name: Self.contextMenuRequestMessageName)

        let webView = ContextMenuWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.allowsMagnification = false
        webView.setValue(false, forKey: "drawsBackground")
        webView.editorCommandHandler = onContextMenuCommand
        controller.attach(webView: webView)
        context.coordinator.loadLocalEditor(in: webView)
        return webView
    }

    func updateNSView(_ nsView: WKWebView, context: Context) {
        context.coordinator.parent = self
        controller.attach(webView: nsView)
        (nsView as? ContextMenuWebView)?.editorCommandHandler = onContextMenuCommand
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
        nsView.configuration.userContentController.removeScriptMessageHandler(forName: contextMenuRequestMessageName)
        nsView.navigationDelegate = nil
        (nsView as? ContextMenuWebView)?.editorCommandHandler = nil
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

    nonisolated static func javaScriptStringLiteral(for string: String) -> String {
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

        if (target) {
          post('warn', [
            'Resource load failed',
            target.tagName ?? null,
            target.getAttribute?.('src') ?? null,
            target.getAttribute?.('href') ?? null,
            target?.outerHTML ?? null
          ]);
          return;
        }

        post('error', [
          errorEvent.message,
          errorEvent.filename,
          errorEvent.lineno,
          errorEvent.colno,
          errorEvent.error,
        ]);
      }, true);

      window.addEventListener('unhandledrejection', (event) => {
        post('error', ['Unhandled promise rejection', event.reason]);
      });
    })();
    """

    static let contextMenuInterceptionScript = """
    (() => {
      const handler = window.webkit?.messageHandlers?.editorContextMenuRequest;

      if (!handler || window.__editorContextMenuInstalled) {
        return;
      }

      window.__editorContextMenuInstalled = true;

      const editableSelector = [
        '.ProseMirror',
        '.cm-editor',
        '.cm-content',
        '[contenteditable=\"true\"]'
      ].join(', ');

      const resolveElement = (target) => {
        if (target instanceof Element) {
          return target;
        }

        if (target instanceof Node) {
          return target.parentElement;
        }

        return null;
      };

      document.addEventListener('contextmenu', (event) => {
        const element = resolveElement(event.target);

        if (!element || !element.closest(editableSelector)) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        try {
          const result = handler.postMessage({
            clientX: event.clientX,
            clientY: event.clientY
          });

          if (result && typeof result === 'object' && typeof result.catch === 'function') {
            result.catch(() => {});
          }
        } catch {}
      }, true);
    })();
    """

    static func generationBootstrapScript(for generation: Int) -> String {
        """
        window.__editorGeneration = \(max(0, generation));
        """
    }

    static func configureUserScripts(
        in userContentController: WKUserContentController,
        generation: Int
    ) {
        userContentController.removeAllUserScripts()
        userContentController.addUserScript(
            WKUserScript(
                source: consoleForwardingScript,
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true
            )
        )
        userContentController.addUserScript(
            WKUserScript(
                source: contextMenuInterceptionScript,
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true
            )
        )
        userContentController.addUserScript(
            WKUserScript(
                source: generationBootstrapScript(for: generation),
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true
            )
        )
    }

    struct ContextMenuSystemItemDefinition {
        let title: String
        let action: Selector
        let keyEquivalent: String
        let modifiers: NSEvent.ModifierFlags
    }

    struct ContextMenuCommandDefinition {
        let command: EditorCommand
        let title: String
        let keyEquivalent: String
        let modifiers: NSEvent.ModifierFlags
    }

    enum ContextMenuBuilder {
        static let undoSelector = NSSelectorFromString("undo:")
        static let redoSelector = NSSelectorFromString("redo:")
        static let cutSelector = NSSelectorFromString("cut:")
        static let copySelector = NSSelectorFromString("copy:")
        static let pasteSelector = NSSelectorFromString("paste:")
        static let selectAllSelector = NSSelectorFromString("selectAll:")

        static let systemItemGroups: [[ContextMenuSystemItemDefinition]] = [
            [
                .init(title: "撤销", action: undoSelector, keyEquivalent: "z", modifiers: [.command]),
                .init(title: "重做", action: redoSelector, keyEquivalent: "z", modifiers: [.command, .shift]),
            ],
            [
                .init(title: "剪切", action: cutSelector, keyEquivalent: "x", modifiers: [.command]),
                .init(title: "复制", action: copySelector, keyEquivalent: "c", modifiers: [.command]),
                .init(title: "粘贴", action: pasteSelector, keyEquivalent: "v", modifiers: [.command]),
            ],
            [
                .init(title: "全选", action: selectAllSelector, keyEquivalent: "a", modifiers: [.command]),
            ],
        ]

        static let inlineCommandItems: [ContextMenuCommandDefinition] = [
            .init(command: .bold, title: "粗体", keyEquivalent: "b", modifiers: [.command]),
            .init(command: .italic, title: "斜体", keyEquivalent: "i", modifiers: [.command]),
            .init(command: .link, title: "链接", keyEquivalent: "l", modifiers: [.command]),
            .init(command: .inlineCode, title: "行内代码", keyEquivalent: "e", modifiers: [.command]),
        ]

        static let blockCommandItems: [ContextMenuCommandDefinition] = [
            .init(command: .heading1, title: "标题 1", keyEquivalent: "1", modifiers: [.command]),
            .init(command: .heading2, title: "标题 2", keyEquivalent: "2", modifiers: [.command]),
            .init(command: .heading3, title: "标题 3", keyEquivalent: "3", modifiers: [.command]),
            .init(command: .blockquote, title: "引用块", keyEquivalent: "q", modifiers: [.command, .option]),
            .init(command: .bulletList, title: "无序列表", keyEquivalent: "u", modifiers: [.command, .option]),
            .init(command: .orderedList, title: "有序列表", keyEquivalent: "o", modifiers: [.command, .option]),
            .init(command: .taskList, title: "任务列表", keyEquivalent: "x", modifiers: [.command, .option]),
            .init(command: .codeBlock, title: "代码块", keyEquivalent: "c", modifiers: [.command, .option]),
        ]

        static func buildMenu(
            from defaultMenu: NSMenu?,
            commandTarget: AnyObject,
            commandAction: Selector
        ) -> NSMenu {
            let menu = NSMenu(title: "Editor")
            menu.autoenablesItems = true
            menu.allowsContextMenuPlugIns = false
            if #available(macOS 15.2, *) {
                menu.automaticallyInsertsWritingToolsItems = false
            }

            appendSystemEditItems(to: menu, defaultMenu: defaultMenu)
            appendCommandItems(inlineCommandItems, to: menu, commandTarget: commandTarget, commandAction: commandAction)
            appendCommandItems(blockCommandItems, to: menu, commandTarget: commandTarget, commandAction: commandAction)

            return menu
        }

        private static func appendSystemEditItems(to menu: NSMenu, defaultMenu: NSMenu?) {
            for group in systemItemGroups {
                let items = group.compactMap { menuItem(for: $0, in: defaultMenu) }
                appendSection(items, to: menu)
            }
        }

        private static func appendCommandItems(
            _ definitions: [ContextMenuCommandDefinition],
            to menu: NSMenu,
            commandTarget: AnyObject,
            commandAction: Selector
        ) {
            let items = definitions.map { definition -> NSMenuItem in
                let item = NSMenuItem(
                    title: definition.title,
                    action: commandAction,
                    keyEquivalent: definition.keyEquivalent
                )
                item.keyEquivalentModifierMask = definition.modifiers
                item.target = commandTarget
                item.representedObject = definition.command.rawValue
                return item
            }

            appendSection(items, to: menu)
        }

        private static func appendSection(_ items: [NSMenuItem], to menu: NSMenu) {
            guard !items.isEmpty else {
                return
            }

            if !menu.items.isEmpty {
                menu.addItem(.separator())
            }

            items.forEach(menu.addItem(_:))
        }

        private static func menuItem(
            for definition: ContextMenuSystemItemDefinition,
            in defaultMenu: NSMenu?
        ) -> NSMenuItem? {
            if let defaultItem = defaultMenu?.items.first(where: { $0.action == definition.action }) {
                if let copiedItem = defaultItem.copy() as? NSMenuItem {
                    return copiedItem
                }
            }

            let fallbackItem = NSMenuItem(
                title: definition.title,
                action: definition.action,
                keyEquivalent: definition.keyEquivalent
            )
            fallbackItem.keyEquivalentModifierMask = definition.modifiers
            fallbackItem.target = nil
            return fallbackItem
        }
    }

    final class ContextMenuWebView: WKWebView {
        var editorCommandHandler: ((EditorCommand) -> Void)?

        func presentEditorContextMenu(atViewportPoint viewportPoint: CGPoint? = nil) {
            let menu = ContextMenuBuilder.buildMenu(
                from: nil,
                commandTarget: self,
                commandAction: #selector(performEditorContextMenuCommand(_:))
            )

            guard let event = contextMenuEvent(atViewportPoint: viewportPoint) else {
                return
            }

            NSMenu.popUpContextMenu(menu, with: event, for: self)
        }

        override func menu(for event: NSEvent) -> NSMenu? {
            let defaultMenu = super.menu(for: event)
            return ContextMenuBuilder.buildMenu(
                from: defaultMenu,
                commandTarget: self,
                commandAction: #selector(performEditorContextMenuCommand(_:))
            )
        }

        @objc private func performEditorContextMenuCommand(_ sender: NSMenuItem) {
            guard
                let rawValue = sender.representedObject as? String,
                let command = EditorCommand(rawValue: rawValue)
            else {
                return
            }

            editorCommandHandler?(command)
        }

        @objc func undo(_ sender: Any?) {
            editorCommandHandler?(.undo)
        }

        @objc func redo(_ sender: Any?) {
            editorCommandHandler?(.redo)
        }

        private func contextMenuEvent(atViewportPoint viewportPoint: CGPoint?) -> NSEvent? {
            guard let window else {
                return nil
            }

            let locationInWindow: NSPoint

            if let viewportPoint {
                let viewPoint = NSPoint(
                    x: viewportPoint.x,
                    y: bounds.height - viewportPoint.y
                )
                locationInWindow = convert(viewPoint, to: nil)
            } else {
                locationInWindow = window.mouseLocationOutsideOfEventStream
            }

            return NSEvent.mouseEvent(
                with: .rightMouseDown,
                location: locationInWindow,
                modifierFlags: [],
                timestamp: ProcessInfo.processInfo.systemUptime,
                windowNumber: window.windowNumber,
                context: nil,
                eventNumber: 0,
                clickCount: 1,
                pressure: 1
            )
        }
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

    nonisolated struct SynchronizedPageState {
        var markdown: String?
        var documentBaseURL: URL?
        var presentation: Presentation?
        var revealRequestID: UUID?

        mutating func resetForPageLoad() {
            markdown = nil
            documentBaseURL = nil
            presentation = nil
            revealRequestID = nil
        }
    }

    nonisolated struct PageLoadState {
        private(set) var currentGeneration = 0
        private(set) var readyGeneration: Int?

        var isReady: Bool {
            readyGeneration == currentGeneration && currentGeneration > 0
        }

        @discardableResult
        mutating func prepareForPageLoad() -> Int {
            currentGeneration += 1
            readyGeneration = nil
            return currentGeneration
        }

        mutating func resetReadyState() {
            readyGeneration = nil
        }

        @discardableResult
        mutating func markReady(for generation: Int) -> Bool {
            guard generation == currentGeneration else {
                return false
            }

            readyGeneration = generation
            return true
        }

        func acceptsMessage(for generation: Int) -> Bool {
            generation == currentGeneration && readyGeneration == generation
        }
    }

    struct ImageAssetRequest {
        let filename: String
        let mimeType: String
        let data: Data
    }

    // Keep this controller nonisolated so queued callback storage and deinit stay
    // out of global-actor destruction paths; all call sites remain on the UI path.
    nonisolated final class Controller {
        nonisolated private struct ReadyPageContext {
            let webView: WKWebView
            let generation: Int
        }

        nonisolated private struct ReadyWaiter {
            let id: UUID
            let timeoutWorkItem: DispatchWorkItem
            let completion: (Result<ReadyPageContext, Error>) -> Void
        }

        private weak var webView: WKWebView?
        private var pageLoadState = PageLoadState()
        private var pendingScripts: [PendingScript] = []
        private var readyWaiters: [UUID: ReadyWaiter] = [:]

        @MainActor
        func attach(webView: WKWebView) {
            self.webView = webView

            flushPendingScriptsIfPossible()
        }

        @MainActor
        func detach(webView: WKWebView) {
            guard self.webView === webView else {
                return
            }

            self.webView = nil
            pageLoadState.resetReadyState()
            invalidatePendingScripts()
            resolveReadyWaiters(with: .failure(EditorWebViewControllerError.pageNotReady))
        }

        @MainActor
        @discardableResult
        func prepareForPageLoad() -> Int {
            resolveReadyWaiters(with: .failure(EditorWebViewControllerError.pageNotReady))
            invalidatePendingScripts()
            return pageLoadState.prepareForPageLoad()
        }

        @MainActor
        @discardableResult
        func markPageReady(for generation: Int) -> Bool {
            guard pageLoadState.markReady(for: generation) else {
                return false
            }

            flushPendingScriptsIfPossible()
            resolveReadyWaitersWithCurrentWebView()
            return true
        }

        @MainActor
        func acceptsMessage(for generation: Int) -> Bool {
            pageLoadState.acceptsMessage(for: generation)
        }

        @MainActor
        var currentGeneration: Int {
            pageLoadState.currentGeneration
        }

        @MainActor
        var debugIsPageReady: Bool {
            pageLoadState.isReady
        }

        @MainActor
        var debugCurrentGeneration: Int {
            pageLoadState.currentGeneration
        }

        @MainActor
        var debugPendingScriptCount: Int {
            pendingScripts.count
        }

        @MainActor
        func evaluateJavaScript(
            _ javaScript: String,
            completion: ((Result<Any?, Error>) -> Void)? = nil
        ) {
            guard let webView, pageLoadState.isReady else {
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

        @MainActor
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

        @MainActor
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

        @MainActor
        func revealHeading(_ title: String, completion: ((Result<Any?, Error>) -> Void)? = nil) {
            let literal = EditorWebView.javaScriptStringLiteral(for: title)
            let script = """
            if (typeof window.revealHeading === 'function') {
                window.revealHeading(\(literal));
            }
            """
            evaluateJavaScript(script, completion: completion)
        }

        @MainActor
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

        @MainActor
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

        @MainActor
        func currentMarkdown(completion: @escaping (Result<String, Error>) -> Void) {
            let script = """
            (() => {
                if (typeof window.getMarkdown === 'function') {
                    return window.getMarkdown();
                }

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

        @MainActor
        func currentMarkdownStrict(
            completion: @escaping (Result<EditorWebViewEvaluatedValue<String>, Error>) -> Void
        ) {
            let script = """
            (() => {
                if (typeof window.getMarkdown === 'function') {
                    return window.getMarkdown();
                }

                if (typeof window.getEditorState === 'function') {
                    const state = window.getEditorState();
                    return typeof state?.markdown === 'string' ? state.markdown : null;
                }

                return null;
            })();
            """

            withReadyPageContext { [weak self] result in
                guard let self else {
                    completion(.failure(EditorWebViewControllerError.pageNotReady))
                    return
                }

                switch result {
                case .success(let context):
                    self.evaluateJavaScript(script, in: context) { evaluationResult in
                        switch evaluationResult {
                        case .success(let value):
                            guard let markdown = value as? String else {
                                completion(.failure(EditorWebViewControllerError.markdownUnavailable))
                                return
                            }

                            completion(.success(EditorWebViewEvaluatedValue(generation: context.generation, value: markdown)))
                        case .failure(let error):
                            completion(.failure(error))
                        }
                    }
                case .failure(let error):
                    completion(.failure(error))
                }
            }
        }

        @MainActor
        func renderedHTML(completion: @escaping (Result<String, Error>) -> Void) {
            let script = """
            (() => {
                if (typeof window.getRenderedHTML === 'function') {
                    const renderedHTML = window.getRenderedHTML();
                    if (typeof renderedHTML === 'string') {
                        return renderedHTML;
                    }
                }
                return '';
            })();
            """

            evaluateJavaScript(script) { result in
                switch result {
                case .success(let value):
                    guard let html = value as? String else {
                        completion(.failure(EditorWebViewControllerError.renderedContentUnavailable))
                        return
                    }

                    completion(.success(html))
                case .failure(let error):
                    completion(.failure(error))
                }
            }
        }

        @MainActor
        func renderedHTMLStrict(
            completion: @escaping (Result<EditorWebViewEvaluatedValue<String>, Error>) -> Void
        ) {
            let script = """
            (() => {
                if (typeof window.getRenderedHTML === 'function') {
                    const renderedHTML = window.getRenderedHTML();
                    if (typeof renderedHTML === 'string') {
                        return renderedHTML;
                    }
                }
                return '';
            })();
            """

            withReadyPageContext { [weak self] result in
                guard let self else {
                    completion(.failure(EditorWebViewControllerError.pageNotReady))
                    return
                }

                switch result {
                case .success(let context):
                    self.evaluateJavaScript(script, in: context) { evaluationResult in
                        switch evaluationResult {
                        case .success(let value):
                            guard let html = value as? String else {
                                completion(.failure(EditorWebViewControllerError.renderedContentUnavailable))
                                return
                            }

                            completion(.success(EditorWebViewEvaluatedValue(generation: context.generation, value: html)))
                        case .failure(let error):
                            completion(.failure(error))
                        }
                    }
                case .failure(let error):
                    completion(.failure(error))
                }
            }
        }

        @MainActor
        private func flushPendingScriptsIfPossible() {
            guard let webView, pageLoadState.isReady, !pendingScripts.isEmpty else {
                return
            }

            // Move queued scripts out before mutating storage to avoid iterating a
            // view that was invalidated by `removeAll()`.
            var scripts: [PendingScript] = []
            swap(&scripts, &pendingScripts)

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

        @MainActor
        private func evaluateJavaScript(
            _ javaScript: String,
            in context: ReadyPageContext,
            completion: @escaping (Result<Any?, Error>) -> Void
        ) {
            context.webView.evaluateJavaScript(javaScript) { [weak self] result, error in
                guard let self,
                      self.pageLoadState.acceptsMessage(for: context.generation),
                      self.webView === context.webView
                else {
                    completion(.failure(EditorWebViewControllerError.pageNotReady))
                    return
                }

                if let error {
                    completion(.failure(error))
                    return
                }

                completion(.success(result))
            }
        }

        @MainActor
        private func withReadyPageContext(
            timeout: TimeInterval = 1.5,
            expectedGeneration: Int? = nil,
            completion: @escaping (Result<ReadyPageContext, Error>) -> Void
        ) {
            guard let webView else {
                completion(.failure(EditorWebViewControllerError.pageNotReady))
                return
            }

            if let expectedGeneration {
                guard pageLoadState.acceptsMessage(for: expectedGeneration) else {
                    completion(.failure(EditorWebViewControllerError.pageNotReady))
                    return
                }

                completion(.success(ReadyPageContext(webView: webView, generation: expectedGeneration)))
                return
            }

            guard !pageLoadState.isReady else {
                completion(.success(ReadyPageContext(webView: webView, generation: pageLoadState.currentGeneration)))
                return
            }

            guard timeout > 0 else {
                completion(.failure(EditorWebViewControllerError.pageNotReady))
                return
            }

            let waiterID = UUID()
            let timeoutWorkItem = DispatchWorkItem { [weak self] in
                guard let waiter = self?.readyWaiters.removeValue(forKey: waiterID) else {
                    return
                }

                waiter.completion(.failure(EditorWebViewControllerError.pageNotReady))
            }

            readyWaiters[waiterID] = ReadyWaiter(
                id: waiterID,
                timeoutWorkItem: timeoutWorkItem,
                completion: completion
            )
            DispatchQueue.main.asyncAfter(deadline: .now() + timeout, execute: timeoutWorkItem)
        }

        @MainActor
        private func resolveReadyWaitersWithCurrentWebView() {
            guard let webView else {
                resolveReadyWaiters(with: .failure(EditorWebViewControllerError.pageNotReady))
                return
            }

            resolveReadyWaiters(
                with: .success(
                    ReadyPageContext(webView: webView, generation: pageLoadState.currentGeneration)
                )
            )
        }

        @MainActor
        private func resolveReadyWaiters(with result: Result<ReadyPageContext, Error>) {
            guard !readyWaiters.isEmpty else {
                return
            }

            let waiters = Array(readyWaiters.values)
            readyWaiters.removeAll()

            for waiter in waiters {
                waiter.timeoutWorkItem.cancel()
                waiter.completion(result)
            }
        }

        @MainActor
        private func invalidatePendingScripts() {
            guard !pendingScripts.isEmpty else {
                return
            }

            // Move queued scripts out before mutating storage to avoid iterating a
            // view that was invalidated by `removeAll()`.
            var scripts: [PendingScript] = []
            swap(&scripts, &pendingScripts)

            for pendingScript in scripts {
                deliverPendingScriptResult(
                    .failure(EditorWebViewControllerError.pageNotReady),
                    to: pendingScript.completion
                )
            }
        }

        @MainActor
        private func deliverPendingScriptResult(
            _ result: Result<Any?, Error>,
            to completion: ((Result<Any?, Error>) -> Void)?
        ) {
            guard let completion else {
                return
            }

            DispatchQueue.main.async {
                completion(result)
            }
        }
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        private enum PageLoadSource {
            case bundledFile
            case inlineFallback
        }

        var parent: EditorWebView
        private var synchronizedPageState = SynchronizedPageState()
        private var didAttemptInlineFallback = false
        private var didReceiveEditorReady = false
        private var readyFallbackWorkItem: DispatchWorkItem?
        private var pageLoadSource: PageLoadSource = .bundledFile

        init(parent: EditorWebView) {
            self.parent = parent
        }

        func loadLocalEditor(in webView: WKWebView) {
            guard let indexURL = Self.editorIndexURL() else {
                NSLog("[EditorWebView] Missing bundled index.html resource")
                webView.loadHTMLString(Self.missingEditorHTML, baseURL: nil)
                return
            }

            pageLoadSource = .bundledFile
            prepareForPageLoad(in: webView, resetInlineFallbackAttempt: true)
            let readAccessURL = URL(fileURLWithPath: "/", isDirectory: true)
            webView.loadFileURL(indexURL, allowingReadAccessTo: readAccessURL)
        }

        func syncMarkdownToJavaScript() {
            guard parent.markdown != synchronizedPageState.markdown else {
                return
            }

            synchronizedPageState.markdown = parent.markdown
            parent.controller.loadMarkdown(parent.markdown)
        }

        func syncDocumentBaseURLToJavaScript() {
            guard parent.documentBaseURL != synchronizedPageState.documentBaseURL else {
                return
            }

            synchronizedPageState.documentBaseURL = parent.documentBaseURL
            parent.controller.setDocumentBaseURL(parent.documentBaseURL)
        }

        func syncPresentationToJavaScript() {
            guard parent.presentation != synchronizedPageState.presentation else {
                return
            }

            synchronizedPageState.presentation = parent.presentation

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

            guard revealRequest.id != synchronizedPageState.revealRequestID else {
                return
            }

            synchronizedPageState.revealRequestID = revealRequest.id
            parent.controller.revealOffset(
                revealRequest.offset,
                length: revealRequest.length
            )
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            NSLog("[EditorWebView] didStartProvisionalNavigation url=%@", webView.url?.absoluteString ?? "<nil>")
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            NSLog("[EditorWebView] didFinish url=%@", webView.url?.absoluteString ?? "<nil>")
            logRuntimeDiagnostics(in: webView, label: "didFinish")
        }

        func userContentController(
            _ userContentController: WKUserContentController,
            didReceive message: WKScriptMessage
        ) {
            if message.name == EditorWebView.contentChangedMessageName,
               let payload = EditorContentChangedMessagePayload(body: message.body),
               parent.controller.acceptsMessage(for: payload.generation)
            {
                synchronizedPageState.markdown = payload.markdown

                if parent.markdown != payload.markdown {
                    parent.markdown = payload.markdown
                }

                parent.onContentChanged?(payload.markdown)
                return
            }

            if
                message.name == EditorWebView.readyMessageName,
                let payload = EditorReadyMessagePayload(body: message.body)
            {
                didReceiveEditorReady = true
                cancelReadyFallback()
                guard parent.controller.markPageReady(for: payload.generation) else {
                    return
                }
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

            if message.name == EditorWebView.contextMenuRequestMessageName {
                handleContextMenuRequest(message)
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

        private func handleContextMenuRequest(_ message: WKScriptMessage) {
            guard let webView = message.webView as? ContextMenuWebView else {
                return
            }

            let body = message.body as? [String: Any]
            let clientX = body?["clientX"] as? Double
            let clientY = body?["clientY"] as? Double
            let viewportPoint = clientX.flatMap { x in
                clientY.map { y in CGPoint(x: x, y: y) }
            }

            webView.presentEditorContextMenu(atViewportPoint: viewportPoint)
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
            loadLocalEditor(in: webView)
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

            pageLoadSource = .inlineFallback
            didAttemptInlineFallback = true
            prepareForPageLoad(in: webView, resetInlineFallbackAttempt: false)
            let baseURL = indexURL.deletingLastPathComponent()
            webView.loadHTMLString(inlinedHTML, baseURL: baseURL)
        }

        private func prepareForPageLoad(in webView: WKWebView, resetInlineFallbackAttempt: Bool) {
            if resetInlineFallbackAttempt {
                didAttemptInlineFallback = false
            }

            didReceiveEditorReady = false
            synchronizedPageState.resetForPageLoad()
            let generation = parent.controller.prepareForPageLoad()
            EditorWebView.configureUserScripts(
                in: webView.configuration.userContentController,
                generation: generation
            )
            cancelReadyFallback()
            scheduleReadyFallback(for: webView)
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

    nonisolated private struct PendingScript {
        let javaScript: String
        let completion: ((Result<Any?, Error>) -> Void)?
    }
}
