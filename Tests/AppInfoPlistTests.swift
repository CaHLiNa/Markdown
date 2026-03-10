import XCTest

final class AppInfoPlistTests: XCTestCase {
    func testAppExportsWorkspaceDragType() {
        let exportedTypes = Bundle.main.object(forInfoDictionaryKey: "UTExportedTypeDeclarations") as? [[String: Any]]
        let workspaceType = exportedTypes?.first { declaration in
            declaration["UTTypeIdentifier"] as? String == "com.markdown.workspace-items"
        }

        XCTAssertNotNil(
            workspaceType,
            "Expected the app Info.plist to export the custom workspace drag type."
        )

        let conformsTo = workspaceType?["UTTypeConformsTo"] as? [String]
        XCTAssertEqual(
            conformsTo,
            ["public.data"],
            "Expected the exported workspace drag type to conform to public.data."
        )
    }
}
