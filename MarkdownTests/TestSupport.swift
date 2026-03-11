import Foundation
import XCTest

@testable import Markdown

func makeTemporaryDirectory(
    named prefix: String = "MarkdownTests"
) throws -> URL {
    let directoryURL = FileManager.default.temporaryDirectory
        .appendingPathComponent("\(prefix)-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(
        at: directoryURL,
        withIntermediateDirectories: true
    )
    return directoryURL
}
