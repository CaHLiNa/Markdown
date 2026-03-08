import XCTest
@testable import Markdown

final class EditorRuntimeStagerTests: XCTestCase {
    func testStagesFlattenedBundleIntoStructuredRuntime() throws {
        let fileManager = FileManager.default
        let tempRoot = fileManager.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        let bundleRoot = tempRoot.appendingPathComponent("bundle", isDirectory: true)
        let stagingRoot = tempRoot.appendingPathComponent("staging", isDirectory: true)

        try fileManager.createDirectory(at: bundleRoot, withIntermediateDirectories: true)
        defer { try? fileManager.removeItem(at: tempRoot) }

        let textFiles: [String: String] = [
            "index.html": """
            <!doctype html>
            <html lang="zh">
              <head>
                <script type="module" src="./index.js"></script>
                <link rel="stylesheet" href="./vendor-vditor.css">
                <link rel="stylesheet" href="./index.css">
              </head>
              <body><div id="app"></div></body>
            </html>
            """,
            "index.js": "console.log('editor');",
            "index.css": "body { margin: 0; }",
            "vendor-vditor.js": "export const V = {};",
            "vendor-vditor.css": ".vditor {}",
            "lute.min.js": "window.Lute = {};",
            "zh_CN.js": "window.VditorI18n = {};",
            "ant.js": "window.VDITOR_ICON = {};",
            "github.min.css": ".hljs {}",
            "github-dark.min.css": ".hljs-dark {}",
            "katex.min.css": "@font-face { font-family: KaTeX_Main; src: url(fonts/KaTeX_Main-Regular.woff2); }",
            "katex.min.js": "window.katex = {};",
            "mhchem.min.js": "window.mhchem = {};",
            "light.css": "body { color: black; }",
            "dark.css": "body { color: white; }",
        ]

        for (filename, contents) in textFiles {
            try contents.write(
                to: bundleRoot.appendingPathComponent(filename),
                atomically: true,
                encoding: .utf8
            )
        }

        let binaryFiles = [
            "KaTeX_Main-Regular.woff2",
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

        for filename in binaryFiles {
            try Data([0x1, 0x2, 0x3]).write(to: bundleRoot.appendingPathComponent(filename))
        }

        let stagedIndexURL = try EditorRuntimeStager.stageFlattenedBundle(
            from: bundleRoot,
            into: stagingRoot
        )

        XCTAssertEqual(stagedIndexURL, stagingRoot.appendingPathComponent("index.html"))
        XCTAssertTrue(EditorRuntimeStager.hasStructuredRuntime(at: stagingRoot))
        XCTAssertTrue(fileManager.fileExists(
            atPath: stagingRoot.appendingPathComponent("vditor/dist/js/lute/lute.min.js").path
        ))
        XCTAssertTrue(fileManager.fileExists(
            atPath: stagingRoot.appendingPathComponent("vditor/dist/js/katex/fonts/KaTeX_Main-Regular.woff2").path
        ))
        XCTAssertTrue(fileManager.fileExists(
            atPath: stagingRoot.appendingPathComponent("vditor/dist/images/emoji/b3log.png").path
        ))
    }
}
