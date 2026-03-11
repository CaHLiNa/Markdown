//
//  MarkdownPDFRenderer.swift
//  Markdown
//
//  Created by Codex on 2026/3/11.
//

import AppKit
import WebKit

@MainActor
final class MarkdownPDFRenderer: NSObject, WKNavigationDelegate {
    private struct PendingRender {
        let hostWindow: NSWindow
        let webView: WKWebView
        let options: PDFExportOptions
        let completion: (Result<Data, Error>) -> Void
    }

    private var pendingRender: PendingRender?
    private var readinessPollAttempts = 0

    func renderPDF(
        from htmlURL: URL,
        options: PDFExportOptions,
        completion: @escaping (Result<Data, Error>) -> Void
    ) {
        guard pendingRender == nil else {
            completion(.failure(MarkdownExportError.renderFailed("已有 PDF 导出任务正在进行。")))
            return
        }

        let configuration = WKWebViewConfiguration()
        let normalizedOptions = options.normalized
        let paperSize = normalizedOptions.paperSize.pageSizePoints
        let contentWidth = max(1, paperSize.width - (normalizedOptions.margin * 2))
        let pageRect = CGRect(origin: .zero, size: CGSize(width: contentWidth, height: paperSize.height))
        let hostWindow = NSWindow(
            contentRect: pageRect,
            styleMask: [.borderless],
            backing: .buffered,
            defer: false
        )
        hostWindow.isReleasedWhenClosed = false
        hostWindow.contentView = NSView(frame: pageRect)
        hostWindow.orderOut(nil)

        let webView = WKWebView(frame: pageRect, configuration: configuration)
        webView.navigationDelegate = self
        webView.setValue(false, forKey: "drawsBackground")
        hostWindow.contentView?.addSubview(webView)

        pendingRender = PendingRender(
            hostWindow: hostWindow,
            webView: webView,
            options: normalizedOptions,
            completion: completion
        )
        readinessPollAttempts = 0

        webView.loadFileURL(
            htmlURL,
            allowingReadAccessTo: htmlURL.deletingLastPathComponent()
        )
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard pendingRender?.webView === webView else {
            return
        }

        pollReadinessAndRenderPDF(for: webView)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: any Error) {
        guard pendingRender?.webView === webView else {
            return
        }

        finish(with: .failure(error))
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: any Error) {
        guard pendingRender?.webView === webView else {
            return
        }

        finish(with: .failure(error))
    }

