//
//  ContentView.swift
//  Markdown
//
//  Created by Math73SR on 2026/3/7.
//

import AppKit
import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var documentController: EditorDocumentController
    @FocusState private var isTitleFieldFocused: Bool
    @FocusState private var focusedSearchField: SearchField?
    @State private var isRenamingTitle = false
    @State private var titleDraft = ""
    @State private var sourceSelection: TextSelection?

    private enum SearchField: Hashable {
        case query
        case replacement
    }

    private enum Metrics {
        static let sidebarWidth: CGFloat = 286
        static let minWidth: CGFloat = 1080
        static let minHeight: CGFloat = 720
        static let topBarHeight: CGFloat = 38
        static let trafficLightsInset: CGFloat = 84
        static let sidebarMinWidth: CGFloat = 220
        static let sidebarMaxWidth: CGFloat = 420
        static let sidebarInset: CGFloat = 8
        static let segmentedHeight: CGFloat = 32
        static let panelRadius: CGFloat = 10
        static let tabStripHeight: CGFloat = 38
        static let tabCellMinWidth: CGFloat = 84
        static let tabCellMaxWidth: CGFloat = 168
        static let tabAddButtonWidth: CGFloat = 36
        static let editorTopInset: CGFloat = 54
        static let editorLeadingInset: CGFloat = 84
        static let toolbarButtonSize: CGFloat = 28
        static let footerButtonHeight: CGFloat = 34
    }

    private var interfaceStyle: EditorInterfaceStyle {
        documentController.effectiveInterfaceStyle
    }

    private var preferredColorScheme: ColorScheme {
        interfaceStyle == .dark ? .dark : .light
    }

    private var palette: EditorPalette {
        .forTheme(documentController.editorTheme, style: interfaceStyle)
    }

    private var markdownBinding: Binding<String> {
        Binding(
            get: { documentController.currentMarkdown },
            set: { documentController.currentMarkdown = $0 }
        )
    }

    private var isSidebarVisible: Bool {
        documentController.isSidebarVisible && !documentController.isFocusModeEnabled
    }

    private var isEmptyVisualDocument: Bool {
        documentController.editorMode == .wysiwyg &&
            documentController.currentMarkdown.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var displayTitle: String {
        documentController.editableCurrentTitle
    }

    var body: some View {
        ZStack {
            backgroundLayer

            VStack(spacing: 0) {
                chromeBar
                contentArea
            }

            overlayLayer
        }
        .ignoresSafeArea(.container, edges: .top)
        .preferredColorScheme(preferredColorScheme)
        .frame(minWidth: Metrics.minWidth, minHeight: Metrics.minHeight)
        .onAppear {
            titleDraft = displayTitle
        }
        .onChange(of: displayTitle) { _, newValue in
            if !isRenamingTitle {
                titleDraft = newValue
            }
        }
        .onChange(of: isRenamingTitle) { _, isEditing in
            if isEditing {
                titleDraft = displayTitle
                DispatchQueue.main.async {
                    isTitleFieldFocused = true
                }
            }
        }
        .onChange(of: documentController.revealRequest) { _, request in
            applySourceSelection(for: request)
        }
        .onChange(of: documentController.isDocumentSearchPresented) { _, isPresented in
            guard isPresented else {
                focusedSearchField = nil
                return
            }

            DispatchQueue.main.async {
                focusedSearchField = documentController.isDocumentReplacePresented ? .replacement : .query
            }
        }
        .onChange(of: documentController.isDocumentReplacePresented) { _, isPresented in
            guard documentController.isDocumentSearchPresented else {
                return
            }

            DispatchQueue.main.async {
                focusedSearchField = isPresented ? .replacement : .query
            }
        }
    }

    private var backgroundLayer: some View {
        ZStack {
            palette.windowBackground
                .ignoresSafeArea()

            LinearGradient(
                colors: [
                    palette.windowTint,
                    .clear
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()
        }
    }

    @ViewBuilder
    private var overlayLayer: some View {
        if documentController.isCommandPalettePresented {
            CommandOverlayBackdrop {
                documentController.hideCommandPalette()
            } content: {
                CommandPaletteOverlay(
                    query: $documentController.commandPaletteQuery,
                    items: documentController.filteredCommandPaletteItems,
                    palette: palette,
                    onSelect: documentController.performCommandPaletteItem(_:)
                )
            }
        } else if documentController.isQuickOpenPresented {
            CommandOverlayBackdrop {
                documentController.hideQuickOpen()
            } content: {
                QuickOpenOverlay(
                    query: $documentController.quickOpenQuery,
                    files: documentController.filteredQuickOpenFiles,
                    palette: palette,
                    onSelect: documentController.openQuickOpenFile(_:)
                )
            }
        }
    }

    private var chromeBar: some View {
        HStack(spacing: 0) {
            if isSidebarVisible {
                sidebarChromeBar
                    .frame(width: Metrics.sidebarWidth)

                Rectangle()
                    .fill(palette.separator)
                    .frame(width: 1)
            }

            editorChromeBar
        }
        .frame(height: Metrics.topBarHeight)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(palette.separator)
                .frame(height: 1)
        }
    }

    private var sidebarChromeBar: some View {
        HStack(spacing: 0) {
            Color.clear
                .frame(width: Metrics.trafficLightsInset)

            Spacer(minLength: 0)

            chromeButton(
                systemName: "line.3.horizontal",
                title: "切换侧边栏",
                action: documentController.toggleSidebarVisibility
            )
        }
        .padding(.horizontal, 8)
        .background(palette.sidebarTopBarSurface)
    }

    private var editorChromeBar: some View {
        ZStack {
            palette.topBarSurface

            HStack(spacing: 0) {
                if !isSidebarVisible {
                    HStack(spacing: 0) {
                        Color.clear
                            .frame(width: Metrics.trafficLightsInset)

                        chromeButton(
                            systemName: "line.3.horizontal",
                            title: "切换侧边栏",
                            action: documentController.toggleSidebarVisibility
                        )
                    }
                    .padding(.horizontal, 8)
                }

                Spacer(minLength: 0)

                HStack(spacing: 4) {
                    chromeButton(
                        systemName: "doc",
                        title: "保存",
                        action: documentController.saveDocument
                    )

                    Text("\(documentController.characterCount) 字")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(palette.mutedText)
                        .monospacedDigit()
                        .frame(minWidth: 34, alignment: .leading)
                }
                .padding(.trailing, 12)
            }

            HStack(spacing: 6) {
                if isRenamingTitle {
                    TextField("", text: $titleDraft)
                        .textFieldStyle(.plain)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(palette.titleText)
                        .multilineTextAlignment(.center)
                        .frame(width: 220)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(
                            RoundedRectangle(cornerRadius: 6, style: .continuous)
                                .fill(palette.controlSurface)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 6, style: .continuous)
                                .stroke(palette.controlBorder, lineWidth: 1)
                        )
                        .focused($isTitleFieldFocused)
                        .onSubmit(commitTitleRename)
                        .onExitCommand(perform: cancelTitleRename)
                } else {
                    Button(action: beginTitleRename) {
                        Text(displayTitle)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(palette.titleText)
                            .lineLimit(1)
                    }
                    .buttonStyle(.plain)
                }

                if documentController.hasUnsavedChanges {
                    Circle()
                        .fill(palette.accentText)
                        .frame(width: 8, height: 8)
                }
            }
            .padding(.horizontal, 240)
        }
    }

    private var contentArea: some View {
        HStack(spacing: 0) {
            if isSidebarVisible {
                sidebar
                    .frame(width: Metrics.sidebarWidth)

                Rectangle()
                    .fill(palette.separator)
                    .frame(width: 1)
            }

            VStack(spacing: 0) {
                if documentController.isTabStripVisible {
                    tabStrip

                    Rectangle()
                        .fill(palette.separator)
                        .frame(height: 1)
                }

                editorSurface
            }
        }
    }

    private var sidebar: some View {
        VStack(spacing: 0) {
            sidebarHeader
            sidebarContent
        }
        .background(sidebarBackground)
    }

    private var sidebarBackground: some View {
        ZStack {
            palette.sidebarSurface

            LinearGradient(
                colors: [
                    palette.sidebarHighlight,
                    .clear
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        }
    }

    private var sidebarHeader: some View {
        HStack(spacing: 3) {
            ForEach(EditorSidebarPane.allCases) { pane in
                sidebarTabButton(for: pane)
            }
        }
        .padding(2)
        .frame(height: Metrics.segmentedHeight)
        .background(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(palette.segmentedTrack)
        )
        .padding(.horizontal, Metrics.sidebarInset)
        .padding(.top, 8)
        .padding(.bottom, 8)
    }

    private func sidebarTabButton(for pane: EditorSidebarPane) -> some View {
        let isSelected = documentController.sidebarPane == pane

        return Button {
            documentController.sidebarPane = pane
        } label: {
            ZStack {
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(isSelected ? palette.segmentedSelected : .clear)

                Text(pane.rawValue)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(isSelected ? palette.primaryText : palette.secondaryText)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .contentShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
        }
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .contentShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
    }

    private var sidebarContent: some View {
        Group {
            switch documentController.sidebarPane {
            case .files:
                filesPanel
            case .search:
                searchPanel
            case .outline:
                outlinePanel
            }
        }
        .padding(.horizontal, Metrics.sidebarInset)
        .padding(.bottom, Metrics.sidebarInset)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var filesPanel: some View {
        VStack(spacing: 0) {
            Group {
                if documentController.folderFiles.isEmpty {
                    SidebarEmptyStateView(
                        icon: nil,
                        title: "未打开文件夹",
                        subtitle: nil,
                        palette: palette
                    )
                } else {
                    ScrollView(.vertical, showsIndicators: false) {
                        WorkspaceTreeView(
                            nodes: documentController.workspaceTree,
                            depth: 0,
                            selectedFileURL: documentController.currentFileURL,
                            palette: palette,
                            isFolderExpanded: documentController.isFolderExpanded(_:),
                            onToggleFolder: documentController.toggleFolderExpansion(_:),
                            onOpenFile: documentController.openWorkspaceFile(_:)
                        )
                        .padding(.horizontal, 6)
                        .padding(.vertical, 6)
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            Rectangle()
                .fill(palette.separator)
                .frame(height: 1)

            Button {
                documentController.openFolder()
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "folder")
                        .font(.system(size: 12, weight: .medium))

                    Text("打开文件夹")
                        .font(.system(size: 12, weight: .medium))
                }
                .foregroundStyle(palette.secondaryText)
                .frame(maxWidth: .infinity, alignment: .center)
                .frame(height: Metrics.footerButtonHeight)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .background(palette.panelSurface)
        }
        .sidebarPanelStyle(palette: palette)
    }

    private var searchPanel: some View {
        VStack(spacing: 0) {
            VStack(spacing: 8) {
                searchField
                searchOptionsRow
            }
            .padding(.horizontal, 10)
            .padding(.top, 10)
            .padding(.bottom, 8)

            Rectangle()
                .fill(palette.separator)
                .frame(height: 1)

            Group {
                if documentController.folderFiles.isEmpty {
                    SidebarEmptyStateView(
                        icon: nil,
                        title: "未打开文件夹",
                        subtitle: "先打开目录，再搜索内容。",
                        palette: palette
                    )
                } else if documentController.workspaceSearchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    SidebarEmptyStateView(
                        icon: "magnifyingglass",
                        title: "输入关键词搜索内容",
                        subtitle: nil,
                        palette: palette
                    )
                } else if documentController.workspaceSearchResults.isEmpty {
                    SidebarEmptyStateView(
                        icon: "magnifyingglass",
                        title: "没有匹配结果",
                        subtitle: nil,
                        palette: palette
                    )
                } else {
                    ScrollView(.vertical, showsIndicators: false) {
                        VStack(alignment: .leading, spacing: 4) {
                            ForEach(documentController.workspaceSearchResults) { result in
                                Button {
                                    documentController.openWorkspaceSearchResult(result)
                                } label: {
                                    VStack(alignment: .leading, spacing: 4) {
                                        HStack(spacing: 8) {
                                            Text(result.relativePath)
                                                .font(.system(size: 12, weight: .medium))
                                                .foregroundStyle(palette.primaryText)
                                                .lineLimit(1)

                                            Spacer(minLength: 0)

                                            Text("第 \(result.lineNumber) 行 · 列 \(result.columnNumber)")
                                                .font(.system(size: 11, weight: .medium))
                                                .foregroundStyle(palette.mutedText)
                                        }

                                        Text(result.lineText)
                                            .font(.system(size: 12, weight: .regular))
                                            .foregroundStyle(palette.secondaryText)
                                            .lineLimit(2)
                                    }
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 8)
                                    .background(
                                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                                            .fill(palette.rowHover)
                                    )
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal, 6)
                        .padding(.vertical, 6)
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .sidebarPanelStyle(palette: palette)
    }

    private var outlinePanel: some View {
        Group {
            if documentController.outlineItems.isEmpty {
                SidebarEmptyStateView(
                    icon: nil,
                    title: "当前文档没有目录",
                    subtitle: nil,
                    palette: palette
                )
            } else {
                ScrollView(.vertical, showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 2) {
                        ForEach(documentController.outlineItems) { item in
                            Button {
                                documentController.editorMode = .wysiwyg
                                documentController.revealOutlineItem(item)
                            } label: {
                                HStack(spacing: 10) {
                                    Text(item.title)
                                        .font(.system(size: 12, weight: .medium))
                                        .foregroundStyle(palette.secondaryText)
                                        .lineLimit(1)
                                        .padding(.leading, CGFloat(item.level) * 12 + 8)

                                    Spacer(minLength: 0)
                                }
                                .frame(minHeight: 24)
                                .padding(.horizontal, 8)
                                .background(
                                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                                        .fill(palette.rowHover)
                                )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 6)
                    .padding(.vertical, 6)
                }
            }
        }
        .sidebarPanelStyle(palette: palette)
    }

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(palette.mutedText)

            TextField("搜索内容", text: $documentController.workspaceSearchQuery)
                .textFieldStyle(.plain)
                .font(.system(size: 13, weight: .regular))
                .foregroundStyle(palette.primaryText)

            if !documentController.workspaceSearchQuery.isEmpty {
                Button {
                    documentController.workspaceSearchQuery = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(palette.mutedText)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 10)
        .frame(height: 30)
        .background(
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .fill(palette.controlSurface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .stroke(palette.controlBorder, lineWidth: 1)
        )
    }

    private var searchOptionsRow: some View {
        HStack(spacing: 8) {
            Toggle("区分大小写", isOn: $documentController.workspaceSearchCaseSensitive)
                .toggleStyle(.button)

            Toggle("正则", isOn: $documentController.workspaceSearchUseRegularExpression)
                .toggleStyle(.button)

            Spacer(minLength: 0)
        }
        .font(.system(size: 11, weight: .medium))
        .tint(palette.accentText)
    }

    private var tabStrip: some View {
        HStack(spacing: 0) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 0) {
                    ForEach(documentController.tabs) { tab in
                        tabCell(tab)
                    }

                    Spacer(minLength: 0)
                }
            }

            Rectangle()
                .fill(palette.separator)
                .frame(width: 1)

            newTabButton
        }
        .frame(height: Metrics.tabStripHeight)
        .background(palette.editorChrome)
    }

    private func tabCell(_ tab: EditorTab) -> some View {
        let isActive = tab.id == documentController.activeTabID

        return HStack(spacing: 6) {
            Text(tab.compactTitle())
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(isActive ? palette.primaryText : palette.secondaryText)
                .lineLimit(1)
                .truncationMode(.middle)
                .frame(minWidth: 0, maxWidth: .infinity, alignment: .leading)

            if tab.isDirty {
                Circle()
                    .fill(palette.accentText)
                    .frame(width: 6, height: 6)
            }

            Button {
                documentController.closeTab(id: tab.id)
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(palette.mutedText)
            }
            .buttonStyle(.plain)
            .opacity(isActive ? 1 : 0.7)
        }
        .padding(.horizontal, 12)
        .frame(minWidth: Metrics.tabCellMinWidth, maxWidth: Metrics.tabCellMaxWidth)
        .frame(height: Metrics.tabStripHeight)
        .background(isActive ? palette.activeTabSurface : .clear)
        .overlay(alignment: .trailing) {
            Rectangle()
                .fill(palette.separator)
                .frame(width: 1)
        }
        .contentShape(Rectangle())
        .onTapGesture {
            documentController.selectTab(tab.id)
        }
    }

    private var newTabButton: some View {
        Button {
            documentController.createUntitledDocument()
        } label: {
            Image(systemName: "plus")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(palette.secondaryText)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .buttonStyle(.plain)
        .frame(width: Metrics.tabAddButtonWidth, height: Metrics.tabStripHeight)
        .background(palette.editorChrome)
        .contentShape(Rectangle())
        .help("新建标签页")
    }

    private var editorSurface: some View {
        ZStack(alignment: .topLeading) {
            palette.editorSurface
                .ignoresSafeArea()

            EditorWebView(
                markdown: markdownBinding,
                controller: documentController.editorController,
                presentation: documentController.currentPresentation,
                revealRequest: documentController.revealRequest,
                onImageAssetRequest: documentController.persistImageAsset
            )
            .opacity(documentController.editorMode == .wysiwyg ? 1 : 0.0001)
            .allowsHitTesting(documentController.editorMode == .wysiwyg)

            if documentController.editorMode == .sourceView {
                TextEditor(text: markdownBinding, selection: $sourceSelection)
                    .font(.system(size: 15, weight: .regular, design: .monospaced))
                    .foregroundStyle(palette.primaryText)
                    .scrollContentBackground(.hidden)
                    .padding(.horizontal, Metrics.editorLeadingInset)
                    .padding(.vertical, 32)
                    .background(palette.editorSurface)
            }

            if isEmptyVisualDocument {
                EmptyEditorHintView(palette: palette)
                    .padding(.leading, Metrics.editorLeadingInset)
                    .padding(.top, Metrics.editorTopInset)
                    .allowsHitTesting(false)
            }

            if documentController.isDocumentSearchPresented {
                VStack {
                    HStack {
                        Spacer(minLength: 0)
                        documentSearchOverlay
                    }
                    Spacer(minLength: 0)
                }
                .padding(.top, 16)
                .padding(.trailing, 18)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var documentSearchOverlay: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(palette.mutedText)

                TextField("查找", text: $documentController.documentSearchQuery)
                    .textFieldStyle(.plain)
                    .font(.system(size: 13, weight: .regular))
                    .foregroundStyle(palette.primaryText)
                    .focused($focusedSearchField, equals: .query)
                    .onSubmit(documentController.selectNextDocumentSearchMatch)

                Text(documentController.documentSearchStatusText)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(
                        documentController.documentSearchErrorDescription == nil
                            ? palette.mutedText
                            : Color.red.opacity(0.8)
                    )
                    .lineLimit(1)

                overlayIconButton(systemName: "chevron.up", title: "上一个匹配") {
                    documentController.selectPreviousDocumentSearchMatch()
                }
                .disabled(!documentController.canNavigateDocumentSearchMatches)

                overlayIconButton(systemName: "chevron.down", title: "下一个匹配") {
                    documentController.selectNextDocumentSearchMatch()
                }
                .disabled(!documentController.canNavigateDocumentSearchMatches)

                overlayIconButton(
                    systemName: documentController.isDocumentReplacePresented ? "rectangle.compress.vertical" : "rectangle.expand.vertical",
                    title: documentController.isDocumentReplacePresented ? "收起替换栏" : "展开替换栏"
                ) {
                    if documentController.isDocumentReplacePresented {
                        documentController.toggleDocumentReplacePresentation()
                    } else {
                        documentController.showDocumentSearch(replacing: true)
                    }
                }

                overlayIconButton(systemName: "xmark", title: "关闭查找") {
                    documentController.hideDocumentSearch()
                }
            }

            if documentController.isDocumentReplacePresented {
                HStack(spacing: 8) {
                    Image(systemName: "arrow.triangle.swap")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(palette.mutedText)

                    TextField("替换", text: $documentController.documentSearchReplacement)
                        .textFieldStyle(.plain)
                        .font(.system(size: 13, weight: .regular))
                        .foregroundStyle(palette.primaryText)
                        .focused($focusedSearchField, equals: .replacement)
                        .onSubmit(documentController.replaceCurrentDocumentSearchMatch)

                    overlayTextButton("替换") {
                        documentController.replaceCurrentDocumentSearchMatch()
                    }
                    .disabled(!documentController.canReplaceCurrentDocumentSearchMatch)

                    overlayTextButton("全部替换") {
                        documentController.replaceAllDocumentSearchMatches()
                    }
                    .disabled(documentController.documentSearchResults.isEmpty)
                }
            }

            HStack(spacing: 8) {
                Toggle("区分大小写", isOn: $documentController.documentSearchCaseSensitive)
                    .toggleStyle(.button)

                Toggle("正则", isOn: $documentController.documentSearchUseRegularExpression)
                    .toggleStyle(.button)

                Spacer(minLength: 0)
            }
            .font(.system(size: 11, weight: .medium))
            .tint(palette.accentText)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .frame(width: 360)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(palette.panelSurface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(palette.controlBorder, lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.08), radius: 20, x: 0, y: 10)
        .onExitCommand(perform: documentController.hideDocumentSearch)
    }

    private func chromeButton(systemName: String, title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(palette.secondaryText)
                .frame(width: Metrics.toolbarButtonSize, height: Metrics.toolbarButtonSize)
                .background(
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .fill(Color.clear)
                )
        }
        .buttonStyle(.plain)
        .help(title)
    }

    private func overlayIconButton(
        systemName: String,
        title: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(palette.secondaryText)
                .frame(width: 24, height: 24)
                .background(
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .fill(palette.controlSurface)
                )
        }
        .buttonStyle(.plain)
        .help(title)
    }

    private func overlayTextButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button(title, action: action)
            .buttonStyle(.plain)
            .font(.system(size: 11, weight: .medium))
            .foregroundStyle(palette.secondaryText)
            .padding(.horizontal, 10)
            .frame(height: 24)
            .background(
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(palette.controlSurface)
            )
    }

    private func beginTitleRename() {
        titleDraft = displayTitle
        isRenamingTitle = true
    }

    private func commitTitleRename() {
        documentController.renameCurrentDocument(to: titleDraft)
        isRenamingTitle = false
        titleDraft = displayTitle
    }

    private func cancelTitleRename() {
        isRenamingTitle = false
        titleDraft = displayTitle
    }

    private func applySourceSelection(for request: EditorRevealRequest?) {
        guard let request else {
            return
        }

        let markdown = documentController.currentMarkdown
        let clampedOffset = max(0, min(request.offset, markdown.count))
        let maxLength = markdown.count - clampedOffset
        let clampedLength = max(0, min(request.length, maxLength))
        let startIndex = markdown.index(markdown.startIndex, offsetBy: clampedOffset)
        let endIndex = markdown.index(startIndex, offsetBy: clampedLength)

        sourceSelection = TextSelection(range: startIndex..<endIndex)
    }
}

#Preview {
    ContentView()
        .environmentObject(EditorDocumentController())
}

private struct EditorPalette {
    let windowBackground: Color
    let windowTint: Color
    let sidebarTopBarSurface: Color
    let topBarSurface: Color
    let sidebarSurface: Color
    let sidebarHighlight: Color
    let panelSurface: Color
    let editorChrome: Color
    let editorSurface: Color
    let controlSurface: Color
    let controlBorder: Color
    let segmentedTrack: Color
    let segmentedSelected: Color
    let activeTabSurface: Color
    let rowHover: Color
    let separator: Color
    let primaryText: Color
    let secondaryText: Color
    let mutedText: Color
    let titleText: Color
    let accentText: Color
    let emptyStateText: Color

    static func forTheme(_ theme: EditorTheme, style: EditorInterfaceStyle) -> EditorPalette {
        _ = theme

        switch style {
        case .dark:
            return EditorPalette(
                windowBackground: Color(hex: 0x1D1D1F),
                windowTint: Color(hex: 0xFFFFFF, alpha: 0.02),
                sidebarTopBarSurface: Color(hex: 0x2A2A2C, alpha: 0.92),
                topBarSurface: Color(hex: 0x262628, alpha: 0.86),
                sidebarSurface: Color(hex: 0x2A2A2C, alpha: 0.92),
                sidebarHighlight: Color.white.opacity(0.01),
                panelSurface: Color(hex: 0x1F1F21, alpha: 0.84),
                editorChrome: Color(hex: 0x2A2A2C),
                editorSurface: Color(hex: 0x1D1D1F),
                controlSurface: Color(hex: 0x333336),
                controlBorder: Color.white.opacity(0.08),
                segmentedTrack: Color(hex: 0x3A3A3C),
                segmentedSelected: Color(hex: 0x1D1D1F),
                activeTabSurface: Color(hex: 0x1D1D1F),
                rowHover: Color.white.opacity(0.06),
                separator: Color.white.opacity(0.08),
                primaryText: Color.white.opacity(0.85),
                secondaryText: Color.white.opacity(0.55),
                mutedText: Color.white.opacity(0.35),
                titleText: Color.white.opacity(0.85),
                accentText: Color(hex: 0x0A84FF),
                emptyStateText: Color.white.opacity(0.35)
            )
        case .light:
            return EditorPalette(
                windowBackground: Color(hex: 0xFFFFFF),
                windowTint: Color(hex: 0x000000, alpha: 0.02),
                sidebarTopBarSurface: Color(hex: 0xF6F6F6, alpha: 0.92),
                topBarSurface: Color(hex: 0xFFFFFF, alpha: 0.86),
                sidebarSurface: Color(hex: 0xF6F6F6, alpha: 0.92),
                sidebarHighlight: Color.white.opacity(0.2),
                panelSurface: Color.white.opacity(0.82),
                editorChrome: Color(hex: 0xF5F5F7),
                editorSurface: Color.white,
                controlSurface: Color.white,
                controlBorder: Color.black.opacity(0.08),
                segmentedTrack: Color(hex: 0xE8E8ED),
                segmentedSelected: Color.white,
                activeTabSurface: Color.white,
                rowHover: Color.black.opacity(0.04),
                separator: Color.black.opacity(0.08),
                primaryText: Color.black.opacity(0.85),
                secondaryText: Color.black.opacity(0.55),
                mutedText: Color.black.opacity(0.35),
                titleText: Color.black.opacity(0.85),
                accentText: Color(hex: 0x007AFF),
                emptyStateText: Color.black.opacity(0.35)
            )
        }
    }
}

private struct SidebarEmptyStateView: View {
    let icon: String?
    let title: String
    let subtitle: String?
    let palette: EditorPalette

    var body: some View {
        VStack(spacing: 10) {
            Spacer(minLength: 0)

            if let icon {
                Image(systemName: icon)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(palette.mutedText)
            }

            Text(title)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(palette.emptyStateText)

            if let subtitle {
                Text(subtitle)
                    .font(.system(size: 12, weight: .regular))
                    .foregroundStyle(palette.mutedText)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 28)
            }

            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

private struct EmptyEditorHintView: View {
    let palette: EditorPalette

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("开始写作")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(palette.primaryText)

            Text("输入内容，或在新行输入 @ 快速插入表格、代码块、任务列表等结构。")
                .font(.system(size: 12, weight: .regular))
                .foregroundStyle(palette.secondaryText)
                .frame(maxWidth: 320, alignment: .leading)
        }
    }
}

private struct CommandOverlayBackdrop<Content: View>: View {
    let onDismiss: () -> Void
    @ViewBuilder let content: Content

    var body: some View {
        ZStack {
            Color.black.opacity(0.16)
                .ignoresSafeArea()
                .onTapGesture(perform: onDismiss)

            content
        }
    }
}

private struct CommandPaletteOverlay: View {
    @Binding var query: String
    let items: [EditorCommandPaletteItem]
    let palette: EditorPalette
    let onSelect: (EditorCommandPaletteItem) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            TextField("搜索命令", text: $query)
                .textFieldStyle(.plain)
                .font(.system(size: 13, weight: .regular))
                .padding(.horizontal, 12)
                .frame(height: 36)
                .background(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(palette.controlSurface)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .stroke(palette.controlBorder, lineWidth: 1)
                )

            ScrollView {
                VStack(spacing: 6) {
                    ForEach(items) { item in
                        Button {
                            onSelect(item)
                        } label: {
                            HStack(spacing: 10) {
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(item.title)
                                        .font(.system(size: 13, weight: .medium))
                                        .foregroundStyle(palette.primaryText)

                                    Text(item.category)
                                        .font(.system(size: 11, weight: .medium))
                                        .foregroundStyle(palette.mutedText)
                                }

                                Spacer(minLength: 0)
                            }
                            .padding(.horizontal, 12)
                            .padding(.vertical, 10)
                            .background(
                                RoundedRectangle(cornerRadius: 8, style: .continuous)
                                    .fill(palette.rowHover)
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .frame(maxHeight: 320)
        }
        .padding(14)
        .frame(width: 480)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(palette.panelSurface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(palette.controlBorder, lineWidth: 1)
        )
    }
}

private struct QuickOpenOverlay: View {
    @Binding var query: String
    let files: [EditorWorkspaceFile]
    let palette: EditorPalette
    let onSelect: (EditorWorkspaceFile) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            TextField("快速打开", text: $query)
                .textFieldStyle(.plain)
                .font(.system(size: 13, weight: .regular))
                .padding(.horizontal, 12)
                .frame(height: 36)
                .background(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(palette.controlSurface)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .stroke(palette.controlBorder, lineWidth: 1)
                )

            ScrollView {
                VStack(spacing: 6) {
                    ForEach(files.prefix(40)) { file in
                        Button {
                            onSelect(file)
                        } label: {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(file.displayName)
                                    .font(.system(size: 13, weight: .medium))
                                    .foregroundStyle(palette.primaryText)

                                Text(file.relativePath)
                                    .font(.system(size: 11, weight: .regular))
                                    .foregroundStyle(palette.mutedText)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 10)
                            .background(
                                RoundedRectangle(cornerRadius: 8, style: .continuous)
                                    .fill(palette.rowHover)
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .frame(maxHeight: 320)
        }
        .padding(14)
        .frame(width: 520)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(palette.panelSurface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(palette.controlBorder, lineWidth: 1)
        )
    }
}

private struct WorkspaceTreeView: View {
    let nodes: [EditorWorkspaceNode]
    let depth: Int
    let selectedFileURL: URL?
    let palette: EditorPalette
    let isFolderExpanded: (String) -> Bool
    let onToggleFolder: (String) -> Void
    let onOpenFile: (EditorWorkspaceFile) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            ForEach(nodes) { node in
                WorkspaceTreeRow(
                    node: node,
                    depth: depth,
                    selectedFileURL: selectedFileURL,
                    palette: palette,
                    isFolderExpanded: isFolderExpanded,
                    onToggleFolder: onToggleFolder,
                    onOpenFile: onOpenFile
                )
            }
        }
    }
}

private struct WorkspaceTreeRow: View {
    let node: EditorWorkspaceNode
    let depth: Int
    let selectedFileURL: URL?
    let palette: EditorPalette
    let isFolderExpanded: (String) -> Bool
    let onToggleFolder: (String) -> Void
    let onOpenFile: (EditorWorkspaceFile) -> Void

    private var indentation: CGFloat {
        CGFloat(depth * 14 + 10)
    }

    private var isSelected: Bool {
        guard let selectedFileURL, let nodeURL = node.url else {
            return false
        }

        return selectedFileURL.standardizedFileURL == nodeURL.standardizedFileURL
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            if node.isFolder {
                folderRow

                if isFolderExpanded(node.id) {
                    WorkspaceTreeView(
                        nodes: node.children,
                        depth: depth + 1,
                        selectedFileURL: selectedFileURL,
                        palette: palette,
                        isFolderExpanded: isFolderExpanded,
                        onToggleFolder: onToggleFolder,
                        onOpenFile: onOpenFile
                    )
                }
            } else if let url = node.url {
                fileRow(url: url)
            }
        }
    }

    private var folderRow: some View {
        Button {
            onToggleFolder(node.id)
        } label: {
            HStack(spacing: 8) {
                Image(systemName: isFolderExpanded(node.id) ? "chevron.down" : "chevron.right")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(palette.mutedText)
                    .frame(width: 10)

                Image(systemName: "folder")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(palette.secondaryText)

                Text(node.name)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(palette.secondaryText)
                    .lineLimit(1)

                Spacer(minLength: 0)
            }
            .padding(.leading, indentation)
            .padding(.trailing, 10)
            .frame(minHeight: 26)
            .background(
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(isFolderExpanded(node.id) ? palette.rowHover : .clear)
            )
        }
        .buttonStyle(.plain)
    }

    private func fileRow(url: URL) -> some View {
        Button {
            onOpenFile(EditorWorkspaceFile(url: url, relativePath: node.relativePath))
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "doc")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(isSelected ? palette.primaryText : palette.mutedText)

                Text(node.name)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(isSelected ? palette.primaryText : palette.secondaryText)
                    .lineLimit(1)

                Spacer(minLength: 0)
            }
            .padding(.leading, indentation + 18)
            .padding(.trailing, 10)
            .frame(minHeight: 26)
            .background(
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(isSelected ? palette.rowHover : .clear)
            )
        }
        .buttonStyle(.plain)
    }
}

private struct SidebarPanelModifier: ViewModifier {
    let palette: EditorPalette

    func body(content: Content) -> some View {
        content
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(palette.panelSurface)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .stroke(palette.controlBorder, lineWidth: 1)
            )
    }
}

private extension View {
    func sidebarPanelStyle(palette: EditorPalette) -> some View {
        modifier(SidebarPanelModifier(palette: palette))
    }
}

private extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xff) / 255,
            green: Double((hex >> 8) & 0xff) / 255,
            blue: Double(hex & 0xff) / 255,
            opacity: alpha
        )
    }
}
