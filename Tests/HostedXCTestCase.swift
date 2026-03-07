import XCTest

class HostedXCTestCase: XCTestCase {
    override func invokeTest() {
        do {
            try setUpWithError()
        } catch {
            XCTFail("setUpWithError() threw: \(error)")
            return
        }

        setUp()
        defer {
            tearDown()

            do {
                try tearDownWithError()
            } catch {
                XCTFail("tearDownWithError() threw: \(error)")
            }
        }

        let selector = Selector(currentTestSelectorName)
        guard responds(to: selector) else {
            XCTFail("Missing test selector \(currentTestSelectorName)")
            return
        }

        perform(selector)
    }

    private var currentTestSelectorName: String {
        let tokens = name.split(separator: " ")
        guard let methodToken = tokens.last else {
            return name
        }

        return methodToken
            .trimmingCharacters(in: CharacterSet(charactersIn: "]"))
    }
}
