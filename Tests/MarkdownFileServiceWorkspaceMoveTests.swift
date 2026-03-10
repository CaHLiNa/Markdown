import XCTest
@testable import Markdown

final class MarkdownFileServiceWorkspaceMoveTests: XCTestCase {
    func testExecuteWorkspaceMovesRollsBackCompletedMovesWhenALaterMoveFails() throws {
        let fileManager = FileManager.default
        let tempDirectory = fileManager.temporaryDirectory.appendingPathComponent(
            UUID().uuidString,
            isDirectory: true
        )

        try fileManager.createDirectory(at: tempDirectory, withIntermediateDirectories: true)
        defer { try? fileManager.removeItem(at: tempDirectory) }

        let sourceDirectory = tempDirectory.appendingPathComponent("source", isDirectory: true)
        let destinationDirectory = tempDirectory.appendingPathComponent("destination", isDirectory: true)
        try fileManager.createDirectory(at: sourceDirectory, withIntermediateDirectories: true)
        try fileManager.createDirectory(at: destinationDirectory, withIntermediateDirectories: true)

        let firstSourceURL = sourceDirectory.appendingPathComponent("one.md")
        let secondSourceURL = sourceDirectory.appendingPathComponent("two.md")
        let firstDestinationURL = destinationDirectory.appendingPathComponent("one.md")
        let secondDestinationURL = destinationDirectory.appendingPathComponent("two.md")

        try "# one".write(to: firstSourceURL, atomically: true, encoding: .utf8)
        try "# two".write(to: secondSourceURL, atomically: true, encoding: .utf8)

        let plannedMoves = [
            MarkdownFileService.WorkspaceMove(
                sourceURL: firstSourceURL,
                destinationURL: firstDestinationURL,
                isDirectory: false
            ),
            MarkdownFileService.WorkspaceMove(
                sourceURL: secondSourceURL,
                destinationURL: secondDestinationURL,
                isDirectory: false
            )
        ]

        var invocationCount = 0

        XCTAssertThrowsError(
            try MarkdownFileService.executeWorkspaceMoves(
                plannedMoves,
                moveItem: { sourceURL, destinationURL in
                    invocationCount += 1

                    if invocationCount == 2 {
                        throw NSError(
                            domain: NSCocoaErrorDomain,
                            code: CocoaError.fileWriteUnknown.rawValue,
                            userInfo: [NSLocalizedDescriptionKey: "Simulated move failure."]
                        )
                    }

                    try FileManager.default.moveItem(at: sourceURL, to: destinationURL)
                }
            )
        )

        XCTAssertTrue(fileManager.fileExists(atPath: firstSourceURL.path), "Expected rollback to restore the first successfully moved file.")
        XCTAssertTrue(fileManager.fileExists(atPath: secondSourceURL.path), "Expected the second file to remain at the source after failure.")
        XCTAssertFalse(fileManager.fileExists(atPath: firstDestinationURL.path), "Expected rollback to remove the partially moved destination file.")
        XCTAssertFalse(fileManager.fileExists(atPath: secondDestinationURL.path), "Expected the failed destination path to stay empty.")
    }
}
