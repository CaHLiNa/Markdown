//
//  ContentView.swift
//  Markdown
//
//  Created by Math73SR on 2026/3/7.
//

import AppKit
import SwiftUI
import UniformTypeIdentifiers

struct ContentView: View {
    @EnvironmentObject private var documentController: EditorDocumentController
    @FocusState private var isTitleFieldFocused: Bool
    @FocusState private var focusedSearchField: SearchField?
    @State private var isRenamingTitle = false
    @State private var titleDraft = ""
    @State private var outlineExpansionOverrides: [String: Bool] = [:]

    private enum SearchField: Hashable {
        case query
        case replacement
    }

    private struct OutlineEntry: Identifiable {
        let item: EditorOutlineItem
        let hasChildren: Bool

        var id: String { item.id }
    }

    private struct LayoutMetrics {
        let sidebarWidth: CGFloat
        let minWidth: CGFloat
        let minHeight: CGFloat
        let topBarHeight: CGFloat
        let trafficLightsInset: CGFloat
        let sidebarInset: CGFloat
        let segmentedHeight: CGFloat
        let tabStripHeight: CGFloat
        let tabCellMinWidth: CGFloat
        let tabCellMaxWidth: CGFloat
        let tabListButtonWidth: CGFloat
        let tabAddButtonWidth: CGFloat
        let toolbarButtonSize: CGFloat
        let footerButtonHeight: CGFloat

        static let standard = LayoutMetrics(
            sidebarWidth: 286,
            minWidth: 1080,
            minHeight: 720,
            topBarHeight: 38,
            trafficLightsInset: 84,
            sidebarInset: 8,
            segmentedHeight: 32,
            tabStripHeight: 38,
            tabCellMinWidth: 84,
            tabCellMaxWidth: 168,
            tabListButtonWidth: 34,
            tabAddButtonWidth: 36,
            toolbarButtonSize: 28,
            footerButtonHeight: 34
        )

        static let compact = LayoutMetrics(
            sidebarWidth: 268,
            minWidth: 1040,
            minHeight: 700,
            topBarHeight: 34,
            trafficLightsInset: 80,
            sidebarInset: 7,
            segmentedHeight: 30,
            tabStripHeight: 34,
            tabCellMinWidth: 78,
            tabCellMaxWidth: 156,
            tabListButtonWidth: 32,
            tabAddButtonWidth: 34,
            toolbarButtonSize: 26,
            footerButtonHeight: 32
        )
    }

    private var interfaceStyle: EditorInterfaceStyle {
        documentController.effectiveInterfaceStyle
    }

    private var preferredColorScheme: ColorScheme {
        interfaceStyle == .dark ? .dark : .light
    }

    private var palette: EditorPalette {
        .forStyle(interfaceStyle)
    }

    private var metrics: LayoutMetrics {
        documentController.interfaceDensity == .compact ? .compact : .standard
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
        .frame(minWidth: metrics.minWidth, minHeight: metrics.minHeight)
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
                    .frame(width: metrics.sidebarWidth)

                Rectangle()
                    .fill(palette.separator)
                    .frame(width: 1)
            }

