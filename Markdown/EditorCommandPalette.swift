//
//  EditorCommandPalette.swift
//  Markdown
//
//  Created by Codex on 2026/3/8.
//

import Foundation

struct EditorCommandPaletteItem: Identifiable, Equatable {
    let id: String
    let title: String
    let category: String
    let keywords: [String]
}

extension EditorCommand {
    var paletteTitle: String {
        switch self {
        case .paragraph:
            return "段落"
        case .heading1:
            return "标题 1"
        case .heading2:
            return "标题 2"
        case .heading3:
            return "标题 3"
        case .heading4:
            return "标题 4"
        case .heading5:
            return "标题 5"
        case .heading6:
            return "标题 6"
        case .upgradeHeading:
            return "升级标题"
        case .degradeHeading:
            return "降级标题"
        case .blockquote:
            return "引用块"
        case .bulletList:
            return "无序列表"
        case .orderedList:
            return "有序列表"
        case .taskList:
            return "任务列表"
        case .table:
            return "插入表格"
        case .horizontalRule:
            return "插入分隔线"
        case .frontMatter:
            return "插入 Front Matter"
        case .codeBlock:
            return "插入代码块"
        case .mathBlock:
            return "插入数学块"
        case .bold:
            return "粗体"
        case .italic:
            return "斜体"
        case .underline:
            return "下划线"
        case .highlight:
            return "高亮"
        case .inlineCode:
            return "行内代码"
        case .inlineMath:
            return "行内公式"
        case .strikethrough:
            return "删除线"
        case .link:
            return "插入链接"
        case .image:
            return "插入图片"
        case .clearFormat:
            return "清除格式"
        case .duplicateBlock:
            return "复制块"
        case .newParagraph:
            return "新建段落"
        case .deleteBlock:
            return "删除块"
        }
    }

    var paletteCategory: String {
        switch self {
        case .paragraph, .heading1, .heading2, .heading3, .heading4, .heading5, .heading6:
            return "段落"
        case .upgradeHeading, .degradeHeading:
            return "转换"
        case .blockquote, .bulletList, .orderedList, .taskList, .table, .horizontalRule, .frontMatter, .codeBlock, .mathBlock, .link, .image:
            return "插入"
        case .bold, .italic, .underline, .highlight, .inlineCode, .inlineMath, .strikethrough, .clearFormat:
            return "格式"
        case .duplicateBlock, .newParagraph, .deleteBlock:
            return "块"
        }
    }

    var paletteKeywords: [String] {
        switch self {
        case .paragraph:
            return ["paragraph", "text"]
        case .heading1, .heading2, .heading3, .heading4, .heading5, .heading6:
            return ["heading", "title", "h\(self.rawValue.suffix(1))"]
        case .upgradeHeading:
            return ["heading", "promote", "level"]
        case .degradeHeading:
            return ["heading", "demote", "level"]
        case .blockquote:
            return ["quote", "blockquote"]
        case .bulletList:
            return ["list", "unordered", "bullet"]
        case .orderedList:
            return ["list", "ordered", "numbered"]
        case .taskList:
            return ["task", "todo", "checkbox"]
        case .table:
            return ["table", "grid"]
        case .horizontalRule:
            return ["rule", "divider", "separator"]
        case .frontMatter:
            return ["yaml", "frontmatter", "metadata"]
        case .codeBlock:
            return ["code", "fence", "block"]
        case .mathBlock:
            return ["math", "formula", "block"]
        case .bold:
            return ["bold", "strong"]
        case .italic:
            return ["italic", "emphasis"]
        case .underline:
            return ["underline"]
        case .highlight:
            return ["highlight", "mark"]
        case .inlineCode:
            return ["inline", "code"]
        case .inlineMath:
            return ["inline", "math", "formula"]
        case .strikethrough:
            return ["strike", "delete"]
        case .link:
            return ["link", "url"]
        case .image:
            return ["image", "picture"]
        case .clearFormat:
            return ["clear", "format", "plain"]
        case .duplicateBlock:
            return ["duplicate", "copy", "block"]
        case .newParagraph:
            return ["paragraph", "newline", "block"]
        case .deleteBlock:
            return ["delete", "remove", "block"]
        }
    }

    var paletteItem: EditorCommandPaletteItem {
        EditorCommandPaletteItem(
            id: rawValue,
            title: paletteTitle,
            category: paletteCategory,
            keywords: paletteKeywords
        )
    }
}

enum EditorCommandPaletteCatalog {
    private static let workspaceItems: [EditorCommandPaletteItem] = [
        EditorCommandPaletteItem(
            id: "file.new-document",
            title: "新建标签页",
            category: "文件",
            keywords: ["new", "file", "tab"]
        ),
        EditorCommandPaletteItem(
            id: "file.open-document",
            title: "打开文件",
            category: "文件",
            keywords: ["open", "file"]
        ),
        EditorCommandPaletteItem(
            id: "file.open-folder",
            title: "打开文件夹",
            category: "文件",
            keywords: ["open", "folder", "workspace"]
        ),
        EditorCommandPaletteItem(
            id: "file.save",
            title: "保存",
            category: "文件",
            keywords: ["save", "write"]
        ),
        EditorCommandPaletteItem(
            id: "file.quick-open",
            title: "快速打开",
            category: "文件",
            keywords: ["quick", "open", "palette"]
        ),
        EditorCommandPaletteItem(
            id: "file.export-html",
            title: "导出 HTML",
            category: "文件",
            keywords: ["export", "html"]
        ),
        EditorCommandPaletteItem(
            id: "file.export-pdf",
            title: "导出 PDF",
            category: "文件",
            keywords: ["export", "pdf"]
        ),
        EditorCommandPaletteItem(
            id: "view.command-palette",
            title: "命令面板",
            category: "视图",
            keywords: ["command", "palette", "search"]
        ),
        EditorCommandPaletteItem(
            id: "view.search",
            title: "切换搜索面板",
            category: "视图",
            keywords: ["search", "workspace", "find"]
        ),
        EditorCommandPaletteItem(
            id: "view.files",
            title: "切换文件面板",
            category: "视图",
            keywords: ["files", "sidebar", "workspace"]
        ),
        EditorCommandPaletteItem(
            id: "view.outline",
            title: "切换目录面板",
            category: "视图",
            keywords: ["outline", "headings", "toc"]
        ),
        EditorCommandPaletteItem(
            id: "view.source-code-mode",
            title: "切换源码视图",
            category: "视图",
            keywords: ["source", "code", "editor"]
        ),
        EditorCommandPaletteItem(
            id: "view.focus-mode",
            title: "切换专注模式",
            category: "视图",
            keywords: ["focus", "mode"]
        ),
        EditorCommandPaletteItem(
            id: "view.typewriter-mode",
            title: "切换打字机模式",
            category: "视图",
            keywords: ["typewriter", "mode"]
        ),
        EditorCommandPaletteItem(
            id: "view.toggle-sidebar",
            title: "切换侧边栏",
            category: "视图",
            keywords: ["sidebar", "panel"]
        ),
        EditorCommandPaletteItem(
            id: "view.toggle-tab-strip",
            title: "切换标签栏",
            category: "视图",
            keywords: ["tabs", "tabbar"]
        )
    ]

    static let allItems: [EditorCommandPaletteItem] = workspaceItems + EditorCommand.allCases.map(\.paletteItem)
}
