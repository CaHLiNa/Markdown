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

    private enum Metrics {
        static let sidebarWidth: CGFloat = 292
        static let minWidth: CGFloat = 1180
        static let minHeight: CGFloat = 760
        static let topBarHeight: CGFloat = 30
        static let trafficLightsInset: CGFloat = 82
        static let outerPadding: CGFloat = 12
        static let sectionGap: CGFloat = 12
        static let segmentedHeight: CGFloat = 34
        static let searchFieldHeight: CGFloat = 34
        static let footerHeight: CGFloat = 56
        static let tabStripHeight: CGFloat = 38
        static let editorTopInset: CGFloat = 52
        static let editorLeadingInset: CGFloat = 72
    }

    private var interfaceStyle: EditorInterfaceStyle {
        documentController.effectiveInterfaceStyle
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

    var body: some View {
        ZStack(alignment: .top) {
            backgroundLayer

            VStack(spacing: 0) {
                Color.clear
                    .frame(height: Metrics.topBarHeight)

                mainLayout
            }

            topBar
        }
        .preferredColorScheme(interfaceStyle == .dark ? .dark : .light)
        .frame(minWidth: Metrics.minWidth, minHeight: Metrics.minHeight)
    }

    private var backgroundLayer: some View {
        ZStack {
            palette.windowBackground
                .ignoresSafeArea()

            LinearGradient(
                colors: [
                    palette.windowTint.opacity(0.18),
                    .clear
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            if interfaceStyle == .dark {
                LinearGradient(
                    colors: [
                        Color.white.opacity(0.015),
                        .clear
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .ignoresSafeArea()
            }
        }
    }

    private var topBar: some View {
        ZStack {
            VisualEffectBlur(
                material: interfaceStyle == .dark ? .headerView : .sidebar,
                blendingMode: .withinWindow
            )
            .overlay {
                Rectangle()
                    .fill(palette.topBarOverlay)
            }

            HStack(spacing: 0) {
                HStack(spacing: 10) {
                    Color.clear
                        .frame(width: Metrics.trafficLightsInset, height: 1)

                    topBarButton("sidebar.left", title: "侧边栏") {
                        documentController.toggleSidebarVisibility()
                    }

                    if documentController.isTabStripVisible {
                        topBarPill(text: "标签")
                    } else {
                        topBarPill(text: "单页")
                    }
                }
                .frame(width: isSidebarVisible ? Metrics.sidebarWidth : 210, alignment: .leading)

                Spacer(minLength: 0)

                HStack(spacing: 10) {
                    Text("\(documentController.characterCount) 字")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(palette.secondaryText)
                        .monospacedDigit()

                    topBarButton("square.and.arrow.down", title: "保存") {
                        documentController.saveDocument()
                    }
                }
            }
            .padding(.horizontal, Metrics.outerPadding)

            Text(documentController.currentTitle)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(palette.titleText)
                .lineLimit(1)
                .padding(.horizontal, 240)
        }
        .frame(height: Metrics.topBarHeight)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(palette.separator)
                .frame(height: 1)
        }
    }

    private var mainLayout: some View {
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

            sidebarBody

            Spacer(minLength: 0)

            Rectangle()
                .fill(palette.separator.opacity(0.8))
                .frame(height: 1)

            openFolderBar
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
        VStack(spacing: 10) {
            HStack(spacing: 6) {
                ForEach(EditorSidebarPane.allCases) { pane in
                    sidebarTabButton(for: pane)
                }
            }
            .padding(3)
            .frame(height: Metrics.segmentedHeight)
            .background(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(palette.segmentedTrack)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .stroke(palette.controlBorder, lineWidth: 1)
            )

            if documentController.sidebarPane == .search {
                searchField
            }
        }
        .padding(.horizontal, Metrics.outerPadding)
        .padding(.top, 14)
        .padding(.bottom, 12)
    }

    private func sidebarTabButton(for pane: EditorSidebarPane) -> some View {
        let isSelected = documentController.sidebarPane == pane

        return Button {
            documentController.sidebarPane = pane
        } label: {
            Text(pane.rawValue)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(isSelected ? palette.primaryText : palette.secondaryText)
                .frame(maxWidth: .infinity)
                .frame(height: 28)
                .background(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(isSelected ? palette.segmentedSelected : .clear)
                )
        }
        .buttonStyle(.plain)
    }

    private var sidebarBody: some View {
        Group {
            switch documentController.sidebarPane {
            case .files:
                filesPane
            case .search:
                searchPane
            case .outline:
                outlinePane
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var filesPane: some View {
        Group {
            if documentController.folderFiles.isEmpty {
                SidebarEmptyStateView(
                    icon: "folder",
                    title: "还没有载入工作区",
                    subtitle: "点击底部的“打开文件夹”开始。",
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
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                }
            }
        }
    }

    private var searchPane: some View {
        Group {
            if documentController.folderFiles.isEmpty {
                SidebarEmptyStateView(
                    icon: "magnifyingglass",
                    title: "未打开文件夹",
                    subtitle: "先加载目录，再搜索文件。",
                    palette: palette
                )
            } else if documentController.workspaceSearchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                SidebarEmptyStateView(
                    icon: "magnifyingglass",
                    title: "输入关键词搜索",
                    subtitle: nil,
                    palette: palette
                )
            } else if documentController.filteredWorkspaceTree.isEmpty {
                SidebarEmptyStateView(
                    icon: "magnifyingglass",
                    title: "没有匹配结果",
                    subtitle: nil,
                    palette: palette
                )
            } else {
                ScrollView(.vertical, showsIndicators: false) {
                    WorkspaceTreeView(
                        nodes: documentController.filteredWorkspaceTree,
                        depth: 0,
                        selectedFileURL: documentController.currentFileURL,
                        palette: palette,
                        isFolderExpanded: documentController.isFolderExpanded(_:),
                        onToggleFolder: documentController.toggleFolderExpansion(_:),
                        onOpenFile: documentController.openWorkspaceFile(_:)
                    )
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                }
            }
        }
    }

    private var outlinePane: some View {
        Group {
            if documentController.outlineItems.isEmpty {
                SidebarEmptyStateView(
                    icon: "list.bullet.indent",
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
                                        .font(.system(size: 13, weight: .medium))
                                        .foregroundStyle(palette.primaryText)
                                        .lineLimit(1)
                                        .padding(.leading, CGFloat(item.level - 1) * 12)

                                    Spacer(minLength: 0)
                                }
                                .padding(.horizontal, 12)
                                .frame(height: 30)
                                .background(
                                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                                        .fill(palette.rowHover)
                                )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                }
            }
        }
    }

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(palette.mutedText)

            TextField("搜索文件", text: $documentController.workspaceSearchQuery)
                .textFieldStyle(.plain)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(palette.primaryText)

            if !documentController.workspaceSearchQuery.isEmpty {
                Button {
                    documentController.workspaceSearchQuery = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(palette.mutedText)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 10)
        .frame(height: Metrics.searchFieldHeight)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(palette.controlSurface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(palette.controlBorder, lineWidth: 1)
        )
    }

    private var openFolderBar: some View {
        Button {
            documentController.openFolder()
        } label: {
            HStack(spacing: 10) {
                Image(systemName: "folder")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(palette.secondaryText)

                Text("打开文件夹")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(palette.primaryText)

                Spacer(minLength: 0)
            }
            .padding(.horizontal, 16)
            .frame(height: Metrics.footerHeight)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .background(palette.footerSurface)
    }

    private var tabStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 0) {
                ForEach(documentController.tabs) { tab in
                    tabCell(tab)
                }

                Spacer(minLength: 0)
            }
        }
        .frame(height: Metrics.tabStripHeight)
        .background(palette.editorChrome)
    }

    private func tabCell(_ tab: EditorTab) -> some View {
        let isActive = tab.id == documentController.activeTabID
        let showsIndicator = tab.isDirty

        return HStack(spacing: 8) {
            Button {
                documentController.selectTab(tab.id)
            } label: {
                Text(tab.title)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(isActive ? palette.primaryText : palette.secondaryText)
                    .lineLimit(1)
            }
            .buttonStyle(.plain)

            if showsIndicator {
                Circle()
                    .fill(palette.accentText)
                    .frame(width: 6, height: 6)
            }

            Button {
                documentController.closeTab(id: tab.id)
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(isActive ? palette.secondaryText : palette.mutedText)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 14)
        .frame(height: Metrics.tabStripHeight)
        .background(
            Rectangle()
                .fill(isActive ? palette.activeTabSurface : .clear)
        )
        .overlay(alignment: .trailing) {
            Rectangle()
                .fill(palette.separator)
                .frame(width: 1)
        }
    }

    private var editorSurface: some View {
        ZStack(alignment: .topLeading) {
            palette.editorSurface
                .ignoresSafeArea()

            LinearGradient(
                colors: [
                    palette.editorGlow,
                    .clear
                ],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()

            switch documentController.editorMode {
            case .wysiwyg:
                EditorWebView(
                    markdown: markdownBinding,
                    controller: documentController.editorController,
                    presentation: documentController.currentPresentation
                )
            case .sourceCode:
                TextEditor(text: markdownBinding)
                    .font(.system(size: 15, weight: .regular, design: .monospaced))
                    .foregroundStyle(palette.primaryText)
                    .scrollContentBackground(.hidden)
                    .padding(.horizontal, Metrics.editorLeadingInset)
                    .padding(.vertical, 36)
                    .background(palette.editorSurface)
            }

            if isEmptyVisualDocument {
                EmptyEditorHintView(palette: palette)
                    .padding(.leading, Metrics.editorLeadingInset)
                    .padding(.top, Metrics.editorTopInset)
                    .allowsHitTesting(false)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func topBarButton(_ systemName: String, title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(palette.secondaryText)
                .frame(width: 22, height: 22)
                .background(
                    RoundedRectangle(cornerRadius: 7, style: .continuous)
                        .fill(palette.topBarButtonSurface)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 7, style: .continuous)
                        .stroke(palette.controlBorder, lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
        .help(title)
    }

    private func topBarPill(text: String) -> some View {
        Text(text)
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(palette.mutedText)
            .padding(.horizontal, 8)
            .frame(height: 20)
            .background(
                Capsule(style: .continuous)
                    .fill(palette.topBarButtonSurface)
            )
            .overlay(
                Capsule(style: .continuous)
                    .stroke(palette.controlBorder, lineWidth: 1)
            )
    }
}

#Preview {
    ContentView()
        .environmentObject(EditorDocumentController())
}

private struct EditorPalette {
    let windowBackground: Color
    let windowTint: Color
    let topBarOverlay: Color
    let topBarButtonSurface: Color
    let sidebarSurface: Color
    let sidebarHighlight: Color
    let editorChrome: Color
    let editorSurface: Color
    let editorGlow: Color
    let footerSurface: Color
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
                windowBackground: Color(hex: 0x111318),
                windowTint: Color(hex: 0x284364),
                topBarOverlay: Color(hex: 0x161A21, alpha: 0.58),
                topBarButtonSurface: Color(hex: 0x1E242D, alpha: 0.78),
                sidebarSurface: Color(hex: 0x161A21),
                sidebarHighlight: Color(hex: 0x212B36, alpha: 0.18),
                editorChrome: Color(hex: 0x13171D),
                editorSurface: Color(hex: 0x111318),
                editorGlow: Color(hex: 0x1C2632, alpha: 0.26),
                footerSurface: Color(hex: 0x14181E),
                controlSurface: Color(hex: 0x1A1F27),
                controlBorder: Color.white.opacity(0.07),
                segmentedTrack: Color(hex: 0x1A1F27),
                segmentedSelected: Color(hex: 0x252C35),
                activeTabSurface: Color(hex: 0x181D24),
                rowHover: Color(hex: 0x1B2028),
                separator: Color.white.opacity(0.07),
                primaryText: Color(hex: 0xF3F5F7),
                secondaryText: Color(hex: 0xA5ADB7),
                mutedText: Color(hex: 0x6C7480),
                titleText: Color(hex: 0xC5CBD3),
                accentText: Color(hex: 0x78A8FF),
                emptyStateText: Color(hex: 0x7E8792)
            )
        case .light:
            return EditorPalette(
                windowBackground: Color(hex: 0xF0F4F7),
                windowTint: Color(hex: 0xBFD3E8),
                topBarOverlay: Color.white.opacity(0.62),
                topBarButtonSurface: Color.white.opacity(0.8),
                sidebarSurface: Color(hex: 0xF7FAFC),
                sidebarHighlight: Color(hex: 0xD7E3F0, alpha: 0.18),
                editorChrome: Color(hex: 0xF5F8FB),
                editorSurface: Color.white,
                editorGlow: Color(hex: 0xEDF3F8),
                footerSurface: Color(hex: 0xF6F8FB),
                controlSurface: Color(hex: 0xF3F6F9),
                controlBorder: Color.black.opacity(0.08),
                segmentedTrack: Color(hex: 0xEBF0F4),
                segmentedSelected: Color.white,
                activeTabSurface: Color.white,
                rowHover: Color.black.opacity(0.025),
                separator: Color.black.opacity(0.08),
                primaryText: Color(hex: 0x1F2530),
                secondaryText: Color(hex: 0x687382),
                mutedText: Color(hex: 0x97A0AE),
                titleText: Color(hex: 0x495362),
                accentText: Color(hex: 0x247DFF),
                emptyStateText: Color(hex: 0x97A2AF)
            )
        }
    }
}

private struct SidebarEmptyStateView: View {
    let icon: String
    let title: String
    let subtitle: String?
    let palette: EditorPalette

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(palette.mutedText)

            Text(title)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(palette.emptyStateText)

            if let subtitle {
                Text(subtitle)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(palette.mutedText)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 30)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

private struct EmptyEditorHintView: View {
    let palette: EditorPalette

    var body: some View {
        HStack(spacing: 14) {
            Text("¶")
                .font(.system(size: 24, weight: .medium, design: .rounded))
                .foregroundStyle(palette.accentText)

            Text("输入 @ 插入块")
                .font(.system(size: 21, weight: .medium))
                .foregroundStyle(palette.primaryText.opacity(0.84))
        }
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
        CGFloat(depth * 12)
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
                    .frame(width: 12)

                Image(systemName: "folder")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(palette.secondaryText)

                Text(node.name)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(palette.secondaryText)
                    .lineLimit(1)

                Spacer(minLength: 0)
            }
            .padding(.leading, indentation + 8)
            .padding(.trailing, 10)
            .frame(height: 30)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(isFolderExpanded(node.id) ? palette.rowHover : .clear)
            )
        }
        .buttonStyle(.plain)
    }

    private func fileRow(url: URL) -> some View {
        Button {
            onOpenFile(EditorWorkspaceFile(url: url, relativePath: node.relativePath))
        } label: {
            HStack(spacing: 10) {
                RoundedRectangle(cornerRadius: 1.5, style: .continuous)
                    .fill(isSelected ? palette.accentText : .clear)
                    .frame(width: 3, height: 16)

                Image(systemName: "doc")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(isSelected ? palette.primaryText : palette.mutedText)

                Text(node.name)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(isSelected ? palette.primaryText : palette.secondaryText)
                    .lineLimit(1)

                Spacer(minLength: 0)
            }
            .padding(.leading, indentation + 8)
            .padding(.trailing, 10)
            .frame(height: 31)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(isSelected ? palette.rowHover : .clear)
            )
        }
        .buttonStyle(.plain)
    }
}

private struct VisualEffectBlur: NSViewRepresentable {
    let material: NSVisualEffectView.Material
    let blendingMode: NSVisualEffectView.BlendingMode

    func makeNSView(context: Context) -> NSVisualEffectView {
        let view = NSVisualEffectView()
        view.state = .active
        view.material = material
        view.blendingMode = blendingMode
        return view
    }

    func updateNSView(_ nsView: NSVisualEffectView, context: Context) {
        nsView.material = material
        nsView.blendingMode = blendingMode
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