            editorChromeBar
        }
        .frame(height: metrics.topBarHeight)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(palette.separator)
                .frame(height: 1)
        }
    }

    private var sidebarChromeBar: some View {
        HStack(spacing: 0) {
            Color.clear
                .frame(width: metrics.trafficLightsInset)

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
                            .frame(width: metrics.trafficLightsInset)

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

                    if documentController.alwaysShowWordCount {
                        Text("\(documentController.characterCount) 字")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(palette.mutedText)
                            .monospacedDigit()
                            .frame(minWidth: 34, alignment: .leading)
                    }
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
                        .disabled(!documentController.hasOpenTab)
                } else {
                    Group {
                        if documentController.hasOpenTab {
                            Button(action: beginTitleRename) {
                                Text(displayTitle)
                                    .font(.system(size: 13, weight: .medium))
                                    .foregroundStyle(palette.titleText)
                                    .lineLimit(1)
                            }
                            .buttonStyle(.plain)
                        } else {
                            Text(displayTitle)
                                .font(.system(size: 13, weight: .medium))
                                .foregroundStyle(palette.titleText)
                                .lineLimit(1)
                        }
                    }
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
                    .frame(width: metrics.sidebarWidth)

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
        .frame(height: metrics.segmentedHeight)
        .background(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(palette.segmentedTrack)
        )
        .padding(.horizontal, metrics.sidebarInset)
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
        .padding(.horizontal, metrics.sidebarInset)
        .padding(.bottom, metrics.sidebarInset)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var filesPanel: some View {
        VStack(spacing: 0) {
            Group {
                if let workspaceURL = documentController.folderURL {
                    if documentController.workspaceTree.isEmpty {
                        SidebarEmptyStateView(
                            icon: "folder",
                            title: "当前工作区没有 Markdown 文件",
                            subtitle: "右键空白区域，或使用下方按钮创建文件/文件夹。",
                            palette: palette
                        )
                        .contextMenu {
                            workspaceBlankContextMenu(for: workspaceURL)
                        }
                        .onDrop(of: [WorkspaceTreeDragPayload.type], isTargeted: nil) { providers in
                            handleWorkspaceDrop(providers, destinationDirectoryURL: workspaceURL)
                        }
                    } else {
                        ScrollView(.vertical, showsIndicators: false) {
                            WorkspaceTreeView(
                                nodes: documentController.workspaceTree,
                                depth: 0,
                                selectedFileURL: documentController.currentFileURL,
                                palette: palette,
                                selectedWorkspaceItemIDs: documentController.selectedWorkspaceItemIDs,
                                expandedFolderIDs: documentController.expandedFolderIDs,
                                forceExpandFolders: !documentController.workspaceSearchQuery
                                    .trimmingCharacters(in: .whitespacesAndNewlines)
                                    .isEmpty,
                                onToggleFolder: documentController.toggleFolderExpansion(_:),
                                onPrimaryAction: documentController.performWorkspacePrimaryAction(for:modifierFlags:),
                                onCreateFile: documentController.createWorkspaceFile(in:),
                                onCreateFolder: documentController.createWorkspaceFolder(in:),
                                onRenameItem: documentController.renameWorkspaceItem(at:),
                                onDeleteItem: documentController.deleteWorkspaceItem(at:),
                                onRevealItem: documentController.revealWorkspaceItemInFinder,
                                dragItemURLs: documentController.workspaceDragItemURLs(from:),
                                onMoveItems: documentController.moveWorkspaceItems(_:to:)
                            )
                            .padding(.horizontal, 6)
                            .padding(.vertical, 6)
                        }
                        .contextMenu {
                            workspaceBlankContextMenu(for: workspaceURL)
                        }
                        .onDrop(of: [WorkspaceTreeDragPayload.type], isTargeted: nil) { providers in
                            handleWorkspaceDrop(providers, destinationDirectoryURL: workspaceURL)
                        }
                    }
                } else {
                    SidebarEmptyStateView(
                        icon: nil,
                        title: "未打开文件夹",
                        subtitle: nil,
                        palette: palette
                    )
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
                .frame(height: metrics.footerButtonHeight)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .background(palette.panelSurface)
        }
        .sidebarPanelStyle(palette: palette)
    }

    @ViewBuilder
    private func workspaceBlankContextMenu(for workspaceURL: URL) -> some View {
        Button("新建文件") {
            documentController.createWorkspaceFile(in: workspaceURL)
        }

        Button("新建文件夹") {
            documentController.createWorkspaceFolder(in: workspaceURL)
        }

        Divider()

        Button("在 Finder 中显示") {
            documentController.revealWorkspaceItemInFinder(workspaceURL)
        }
    }

    private func handleWorkspaceDrop(_ providers: [NSItemProvider], destinationDirectoryURL: URL) -> Bool {
        guard providers.contains(where: { $0.hasItemConformingToTypeIdentifier(WorkspaceTreeDragPayload.type.identifier) }) else {
            return false
        }

        WorkspaceTreeDragPayload.loadItemURLs(from: providers) { itemURLs in
            guard !itemURLs.isEmpty else {
                return
            }

            documentController.moveWorkspaceItems(itemURLs, to: destinationDirectoryURL)
        }
        return true
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
                } else if let errorDescription = documentController.workspaceSearchErrorDescription {
                    SidebarEmptyStateView(
                        icon: "exclamationmark.circle",
                        title: "搜索表达式有误",
                        subtitle: errorDescription,
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
                    VStack(alignment: .leading, spacing: 1) {
                        ForEach(visibleOutlineEntries) { entry in
                            outlineRow(entry)
                        }
                    }
                    .padding(.horizontal, 6)
                    .padding(.vertical, 6)
                }
                .onChange(of: documentController.outlineItems.map(\.id)) { _, ids in
                    outlineExpansionOverrides = outlineExpansionOverrides.filter { ids.contains($0.key) }
                }
            }
        }
        .sidebarPanelStyle(palette: palette)
    }

    private var visibleOutlineEntries: [OutlineEntry] {
        let items = documentController.outlineItems
        var entries: [OutlineEntry] = []
        var collapsedAncestorLevels: [Int] = []

        for (index, item) in items.enumerated() {
            while let lastLevel = collapsedAncestorLevels.last, lastLevel >= item.level {
                collapsedAncestorLevels.removeLast()
            }

            let hasChildren = outlineItemHasChildren(at: index, in: items)
            let isHiddenByAncestor = !collapsedAncestorLevels.isEmpty

            if !isHiddenByAncestor {
                entries.append(
                    OutlineEntry(
                        item: item,
                        hasChildren: hasChildren
                    )
                )
            }

            if hasChildren && !isOutlineItemExpanded(item) {
                collapsedAncestorLevels.append(item.level)
            }
        }

        return entries
    }

    private func outlineRow(_ entry: OutlineEntry) -> some View {
        let item = entry.item
        let leadingInset = CGFloat(max(0, item.level - outlineBaseLevel)) * 14

        return HStack(spacing: 6) {
            Button {
                if entry.hasChildren {
                    toggleOutlineExpansion(for: item)
                }
            } label: {
                Image(systemName: isOutlineItemExpanded(item) ? "chevron.down" : "chevron.right")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(entry.hasChildren ? palette.mutedText : .clear)
                    .frame(width: 12, height: 12)
            }
            .buttonStyle(.plain)
            .disabled(!entry.hasChildren)

            Button {
                documentController.revealOutlineItem(item)
            } label: {
                HStack(spacing: 0) {
                    Text(item.title)
                        .font(outlineTitleFont(for: item.level))
                        .foregroundStyle(outlineTitleColor(for: item.level))
                        .lineLimit(1)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    Spacer(minLength: 0)
                }
                .frame(minHeight: 28)
                .padding(.leading, leadingInset)
                .padding(.trailing, 10)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .padding(.vertical, item.level == outlineBaseLevel ? 2 : 0)
    }

    private func outlineItemHasChildren(at index: Int, in items: [EditorOutlineItem]) -> Bool {
        let currentLevel = items[index].level
        let nextIndex = index + 1

        guard nextIndex < items.count else {
            return false
        }

        return items[nextIndex].level > currentLevel
    }

    private var outlineBaseLevel: Int {
        documentController.outlineItems.map(\.level).min() ?? 1
    }

    private func isOutlineItemExpanded(_ item: EditorOutlineItem) -> Bool {
        outlineExpansionOverrides[item.id] ?? defaultOutlineExpanded(for: item)
    }

    private func defaultOutlineExpanded(for item: EditorOutlineItem) -> Bool {
        switch documentController.outlineVisibilityMode {
        case .expanded:
            return true
        case .collapseToLevel1:
            return false
        case .collapseToLevel2:
            return item.level == outlineBaseLevel
        }
    }

    private func toggleOutlineExpansion(for item: EditorOutlineItem) {
        let items = documentController.outlineItems

        guard let itemIndex = outlineIndex(for: item, in: items) else {
            return
        }

        if isOutlineItemExpanded(item) {
            outlineExpansionOverrides[item.id] = false
            collapseOutlineDescendants(of: item, in: items)
            return
        }

        let parentID = outlineParentID(for: itemIndex, in: items)

        for siblingIndex in items.indices where siblingIndex != itemIndex {
            let sibling = items[siblingIndex]

            guard sibling.level == item.level else {
                continue
            }

            guard outlineParentID(for: siblingIndex, in: items) == parentID else {
                continue
            }

            outlineExpansionOverrides[sibling.id] = false
            collapseOutlineDescendants(of: sibling, in: items)
        }

        outlineExpansionOverrides[item.id] = true
    }

    private func outlineIndex(for item: EditorOutlineItem, in items: [EditorOutlineItem]) -> Int? {
        items.firstIndex { $0.id == item.id }
    }

    private func outlineParentID(for index: Int, in items: [EditorOutlineItem]) -> String? {
        guard items.indices.contains(index) else {
            return nil
        }

        let currentLevel = items[index].level

        guard currentLevel > outlineBaseLevel, index > 0 else {
            return nil
        }

        for candidateIndex in stride(from: index - 1, through: 0, by: -1) {
            if items[candidateIndex].level < currentLevel {
                return items[candidateIndex].id
            }
        }

        return nil
    }

    private func outlineBranchUpperBound(startingAt index: Int, in items: [EditorOutlineItem]) -> Int {
        let currentLevel = items[index].level
        var upperBound = index + 1

        while upperBound < items.count, items[upperBound].level > currentLevel {
            upperBound += 1
        }

        return upperBound
    }

    private func collapseOutlineDescendants(of item: EditorOutlineItem, in items: [EditorOutlineItem]) {
        guard let itemIndex = outlineIndex(for: item, in: items) else {
            return
        }

        let upperBound = outlineBranchUpperBound(startingAt: itemIndex, in: items)

        guard upperBound > itemIndex + 1 else {
            return
        }

        for descendantIndex in (itemIndex + 1)..<upperBound {
            outlineExpansionOverrides[items[descendantIndex].id] = false
        }
    }

    private func outlineTitleFont(for level: Int) -> Font {
        switch level {
        case 1:
            return .system(size: 13, weight: .semibold)
        case 2:
            return .system(size: 12, weight: .medium)
        default:
            return .system(size: 12, weight: .regular)
        }
    }

    private func outlineTitleColor(for level: Int) -> Color {
        switch level {
        case 1:
            return palette.primaryText
        case 2:
            return palette.primaryText.opacity(0.82)
        default:
            return palette.secondaryText
        }
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
            ScrollViewReader { proxy in
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 0) {
                        ForEach(documentController.tabs) { tab in
                            tabCell(tab)
                                .id(tab.id)
                        }
                    }
                }
                .onAppear {
                    scrollActiveTab(using: proxy, animated: false)
                }
                .onChange(of: documentController.activeTabID) { _, _ in
                    scrollActiveTab(using: proxy)
                }
            }

            Rectangle()
                .fill(palette.separator)
                .frame(width: 1)

            tabListButton

            Rectangle()
                .fill(palette.separator)
                .frame(width: 1)

            newTabButton
        }
        .frame(height: metrics.tabStripHeight)
        .background(palette.editorChrome)
    }

    private func scrollActiveTab(using proxy: ScrollViewProxy, animated: Bool = true) {
        guard let activeTabID = documentController.activeTabID else {
            return
        }

        DispatchQueue.main.async {
            if animated {
                withAnimation(.easeInOut(duration: 0.18)) {
                    proxy.scrollTo(activeTabID, anchor: .center)
                }
            } else {
                proxy.scrollTo(activeTabID, anchor: .center)
            }
        }
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
        .frame(minWidth: metrics.tabCellMinWidth, maxWidth: metrics.tabCellMaxWidth)
        .frame(height: metrics.tabStripHeight)
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
        .frame(width: metrics.tabAddButtonWidth, height: metrics.tabStripHeight)
        .background(palette.editorChrome)
        .contentShape(Rectangle())
        .help("新建标签页")
    }

    private var tabListButton: some View {
        Menu {
            ForEach(documentController.tabs) { tab in
                Button {
                    documentController.selectTab(tab.id)
                } label: {
                    HStack(spacing: 8) {
                        Text(tab.compactTitle(maxLength: 44))

                        Spacer(minLength: 8)

                        if tab.isDirty {
                            Circle()
                                .fill(palette.accentText)
                                .frame(width: 6, height: 6)
                        }

                        if tab.id == documentController.activeTabID {
                            Image(systemName: "checkmark")
                        }
                    }
                }
            }
        } label: {
            Image(systemName: "rectangle.stack")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(palette.secondaryText)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .menuStyle(.borderlessButton)
        .frame(width: metrics.tabListButtonWidth, height: metrics.tabStripHeight)
        .background(palette.editorChrome)
        .contentShape(Rectangle())
        .help("显示所有标签页")
        .disabled(documentController.tabs.isEmpty)
    }

    private var editorSurface: some View {
        ZStack(alignment: .topLeading) {
            palette.editorSurface
                .ignoresSafeArea()

            if documentController.hasOpenTab {
                EditorWebView(
                    markdown: markdownBinding,
                    controller: documentController.editorController,
                    documentBaseURL: documentController.currentFileURL?.deletingLastPathComponent(),
                    presentation: documentController.currentPresentation,
                    revealRequest: documentController.revealRequest,
                    onImageAssetRequest: documentController.persistImageAsset,
                    onContextMenuCommand: documentController.executeEditorCommand(_:)
                )
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
                .frame(width: metrics.toolbarButtonSize, height: metrics.toolbarButtonSize)
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
        guard documentController.hasOpenTab else {
            return
        }

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

    static func forStyle(_ style: EditorInterfaceStyle) -> EditorPalette {
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
        case .sepia:
            return EditorPalette(
                windowBackground: Color(hex: 0xECE8DB),
                windowTint: Color(hex: 0x6F745D, alpha: 0.025),
                sidebarTopBarSurface: Color(hex: 0xE3DED0, alpha: 0.92),
                topBarSurface: Color(hex: 0xF0ECE0, alpha: 0.9),
                sidebarSurface: Color(hex: 0xE4DFD2, alpha: 0.94),
                sidebarHighlight: Color.white.opacity(0.08),
                panelSurface: Color(hex: 0xF4F0E5, alpha: 0.88),
                editorChrome: Color(hex: 0xDFD9CB),
                editorSurface: Color(hex: 0xF1EDE2),
                controlSurface: Color(hex: 0xF7F3E8),
                controlBorder: Color(hex: 0x777164, alpha: 0.14),
                segmentedTrack: Color(hex: 0xDDD7C9),
                segmentedSelected: Color(hex: 0xF7F3E8),
                activeTabSurface: Color(hex: 0xF1EDE2),
                rowHover: Color(hex: 0x6F745D, alpha: 0.05),
                separator: Color(hex: 0x6F745D, alpha: 0.12),
                primaryText: Color(hex: 0x403C36),
                secondaryText: Color(hex: 0x5B564E, alpha: 0.72),
                mutedText: Color(hex: 0x6A655C, alpha: 0.46),
                titleText: Color(hex: 0x34312C),
                accentText: Color(hex: 0x687052),
                emptyStateText: Color(hex: 0x6A655C, alpha: 0.4)
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
    let selectedWorkspaceItemIDs: Set<String>
    let expandedFolderIDs: Set<String>
    let forceExpandFolders: Bool
    let onToggleFolder: (String) -> Void
    let onPrimaryAction: (EditorWorkspaceNode, NSEvent.ModifierFlags) -> Void
    let onCreateFile: (URL) -> Void
    let onCreateFolder: (URL) -> Void
    let onRenameItem: (URL) -> Void
    let onDeleteItem: (URL) -> Void
    let onRevealItem: (URL) -> Void
    let dragItemURLs: (URL) -> [URL]
    let onMoveItems: ([URL], URL) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            ForEach(nodes) { node in
                WorkspaceTreeRow(
                    node: node,
                    depth: depth,
                    selectedFileURL: selectedFileURL,
                    palette: palette,
                    selectedWorkspaceItemIDs: selectedWorkspaceItemIDs,
                    expandedFolderIDs: expandedFolderIDs,
                    forceExpandFolders: forceExpandFolders,
                    onToggleFolder: onToggleFolder,
                    onPrimaryAction: onPrimaryAction,
                    onCreateFile: onCreateFile,
                    onCreateFolder: onCreateFolder,
                    onRenameItem: onRenameItem,
                    onDeleteItem: onDeleteItem,
                    onRevealItem: onRevealItem,
                    dragItemURLs: dragItemURLs,
                    onMoveItems: onMoveItems
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
    let selectedWorkspaceItemIDs: Set<String>
    let expandedFolderIDs: Set<String>
    let forceExpandFolders: Bool
    let onToggleFolder: (String) -> Void
    let onPrimaryAction: (EditorWorkspaceNode, NSEvent.ModifierFlags) -> Void
    let onCreateFile: (URL) -> Void
    let onCreateFolder: (URL) -> Void
    let onRenameItem: (URL) -> Void
    let onDeleteItem: (URL) -> Void
    let onRevealItem: (URL) -> Void
    let dragItemURLs: (URL) -> [URL]
    let onMoveItems: ([URL], URL) -> Void

    private var indentation: CGFloat {
        CGFloat(depth * 14 + 10)
    }

    private var isCurrentFile: Bool {
        guard let selectedFileURL, node.isFile else {
            return false
        }

        return selectedFileURL.standardizedFileURL == node.url.standardizedFileURL
    }

    private var isSelected: Bool {
        selectedWorkspaceItemIDs.contains(node.id)
    }

    private var isExpanded: Bool {
        forceExpandFolders || expandedFolderIDs.contains(node.id)
    }

    private var currentModifierFlags: NSEvent.ModifierFlags {
        NSApp.currentEvent?.modifierFlags ?? []
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            if node.isFolder {
                folderRow

                if isExpanded {
                    WorkspaceTreeView(
                        nodes: node.children,
                        depth: depth + 1,
                        selectedFileURL: selectedFileURL,
                        palette: palette,
                        selectedWorkspaceItemIDs: selectedWorkspaceItemIDs,
                        expandedFolderIDs: expandedFolderIDs,
                        forceExpandFolders: forceExpandFolders,
                        onToggleFolder: onToggleFolder,
                        onPrimaryAction: onPrimaryAction,
                        onCreateFile: onCreateFile,
                        onCreateFolder: onCreateFolder,
                        onRenameItem: onRenameItem,
                        onDeleteItem: onDeleteItem,
                        onRevealItem: onRevealItem,
                        dragItemURLs: dragItemURLs,
                        onMoveItems: onMoveItems
                    )
                }
            } else {
                fileRow(url: node.url)
            }
        }
    }

    private var folderRow: some View {
        Button {
            onPrimaryAction(node, currentModifierFlags)
        } label: {
            HStack(spacing: 8) {
                Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
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
                    .fill(isSelected ? palette.rowHover : .clear)
            )
        }
        .buttonStyle(.plain)
        .onDrag {
            WorkspaceTreeDragPayload.provider(for: dragItemURLs(node.url))
        }
        .onDrop(of: [WorkspaceTreeDragPayload.type], isTargeted: nil) { providers in
            WorkspaceTreeDragPayload.loadItemURLs(from: providers) { itemURLs in
                guard !itemURLs.isEmpty else {
                    return
                }

                onMoveItems(itemURLs, node.url)
            }
            return providers.contains { $0.hasItemConformingToTypeIdentifier(WorkspaceTreeDragPayload.type.identifier) }
        }
        .contextMenu {
            Button(isExpanded ? "折叠" : "展开") {
                onToggleFolder(node.id)
            }

            Divider()

            Button("新建文件") {
                onCreateFile(node.url)
            }

            Button("新建文件夹") {
                onCreateFolder(node.url)
            }

            Divider()

            Button("重命名") {
                onRenameItem(node.url)
            }

            Button("删除", role: .destructive) {
                onDeleteItem(node.url)
            }

            Divider()

            Button("在 Finder 中显示") {
                onRevealItem(node.url)
            }
        }
    }

    private func fileRow(url: URL) -> some View {
        Button {
            onPrimaryAction(node, currentModifierFlags)
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "doc")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(isCurrentFile ? palette.primaryText : palette.mutedText)

                Text(node.name)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(isCurrentFile ? palette.primaryText : palette.secondaryText)
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
        .onDrag {
            WorkspaceTreeDragPayload.provider(for: dragItemURLs(url))
        }
        .contextMenu {
            Button("新建同级文件") {
                onCreateFile(url.deletingLastPathComponent())
            }

            Divider()

            Button("重命名") {
                onRenameItem(url)
            }

            Button("删除", role: .destructive) {
                onDeleteItem(url)
            }

            Divider()

            Button("在 Finder 中显示") {
                onRevealItem(url)
            }
        }
    }
}

private enum WorkspaceTreeDragPayload {
    static let type = UTType(exportedAs: "com.markdown.workspace-items")

    static func provider(for itemURLs: [URL]) -> NSItemProvider {
        let provider = NSItemProvider()
        let paths = itemURLs.map { $0.standardizedFileURL.path }
        let data = (try? JSONEncoder().encode(paths)) ?? Data()

        provider.registerDataRepresentation(
            forTypeIdentifier: type.identifier,
            visibility: .all
        ) { completion in
            completion(data, nil)
            return nil
        }

        return provider
    }

    static func loadItemURLs(
        from providers: [NSItemProvider],
        completion: @escaping ([URL]) -> Void
    ) {
        guard let provider = providers.first(where: {
            $0.hasItemConformingToTypeIdentifier(type.identifier)
        }) else {
            completion([])
            return
        }

        provider.loadDataRepresentation(forTypeIdentifier: type.identifier) { data, _ in
            let paths = (data.flatMap { try? JSONDecoder().decode([String].self, from: $0) }) ?? []
            let itemURLs = paths.map(URL.init(fileURLWithPath:))

            DispatchQueue.main.async {
                completion(itemURLs)
            }
        }
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