    private func pollReadinessAndRenderPDF(for webView: WKWebView) {
        let readinessScript = """
        (() => {
          const fontsReady = !document.fonts || document.fonts.status === 'loaded';
          const imagesReady = Array.from(document.images || []).every((image) => image.complete);
          return fontsReady && imagesReady;
        })();
        """

        webView.evaluateJavaScript(readinessScript) { [weak self] result, error in
            guard let self, let pendingRender, pendingRender.webView === webView else {
                return
            }

            if let error {
                self.finish(with: .failure(error))
                return
            }

            let isReady = (result as? Bool) ?? ((result as? NSNumber)?.boolValue ?? false)
            if isReady || self.readinessPollAttempts >= 20 {
                self.renderFullDocumentPDF(for: webView, options: pendingRender.options)
                return
            }

            self.readinessPollAttempts += 1
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
                self?.pollReadinessAndRenderPDF(for: webView)
            }
        }
    }

    private func renderFullDocumentPDF(for webView: WKWebView, options: PDFExportOptions) {
        measureContentHeight(for: webView, minimumHeight: options.paperSize.pageSizePoints.height) { [weak self] result in
            guard let self, let pendingRender, pendingRender.webView === webView else {
                return
            }

            switch result {
            case .success(let contentHeight):
                let contentRect = CGRect(
                    origin: .zero,
                    size: CGSize(
                        width: max(1, options.paperSize.pageSizePoints.width - (options.margin * 2)),
                        height: contentHeight
                    )
                )
                webView.frame = contentRect
                pendingRender.hostWindow.contentView?.frame = contentRect
                pendingRender.hostWindow.contentView?.layoutSubtreeIfNeeded()
                webView.layoutSubtreeIfNeeded()
                self.printPDF(for: webView, inside: contentRect, options: options)
            case .failure(let error):
                self.finish(with: .failure(error))
            }
        }
    }

    private func measureContentHeight(
        for webView: WKWebView,
        minimumHeight: CGFloat,
        completion: @escaping (Result<CGFloat, Error>) -> Void
    ) {
        let contentMetricsScript = """
        (() => {
          const root = document.scrollingElement || document.documentElement || document.body;
          const body = document.body;
          const html = document.documentElement;
          const height = Math.max(
            root ? root.scrollHeight : 0,
            body ? body.scrollHeight : 0,
            html ? html.scrollHeight : 0,
            body ? body.offsetHeight : 0,
            html ? html.offsetHeight : 0
          );
          return { height };
        })();
        """

        webView.evaluateJavaScript(contentMetricsScript) { result, error in
            if let error {
                completion(.failure(error))
                return
            }

            let metrics = result as? [String: Any]
            let rawHeight = (metrics?["height"] as? NSNumber)?.doubleValue ?? minimumHeight
            completion(.success(max(minimumHeight, ceil(rawHeight))))
        }
    }

    private func printPDF(for webView: WKWebView, inside contentRect: CGRect, options: PDFExportOptions) {
        let rawPDFData = NSMutableData()

        let printInfo = NSPrintInfo()
        printInfo.paperSize = contentRect.size
        printInfo.leftMargin = 0
        printInfo.rightMargin = 0
        printInfo.topMargin = 0
        printInfo.bottomMargin = 0
        printInfo.horizontalPagination = .automatic
        printInfo.verticalPagination = .automatic
        printInfo.isHorizontallyCentered = false
        printInfo.isVerticallyCentered = false

        let operation = NSPrintOperation.pdfOperation(
            with: webView,
            inside: contentRect,
            to: rawPDFData,
            printInfo: printInfo
        )
        operation.showsPrintPanel = false
        operation.showsProgressPanel = false

        let didSucceed = operation.run()

        guard didSucceed else {
            finish(with: .failure(MarkdownExportError.renderFailed("PDF 打印渲染失败。")))
            return
        }

        do {
            let paginatedData = try paginatePDFData(rawPDFData as Data, options: options)
            finish(with: .success(paginatedData))
        } catch {
            finish(with: .failure(error))
        }
    }

    private func paginatePDFData(_ data: Data, options: PDFExportOptions) throws -> Data {
        guard
            let provider = CGDataProvider(data: data as CFData),
            let sourceDocument = CGPDFDocument(provider),
            let sourcePage = sourceDocument.page(at: 1)
        else {
            throw MarkdownExportError.renderFailed("无法读取临时 PDF 数据。")
        }

        let paperSize = options.paperSize.pageSizePoints
        let margin = options.margin
        let contentHeightPerPage = max(1, paperSize.height - (margin * 2))
        let sourceBounds = sourcePage.getBoxRect(.mediaBox)
        let totalHeight = sourceBounds.height
        let pageCount = max(1, Int(ceil(totalHeight / contentHeightPerPage)))
        let outputData = NSMutableData()
        var mediaBox = CGRect(origin: .zero, size: paperSize)

        guard
            let consumer = CGDataConsumer(data: outputData as CFMutableData),
            let context = CGContext(consumer: consumer, mediaBox: &mediaBox, nil)
        else {
            throw MarkdownExportError.renderFailed("无法创建分页 PDF 上下文。")
        }

        for pageIndex in 0..<pageCount {
            let sliceTop = totalHeight - (CGFloat(pageIndex) * contentHeightPerPage)
            let sliceBottom = max(0, sliceTop - contentHeightPerPage)
            let sliceHeight = sliceTop - sliceBottom
            let destinationRect = CGRect(
                x: margin,
                y: paperSize.height - margin - sliceHeight,
                width: sourceBounds.width,
                height: sliceHeight
            )

            context.beginPDFPage(nil)
            context.setFillColor(NSColor.white.cgColor)
            context.fill(CGRect(origin: .zero, size: paperSize))
            context.saveGState()
            context.clip(to: destinationRect)
            context.translateBy(x: destinationRect.minX, y: destinationRect.minY - sliceBottom)
            context.drawPDFPage(sourcePage)
            context.restoreGState()
            context.endPDFPage()
        }

        context.closePDF()
        return outputData as Data
    }

    private func finish(with result: Result<Data, Error>) {
        guard let pendingRender else {
            return
        }

        self.pendingRender = nil
        readinessPollAttempts = 0
        pendingRender.webView.navigationDelegate = nil
        pendingRender.webView.removeFromSuperview()
        pendingRender.hostWindow.orderOut(nil)
        pendingRender.hostWindow.close()
        pendingRender.completion(result)
    }
}
