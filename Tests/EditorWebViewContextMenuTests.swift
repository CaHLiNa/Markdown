import AppKit
import XCTest
@testable import Markdown

final class EditorWebViewContextMenuTests: XCTestCase {
    private final class MenuTarget: NSObject {
        @objc func handle(_ sender: Any?) {}
    }

    func testBuildMenuKeepsCoreEditItemsAndDropsDefaultWebItems() {
        let defaultMenu = NSMenu(title: "Default")
        defaultMenu.addItem(NSMenuItem(title: "撤销输入", action: NSSelectorFromString("undo:"), keyEquivalent: ""))
        defaultMenu.addItem(NSMenuItem(title: "复制", action: NSSelectorFromString("copy:"), keyEquivalent: ""))
        defaultMenu.addItem(NSMenuItem(title: "查询 “Markdown”", action: nil, keyEquivalent: ""))
        defaultMenu.addItem(NSMenuItem(title: "用 Bing 搜索", action: nil, keyEquivalent: ""))
        let target = MenuTarget()

        let menu = EditorWebView.ContextMenuBuilder.buildMenu(
            from: defaultMenu,
            commandTarget: target,
            commandAction: #selector(MenuTarget.handle(_:))
        )

        let titles = nonSeparatorTitles(in: menu)

        XCTAssertTrue(titles.contains("撤销输入"))
        XCTAssertTrue(titles.contains("复制"))
        XCTAssertTrue(titles.contains("剪切"))
        XCTAssertTrue(titles.contains("粘贴"))
        XCTAssertTrue(titles.contains("全选"))
        XCTAssertFalse(titles.contains("查询 “Markdown”"))
        XCTAssertFalse(titles.contains("用 Bing 搜索"))
    }

    func testBuildMenuAppendsExpectedMarkdownCommandsInOrder() {
        let target = MenuTarget()
        let menu = EditorWebView.ContextMenuBuilder.buildMenu(
            from: nil,
            commandTarget: target,
            commandAction: #selector(MenuTarget.handle(_:))
        )

        let titles = nonSeparatorTitles(in: menu)
        let expectedOrder = [
            "粗体",
            "斜体",
            "链接",
            "行内代码",
            "标题 1",
            "标题 2",
            "标题 3",
            "引用块",
            "无序列表",
            "有序列表",
            "任务列表",
            "代码块",
        ]

        XCTAssertEqual(Array(titles.suffix(expectedOrder.count)), expectedOrder)

        let markdownItems = menu.items.filter {
            guard let rawValue = $0.representedObject as? String else {
                return false
            }

            return EditorCommand(rawValue: rawValue) != nil
        }

        XCTAssertEqual(
            markdownItems.compactMap { $0.representedObject as? String },
            [
                EditorCommand.bold.rawValue,
                EditorCommand.italic.rawValue,
                EditorCommand.link.rawValue,
                EditorCommand.inlineCode.rawValue,
                EditorCommand.heading1.rawValue,
                EditorCommand.heading2.rawValue,
                EditorCommand.heading3.rawValue,
                EditorCommand.blockquote.rawValue,
                EditorCommand.bulletList.rawValue,
                EditorCommand.orderedList.rawValue,
                EditorCommand.taskList.rawValue,
                EditorCommand.codeBlock.rawValue,
            ]
        )
    }

    func testContextMenuInterceptionScriptPreventsDefaultMenuAndPostsNativeRequest() {
        let script = EditorWebView.contextMenuInterceptionScript

        XCTAssertTrue(script.contains("editorContextMenuRequest"))
        XCTAssertTrue(script.contains("document.addEventListener('contextmenu'"))
        XCTAssertTrue(script.contains("event.preventDefault()"))
        XCTAssertTrue(script.contains("event.stopPropagation()"))
        XCTAssertTrue(script.contains("clientX"))
        XCTAssertTrue(script.contains("clientY"))
    }

    private func nonSeparatorTitles(in menu: NSMenu) -> [String] {
        menu.items.compactMap { item in
            item.isSeparatorItem ? nil : item.title
        }
    }
}
