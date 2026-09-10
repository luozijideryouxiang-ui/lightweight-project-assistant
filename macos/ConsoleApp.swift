// 轻量项目助理 · macOS 原生 App
// SwiftUI 壳子 + WKWebView + NSVisualEffectView 真实玻璃 + 内嵌 Node 服务 + 原生中文语音
import SwiftUI
import WebKit
import AppKit
import Speech
import AVFoundation
import OSLog
import WidgetKit

@main
struct ConsoleApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var delegate
    @StateObject private var menuStore = WorkspaceStore.shared

    var body: some Scene {
        WindowGroup("轻量项目助理") {
            ContentView(delegate: delegate)
                .frame(minWidth: 980, minHeight: 640)
        }
        .windowStyle(.titleBar)
        .windowToolbarStyle(.unifiedCompact)
        .defaultSize(width: 1200, height: 800)
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("新建任务") { delegate.webController?.openNewTaskModal() }
                    .keyboardShortcut("n", modifiers: .command)
            }
            CommandGroup(after: .sidebar) {
                Divider()
                Button("立即同步") { delegate.webController?.requestRefresh() }
                    .keyboardShortcut("r", modifiers: .command)
                Button("聚焦快速收集") { delegate.webController?.focusQuickAdd() }
                    .keyboardShortcut("/", modifiers: .command)
            }
            CommandMenu("视图") {
                ForEach(Array(ConsoleApp.views.enumerated()), id: \.offset) { idx, view in
                    Button(view.label) { delegate.webController?.switchView(view.key) }
                        .keyboardShortcut(view.shortcut, modifiers: [])
                }
            }
            CommandMenu("桌面组件") {
                Button(delegate.desktopWindow?.isVisible == true ? "隐藏桌面组件" : "显示桌面组件") {
                    delegate.toggleDesktopWidget()
                }
                .keyboardShortcut("d", modifiers: [.command, .shift])
            }
        }

        // 菜单栏小组件：常驻显示今日焦点数量，可直接勾选完成
        MenuBarExtra {
            MenuBarWidget(store: menuStore, delegate: delegate)
        } label: {
            HStack(spacing: 4) {
                Image(systemName: menuStore.focusTasks.isEmpty ? "checkmark.circle" : "circle.badge.\(min(menuStore.focusTasks.count, 9))")
                Text(menuStore.focusTasks.isEmpty ? "0" : "\(menuStore.focusTasks.count)")
                    .monospacedDigit()
            }
        }
        .menuBarExtraStyle(.window)
    }

    private static let views: [(label: String, key: String, shortcut: KeyEquivalent)] = [
        ("今日焦点", "focus", "1"),
        ("列表", "list", "2"),
        ("看板", "board", "3"),
        ("日历", "calendar", "4"),
        ("时间线", "timeline", "5"),
        ("四象限", "matrix", "6"),
        ("指令区", "ai", "7")
    ]
}

final class DesktopPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}

class AppDelegate: NSObject, NSApplicationDelegate {
    weak var webController: WebController?
    weak var mainWindow: NSWindow?
    var serverProcess: Process?
    var serverPort: Int = 0
    private var voiceController: VoiceController?
    private var didStart = false
    // 服务看护：本地 node 服务可能崩溃或被系统回收，需要周期性探测并自动恢复。
    private var watchdogTimer: Timer?
    private var restartAttempts = 0
    private var lastRestartAt = Date.distantPast
    private var isTerminating = false
    var desktopWindow: DesktopPanel?
    private let logger = Logger(subsystem: "com.local.MicrosoftTodoFocusConsole", category: "App")
    private static let serverPortFilePath = "/tmp/com.local.MicrosoftTodoFocusConsole.serverport"

    static let widgetFrameName = "DesktopWidgetFrame"
    static let widgetVisibleKey = "DesktopWidgetVisible"
    static let widgetPinnedKey = "DesktopWidgetPinned"
    static let widgetCompactKey = "DesktopWidgetCompact"
    static let widgetWidth: CGFloat = 320
    static let widgetRegularHeight: CGFloat = 430
    static let widgetCompactHeight: CGFloat = 286

    private var widgetVisiblePreference: Bool {
        get { UserDefaults.standard.object(forKey: Self.widgetVisibleKey) as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: Self.widgetVisibleKey) }
    }

    private var widgetPinnedPreference: Bool {
        get { UserDefaults.standard.object(forKey: Self.widgetPinnedKey) as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: Self.widgetPinnedKey) }
    }

    private var widgetCompactPreference: Bool {
        get { UserDefaults.standard.object(forKey: Self.widgetCompactKey) as? Bool ?? false }
        set { UserDefaults.standard.set(newValue, forKey: Self.widgetCompactKey) }
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.appearance = nil  // follow system appearance (让 Web 端 prefers-color-scheme 也跟着变)
        Task { await self.startServer() }
        startWatchdog()          // 周期探测本地服务，异常时自动重启
        Task { @MainActor in self.showDesktopWidget() }   // 按上次开关状态显示桌面浮窗
    }

    func applicationWillTerminate(_ notification: Notification) {
        isTerminating = true
        watchdogTimer?.invalidate()
        watchdogTimer = nil
        if let p = serverProcess, p.isRunning { p.terminate() }
    }

    // MARK: - 服务看护（自修复）

    /// 每 15 秒探测一次本地服务：端口漂移则改绑，进程死亡则自动重启。
    /// 没有这层保护时，服务一旦退出会导致 AI 与同步静默失效（用户只能看到“连接失败”）。
    private func startWatchdog() {
        watchdogTimer?.invalidate()
        watchdogTimer = Timer.scheduledTimer(withTimeInterval: 15, repeats: true) { [weak self] _ in
            Task { await self?.watchdogTick() }
        }
    }

    func watchdogTick() async {
        guard !isTerminating else { return }
        // 安装包必须只看护自己启动的 bundle 内服务；否则 4177 上残留的旧开发服务
        // 会被误认为健康服务，导致安装新版后 WebView 仍显示旧代码。
        if serverPort > 0,
           (!usesBundledRuntime || serverProcess?.isRunning == true),
           await isHealthy(port: serverPort) {
            restartAttempts = 0
            return
        }
        // 端口漂移：服务可能已由其他实例重启，或当前端口已失效。
        if let live = await findLiveServer(preferred: serverPort > 0 ? serverPort : nil) {
            restartAttempts = 0
            if live != serverPort {
                adoptServerPort(live)
                await MainActor.run { WorkspaceStore.shared.bind(port: live) }
                logger.info("已重新绑定健康的本地服务端口 \(live)")
            }
            return
        }
        // 确认没有可用服务，才重启；带退避与次数上限，避免重启风暴。
        let now = Date()
        guard now.timeIntervalSince(lastRestartAt) >= 5 else { return }
        lastRestartAt = now
        restartAttempts += 1
        guard restartAttempts <= 5 else {
            logger.error("本地服务连续重启失败，已暂停自动恢复，等待下次触发")
            return
        }
        logger.info("本地服务无响应，正在自动重启（第 \(self.restartAttempts) 次）")
        await startServer()
    }

    @MainActor
    func attachWeb(_ web: WebController) {
        self.webController = web
        self.mainWindow = web.window
        let voice = VoiceController { [weak web] payload in
            web?.sendNativeSpeech(payload)
        }
        voice.preparePermissions { [weak self] granted in
            self?.voiceController = granted ? voice : nil
        }
    }

    // MARK: - Node 服务管理

    private func startServer() async {
        // 开发环境可以复用已有服务；可分发 bundle 必须启动自己的内嵌服务，
        // 避免复用其它版本占用 4177/4178 的服务而出现“安装后界面没更新”。
        let existing = usesBundledRuntime ? nil : await findExistingServer()
        if let port = existing {
            adoptServerPort(port)
            logger.info("复用现有 To Do 服务 http://127.0.0.1:\(port)")
            await MainActor.run { WorkspaceStore.shared.bind(port: port) }
            return
        }
        let port = pickFreePort() ?? 4177
        let serverDir = resolveServerDir()
        let node = resolveNode()
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: node)
        // /usr/bin/env 需要把 node 作为第一个参数；其他路径直接执行 Node。
        proc.arguments = node == "/usr/bin/env"
            ? ["node", serverDir + "/server.js"]
            : [serverDir + "/server.js"]
        proc.currentDirectoryURL = URL(fileURLWithPath: serverDir)
        var env = ProcessInfo.processInfo.environment
        env["PORT"] = String(port)
        env["HOST"] = "127.0.0.1"
        proc.environment = env
        let pipe = Pipe()
        proc.standardOutput = pipe
        proc.standardError = pipe
        // Node 将请求错误写到 stderr；没有消费者时 Pipe 会被填满，随后阻塞服务进程。
        pipe.fileHandleForReading.readabilityHandler = { handle in
            if handle.availableData.isEmpty { handle.readabilityHandler = nil }
        }
        proc.terminationHandler = { [weak self] process in
            guard let self else { return }
            self.logger.error("本地 To Do 服务已退出，状态码：\(process.terminationStatus)")
            // 被动退出时立即触发一次自愈检查；主动退出 app 时由 isTerminating 拦截。
            Task { await self.watchdogTick() }
        }
        do {
            try proc.run()
            self.serverProcess = proc
            adoptServerPort(port)
            logger.info("已启动 To Do 服务 http://127.0.0.1:\(port) (cwd=\(serverDir))")
            // server.js 有顶层 await，proc.run() 返回时端口可能尚未开始监听。
            // 等健康检查成功后再绑定菜单栏数据源，避免首次读取永久停在错误态。
            _ = await waitUntilHealthy(port: port, process: proc)
            await MainActor.run { WorkspaceStore.shared.bind(port: port) }
        } catch {
            self.serverProcess = nil
            self.serverPort = 0
            logger.error("启动 To Do 服务失败：\(error.localizedDescription, privacy: .public)")
            await MainActor.run { WorkspaceStore.shared.bind(port: 0) }
        }
    }

    private func findExistingServer() async -> Int? {
        await findLiveServer(preferred: nil)
    }

    /// 在连接错误后只做一次候选端口探测，用于纠正旧端口文件或端口变更。
    func findLiveServer(preferred: Int?) async -> Int? {
        if usesBundledRuntime {
            guard serverProcess?.isRunning == true, let preferred, (1...65535).contains(preferred) else { return nil }
            return await isHealthy(port: preferred) ? preferred : nil
        }
        var candidates: [Int] = []
        if let preferred, (1...65535).contains(preferred) { candidates.append(preferred) }
        if let port = readPortFile() { candidates.append(port) }
        candidates.append(contentsOf: [4177, 4178, 4179, 4180])
        var seen = Set<Int>()
        for port in candidates where seen.insert(port).inserted {
            if await isHealthy(port: port) { return port }
        }
        return nil
    }

    private func waitUntilHealthy(port: Int, process: Process) async -> Bool {
        for _ in 0..<20 {
            if await isHealthy(port: port) { return true }
            if !process.isRunning || Task.isCancelled { return false }
            try? await Task.sleep(nanoseconds: 250_000_000)
        }
        return false
    }

    private func isHealthy(port: Int) async -> Bool {
        guard let url = URL(string: "http://127.0.0.1:\(port)/api/health") else { return false }
        var req = URLRequest(url: url, timeoutInterval: 1.5)
        req.httpMethod = "GET"
        do {
            let (_, resp) = try await URLSession.shared.data(for: req)
            if let http = resp as? HTTPURLResponse, http.statusCode == 200 { return true }
        } catch { }
        return false
    }

    private func pickFreePort() -> Int? {
        // 优先使用固定端口，保持 WKWebView origin 稳定；都被占用时再让系统分配。
        for requestedPort in [4177, 4178, 4179, 4180, 0] {
            let sock = socket(AF_INET, SOCK_STREAM, 0)
            guard sock >= 0 else { continue }
            var addr = sockaddr_in()
            addr.sin_family = sa_family_t(AF_INET)
            addr.sin_addr.s_addr = inet_addr("127.0.0.1")
            addr.sin_port = UInt16(requestedPort).bigEndian
            var len = socklen_t(MemoryLayout<sockaddr_in>.size)
            let r = withUnsafePointer(to: &addr) { ptr in
                ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { addrPtr in
                    Darwin.bind(sock, addrPtr, len)
                }
            }
            guard r == 0 else { close(sock); continue }
            var bound = sockaddr_in()
            let r2 = withUnsafeMutablePointer(to: &bound) { ptr in
                ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { addrPtr in
                    getsockname(sock, addrPtr, &len)
                }
            }
            close(sock)
            if r2 == 0 { return Int(UInt16(bigEndian: bound.sin_port)) }
        }
        return nil
    }

    // MARK: - 资源定位

    /// 将 Info.plist 中相对于 Contents/Resources 的路径解析到当前 bundle。
    /// 只接受 bundle 内路径，避免构建机临时目录或路径穿越进入运行时。
    private func bundledResourcePath(infoKey: String, defaultRelativePath: String) -> String? {
        guard let resourceURL = Bundle.main.resourceURL else { return nil }
        let configured = (Bundle.main.object(forInfoDictionaryKey: infoKey) as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let relativePath: String
        if let configured, !configured.isEmpty, !configured.hasPrefix("/") {
            relativePath = configured
        } else {
            relativePath = defaultRelativePath
        }
        let resourceRoot = resourceURL.standardizedFileURL
        let candidate = resourceRoot.appendingPathComponent(relativePath).standardizedFileURL
        guard candidate.path == resourceRoot.path || candidate.path.hasPrefix(resourceRoot.path + "/") else {
            return nil
        }
        return candidate.path
    }

    private func isUsableServerDirectory(_ path: String) -> Bool {
        let serverFile = URL(fileURLWithPath: path).appendingPathComponent("server.js").path
        return FileManager.default.fileExists(atPath: serverFile)
    }

    private var usesBundledRuntime: Bool {
        guard let bundled = bundledResourcePath(infoKey: "ServerProjectPath", defaultRelativePath: "server") else { return false }
        return isUsableServerDirectory(bundled)
    }

    private func resolveNode() -> String {
        // 已安装的 app 优先使用自己的 Node，避免依赖目标机器的 PATH 或预装版本。
        if let bundled = bundledResourcePath(infoKey: "NodeBinaryPath", defaultRelativePath: "node/bin/node"),
           FileManager.default.isExecutableFile(atPath: bundled) {
            return bundled
        }
        // 开发环境允许显式覆盖，兼容从源码或旧 bundle 启动。
        let env = ProcessInfo.processInfo.environment["NODE_BINARY"]
        if let p = env, FileManager.default.isExecutableFile(atPath: p) { return p }
        if let baked = Bundle.main.object(forInfoDictionaryKey: "NodeBinaryPath") as? String,
           baked.hasPrefix("/"),
           FileManager.default.isExecutableFile(atPath: baked) {
            return baked
        }
        let candidates = [
            "/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node",
            "/opt/homebrew/bin/node",
            "/usr/local/bin/node",
            "/usr/bin/node"
        ]
        for path in candidates where FileManager.default.isExecutableFile(atPath: path) { return path }
        return "/usr/bin/env"  // last resort: rely on PATH
    }

    private func resolveServerDir() -> String {
        // 新 bundle 将服务放在 Contents/Resources/server，路径随 app 一起移动。
        if let bundled = bundledResourcePath(infoKey: "ServerProjectPath", defaultRelativePath: "server"),
           isUsableServerDirectory(bundled) {
            return bundled
        }
        // 兼容旧版开发 bundle：Info.plist 里可能仍是构建机上的绝对路径。
        if let baked = Bundle.main.object(forInfoDictionaryKey: "ServerProjectPath") as? String,
           baked.hasPrefix("/"),
           isUsableServerDirectory(baked) {
            return baked
        }
        return FileManager.default.currentDirectoryPath
    }

    var baseURL: URL? { serverPort > 0 ? URL(string: "http://127.0.0.1:\(serverPort)/") : nil }

    func adoptServerPort(_ port: Int) {
        serverPort = port
        writePortFile(port)
    }

    @MainActor
    func openMainWindow() {
        let window = webController?.window ?? mainWindow ?? NSApp.windows.first {
            !($0 is NSPanel) && $0.contentView != nil
        }
        guard let window else { return }
        mainWindow = window
        NSApp.activate(ignoringOtherApps: true)
        window.makeKeyAndOrderFront(nil)
        webController?.switchView("focus")
    }

    /// 把当前服务端口写到共享文件，供现有本地工具读取。
    private func writePortFile(_ port: Int) {
        try? "\(port)".write(toFile: Self.serverPortFilePath, atomically: true, encoding: .utf8)
    }

    private func readPortFile() -> Int? {
        guard let raw = try? String(contentsOfFile: Self.serverPortFilePath, encoding: .utf8),
              let port = Int(raw.trimmingCharacters(in: .whitespacesAndNewlines)),
              (1...65535).contains(port) else { return nil }
        return port
    }
}

// MARK: - 主视图（玻璃底 + 透明 Web 视图）

struct ContentView: NSViewRepresentable {
    let delegate: AppDelegate

    func makeNSView(context: Context) -> NSView {
        let container = NSView()
        container.wantsLayer = true

        let visualEffect = NSVisualEffectView()
        visualEffect.material = .underWindowBackground
        visualEffect.state = .followsWindowActiveState
        visualEffect.blendingMode = .behindWindow
        visualEffect.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(visualEffect)

        let webConfig = WKWebViewConfiguration()
        let userContent = WKUserContentController()
        let web = WebController(configuration: webConfig, userContent: userContent, delegate: delegate)
        web.translatesAutoresizingMaskIntoConstraints = false
        web.setValue(false, forKey: "drawsBackground")
        web.setValue(false, forKey: "drawsTransparentBackground")
        container.addSubview(web)

        NSLayoutConstraint.activate([
            visualEffect.topAnchor.constraint(equalTo: container.topAnchor),
            visualEffect.bottomAnchor.constraint(equalTo: container.bottomAnchor),
            visualEffect.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            visualEffect.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            web.topAnchor.constraint(equalTo: container.topAnchor),
            web.bottomAnchor.constraint(equalTo: container.bottomAnchor),
            web.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            web.trailingAnchor.constraint(equalTo: container.trailingAnchor)
        ])

        delegate.attachWeb(web)
        return container
    }

    func updateNSView(_ nsView: NSView, context: Context) {}
}

// MARK: - WKWebView 控制器（带原生语音桥）

class WebController: WKWebView, WKNavigationDelegate {
    private var voiceHandler: NativeSpeechHandler?
    private var reloadObserver: NSObjectProtocol?
    weak var appDelegate: AppDelegate?

    init(configuration: WKWebViewConfiguration, userContent: WKUserContentController, delegate: AppDelegate) {
        // 必须在 super.init 之前把 userContentController 挂进 configuration：
        // WKWebView 初始化时就拷贝了 configuration，之后再赋值不会生效，
        // 会导致 nativeSpeech 消息处理器注册不上（原生语音桥失效）。
        let handler = NativeSpeechHandler()
        userContent.add(handler, name: "nativeSpeech")
        configuration.userContentController = userContent
        super.init(frame: .zero, configuration: configuration)
        self.appDelegate = delegate
        self.voiceHandler = handler
        handler.web = self
        handler.voice = { [weak self] payload in
            guard let self = self else { return }
            let json = (try? JSONSerialization.data(withJSONObject: payload, options: [])) ?? Data("{}".utf8)
            let str = String(data: json, encoding: .utf8) ?? "{}"
            self.evaluateJavaScript("window.__nativeSpeechUpdate && window.__nativeSpeechUpdate(\(str));", completionHandler: nil)
        }
        self.navigationDelegate = self
        self.loadApp(afterStart: delegate)
    }

    required init?(coder: NSCoder) { fatalError() }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        if let window {
            appDelegate?.mainWindow = window
        }
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.allow)
            return
        }
        guard !isLocalNavigation(url) else {
            decisionHandler(.allow)
            return
        }
        NSWorkspace.shared.open(url)
        decisionHandler(.cancel)
    }

    private func isLocalNavigation(_ url: URL) -> Bool {
        let scheme = url.scheme?.lowercased()
        if scheme == nil || scheme == "about" || url.isFileURL { return true }
        guard scheme == "http" || scheme == "https",
              let host = url.host?.lowercased() else {
            return false
        }
        return host == "127.0.0.1" || host == "localhost" || host == "::1"
    }

    private func loadApp(afterStart delegate: AppDelegate) {
        Task { @MainActor [weak self] in
            // 旧版离线缓存会拦截首页，忽略 URLRequest 的刷新策略。
            // 只清网页资源和 Service Worker，保留登录、localStorage 和其他用户数据。
            await self?.configuration.websiteDataStore.removeData(
                ofTypes: [WKWebsiteDataTypeDiskCache, WKWebsiteDataTypeMemoryCache,
                          WKWebsiteDataTypeFetchCache, WKWebsiteDataTypeServiceWorkerRegistrations],
                modifiedSince: .distantPast
            )
            for _ in 0..<40 {
                guard let self else { return }
                if let url = delegate.baseURL {
                    let health = url.appendingPathComponent("api/health")
                    if let (_, response) = try? await URLSession.shared.data(for: URLRequest(url: health, timeoutInterval: 1)),
                       (response as? HTTPURLResponse)?.statusCode == 200 {
                        self.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData))
                        return
                    }
                }
                try? await Task.sleep(nanoseconds: 250_000_000)
            }
            self?.loadHTMLString("<html lang='zh-CN'><body style='font:16px -apple-system;padding:48px'><h2>暂时连接不上本机服务</h2><p>请关闭后重新打开轻量项目助理。</p></body></html>", baseURL: nil)
        }
    }

    @objc func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        evaluateJavaScript("document.documentElement.setAttribute('data-native','1')", completionHandler: nil)
    }

    // 命令转发
    func openNewTaskModal() { evaluateJavaScript("window.__todoNativeCommand && window.__todoNativeCommand('new-task');", completionHandler: nil) }
    func focusQuickAdd() { evaluateJavaScript("(function(){var i=document.getElementById('quick-title'); if(i){i.focus(); i.select&&i.select();}})();", completionHandler: nil) }
    func requestRefresh() { evaluateJavaScript("window.__todoNativeCommand && window.__todoNativeCommand('sync');", completionHandler: nil) }
    func switchView(_ key: String) { evaluateJavaScript("window.__todoNativeCommand && window.__todoNativeCommand('view','\(key)');", completionHandler: nil) }
    func sendNativeSpeech(_ payload: [String: Any]) {
        let json = (try? JSONSerialization.data(withJSONObject: payload, options: [])) ?? Data("{}".utf8)
        let str = String(data: json, encoding: .utf8) ?? "{}"
        evaluateJavaScript("window.__nativeSpeechUpdate && window.__nativeSpeechUpdate(\(str));", completionHandler: nil)
    }
}

// MARK: - Web ↔ Swift 语音桥接

class NativeSpeechHandler: NSObject, WKScriptMessageHandler {
    weak var web: WKWebView?
    var voice: (([String: Any]) -> Void)?

    func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "nativeSpeech", let body = message.body as? [String: Any] else { return }
        let action = body["action"] as? String
        if action == "toggle" {
            VoiceController.shared?.toggle()
        }
    }
}

// MARK: - 原生语音（SFSpeechRecognizer）

class VoiceController: NSObject, SFSpeechRecognizerDelegate {
    static private(set) var shared: VoiceController?
    private let recognizer: SFSpeechRecognizer? = SFSpeechRecognizer(locale: Locale(identifier: "zh-CN"))
    private let audioEngine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var isRunning = false
    private let onUpdate: ([String: Any]) -> Void

    init(onUpdate: @escaping ([String: Any]) -> Void) {
        self.onUpdate = onUpdate
        super.init()
        recognizer?.delegate = self
        VoiceController.shared = self
    }

    /// 启动时一次性准备权限：只在「尚未决定」时弹系统授权，已授权时完全静默。
    /// 之前把麦克风权限拖到首次录音才请求，导致用户每次用语音都要手动点「允许」。
    func preparePermissions(completion: @escaping (Bool) -> Void) {
        requestSpeechPermission { speechGranted in
            self.requestMicrophonePermission { micGranted in
                completion(speechGranted && micGranted)
            }
        }
    }

    private func requestSpeechPermission(completion: @escaping (Bool) -> Void) {
        switch SFSpeechRecognizer.authorizationStatus() {
        case .authorized:
            completion(true)
        case .notDetermined:
            SFSpeechRecognizer.requestAuthorization { status in
                DispatchQueue.main.async { completion(status == .authorized) }
            }
        default:
            completion(false)
        }
    }

    private func requestMicrophonePermission(completion: @escaping (Bool) -> Void) {
        switch AVCaptureDevice.authorizationStatus(for: .audio) {
        case .authorized:
            completion(true)
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .audio) { granted in
                DispatchQueue.main.async { completion(granted) }
            }
        default:
            completion(false)
        }
    }

    /// 录音前的最终检查：权限不足时给出可操作提示，而不是让系统临时弹窗或静默失败。
    private func ensurePermission() -> Bool {
        let speechOK = SFSpeechRecognizer.authorizationStatus() == .authorized
        let micOK = AVCaptureDevice.authorizationStatus(for: .audio) == .authorized
        guard speechOK && micOK else {
            onUpdate(["state": "error", "error": "请在「系统设置 → 隐私与安全性」中允许本应用使用麦克风与语音识别，然后重试。"])
            return false
        }
        return true
    }

    func toggle() {
        if isRunning { stop() } else { start() }
    }

    private func start() {
        guard ensurePermission() else { return }
        guard let recognizer = recognizer, recognizer.isAvailable else {
            onUpdate(["state": "error", "error": "中文语音识别不可用"])
            return
        }
        if isRunning { stop() }
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        request.requiresOnDeviceRecognition = false
        self.request = request

        let input = audioEngine.inputNode
        let format = input.outputFormat(forBus: 0)
        input.removeTap(onBus: 0)
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            self?.request?.append(buffer)
        }
        audioEngine.prepare()
        do {
            try audioEngine.start()
        } catch {
            onUpdate(["state": "error", "error": "无法启动录音：\(error.localizedDescription)"])
            return
        }
        isRunning = true
        onUpdate(["state": "listening", "message": "正在听，请说出要处理的任务……"])
        task = recognizer.recognitionTask(with: request) { [weak self] result, error in
            guard let self = self else { return }
            if let result = result {
                let text = result.bestTranscription.formattedString
                self.onUpdate(["state": "listening", "transcript": text, "final": result.isFinal])
                if result.isFinal { self.stop() }
            }
            if let error = error {
                self.onUpdate(["state": "error", "error": error.localizedDescription])
                self.stop()
            }
        }
    }

    private func stop() {
        guard isRunning else { return }
        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        task?.cancel()
        request = nil
        task = nil
        isRunning = false
        onUpdate(["state": "finished", "message": "已写入指令框，可以继续修改。"])
    }
}

// MARK: - 菜单栏小组件：数据层

struct TodoList: Decodable {
    let id: String
    let displayName: String
    let isFlagged: Bool

    enum CodingKeys: String, CodingKey { case id, displayName, wellknownListName }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        displayName = try c.decodeIfPresent(String.self, forKey: .displayName) ?? "未命名清单"
        let wellknown = try c.decodeIfPresent(String.self, forKey: .wellknownListName) ?? ""
        isFlagged = wellknown.lowercased() == "flaggedemails"
    }
}

struct TodoTask: Decodable {
    let id: String
    let title: String
    let status: String
    let due: Date?

    enum CodingKeys: String, CodingKey { case id, title, status, dueDateTime, dueDate }

    private struct DateTimeValue: Decodable {
        let dateTime: String?
        let date: String?
        let timeZone: String?
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        title = try c.decodeIfPresent(String.self, forKey: .title) ?? "未命名任务"
        status = try c.decodeIfPresent(String.self, forKey: .status) ?? "notStarted"
        var raw: String? = nil
        var timeZone: String? = nil
        do {
            let value = try c.decodeIfPresent(DateTimeValue.self, forKey: .dueDateTime)
            raw = value?.dateTime ?? value?.date
            timeZone = value?.timeZone
        } catch {
            // 兼容服务端把 dueDateTime 直接返回为字符串的旧格式。
        }
        if raw == nil {
            raw = try c.decodeIfPresent(String.self, forKey: .dueDateTime)
        }
        if raw == nil {
            raw = try c.decodeIfPresent(String.self, forKey: .dueDate)
        }
        due = WorkspaceStore.parseDate(raw, timeZone: timeZone)
    }
}

struct WorkspaceResponse: Decodable {
    let lists: [TodoList]
    let tasksByList: [String: [TodoTask]]
}

struct TaskPatchResponse: Decodable {
    let task: TodoTask
}

struct FocusItem: Identifiable {
    let id: String
    let title: String
    let listId: String
    let listName: String
    let due: Date?
    let isOverdue: Bool
    let isDueToday: Bool
}

@MainActor
class WorkspaceStore: ObservableObject {
    static let shared = WorkspaceStore()

    @Published var focusTasks: [FocusItem] = []
    @Published var statusText: String = "正在连接…"
    @Published var statusIsError = false
    @Published var lastUpdated: Date?
    @Published var totalCount: Int = 0
    @Published var doneCount: Int = 0
    @Published private(set) var busyTaskIDs: Set<String> = []

    private let progressPrefix = "【项目日志】"
    private var port: Int = 0
    private var timer: Timer?
    private var refreshing = false

    private enum StoreError: LocalizedError {
        case invalidResponse
        case httpStatus(Int)
        case invalidTaskResponse

        var errorDescription: String? {
            switch self {
            case .invalidResponse:
                return "服务返回了无效响应"
            case .httpStatus(let status):
                return "HTTP \(status)"
            case .invalidTaskResponse:
                return "服务未确认任务已完成"
            }
        }
    }

    nonisolated static func parseDate(_ raw: String?, timeZone timeZoneIdentifier: String? = nil) -> Date? {
        guard let raw, !raw.isEmpty else { return nil }

        // Graph 常见的 dateTime 带 7 位小数，先去掉超出 Date 精度的部分。
        let value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalized = value.replacingOccurrences(of: "\\.\\d+", with: "", options: .regularExpression)
        let uppercased = normalized.uppercased()
        let hasExplicitTimeZone = uppercased.hasSuffix("Z") ||
            normalized.range(of: "[+-]\\d{2}:?\\d{2}$", options: .regularExpression) != nil
        let timeZone = resolvedTimeZone(timeZoneIdentifier)

        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if hasExplicitTimeZone, let date = iso.date(from: normalized) { return date }
        iso.formatOptions = [.withInternetDateTime]
        if hasExplicitTimeZone, let date = iso.date(from: normalized) { return date }

        // Graph 有时会把 UTC dateTime 返回为无 Z 的字符串，按字段 timeZone 补齐语义。
        if !hasExplicitTimeZone, timeZone.secondsFromGMT() == 0,
           let date = iso.date(from: normalized + "Z") {
            return date
        }

        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = timeZone
        if normalized.count >= 19, normalized.contains("T") {
            formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
            if let date = formatter.date(from: String(normalized.prefix(19))) { return date }
        }
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.date(from: String(normalized.prefix(10)))
    }

    nonisolated private static func resolvedTimeZone(_ identifier: String?) -> TimeZone {
        let value = identifier?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        switch value.lowercased() {
        case "", "local", "local time":
            return .current
        case "utc", "gmt", "z", "etc/utc", "etc/gmt":
            return TimeZone(secondsFromGMT: 0)!
        case "china standard time", "asia/shanghai", "asia/chongqing", "asia/harbin", "asia/urumqi", "prc":
            return TimeZone(identifier: "Asia/Shanghai")!
        default:
            return TimeZone(identifier: value) ?? .current
        }
    }

    func bind(port: Int) {
        self.port = port
        statusText = port > 0 ? "正在连接…" : "同步失败：服务尚未连接"
        statusIsError = port <= 0
        refresh()
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 120, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.refresh() }
        }
    }

    func refresh() {
        guard port > 0 else {
            statusText = "同步失败：服务尚未连接"
            statusIsError = true
            return
        }
        guard !refreshing else { return }
        refreshing = true
        Task { [weak self] in
            guard let self else { return }
            await self.load()
            self.refreshing = false
        }
    }

    private func load() async {
        let requestPort = port
        do {
            applyLoadedWorkspace(try await fetchWorkspace(port: requestPort))
        } catch {
            var finalError: Error = error
            // 端口可能来自旧的运行实例；连接错误时只探测一次当前端口文件和固定候选端口。
            if Self.isConnectionFailure(error),
               let delegate = NSApp.delegate as? AppDelegate,
               let livePort = await delegate.findLiveServer(preferred: requestPort) {
                delegate.adoptServerPort(livePort)
                port = livePort
                do {
                    applyLoadedWorkspace(try await fetchWorkspace(port: livePort))
                    return
                } catch {
                    finalError = error
                }
            }
            statusText = "读取失败：\(finalError.localizedDescription)"
            statusIsError = true
        }
    }

    private func fetchWorkspace(port: Int) async throws -> WorkspaceResponse {
        guard let url = URL(string: "http://127.0.0.1:\(port)/api/workspace") else {
            throw StoreError.invalidResponse
        }
        var req = URLRequest(url: url, timeoutInterval: 5)
        req.cachePolicy = .reloadIgnoringLocalCacheData
        let data = try await requestData(for: req)
        return try JSONDecoder().decode(WorkspaceResponse.self, from: data)
    }

    private func applyLoadedWorkspace(_ workspace: WorkspaceResponse) {
        apply(workspace)
        // 数据已更新，让 WidgetKit 桌面小组件（FocusWidget）尽快刷新。
        WidgetCenter.shared.reloadTimelines(ofKind: "FocusWidget")
    }

    private static func isConnectionFailure(_ error: Error) -> Bool {
        let nsError = error as NSError
        guard nsError.domain == NSURLErrorDomain else { return false }
        return [
            URLError.Code.cannotFindHost.rawValue,
            URLError.Code.cannotConnectToHost.rawValue,
            URLError.Code.networkConnectionLost.rawValue,
            URLError.Code.notConnectedToInternet.rawValue,
            URLError.Code.timedOut.rawValue
        ].contains(nsError.code)
    }

    private func requestData(for request: URLRequest) async throws -> Data {
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw StoreError.invalidResponse
        }
        guard (200..<300).contains(http.statusCode) else {
            throw StoreError.httpStatus(http.statusCode)
        }
        return data
    }

    private func apply(_ ws: WorkspaceResponse) {
        let calendar = Calendar.current
        let todayStart = calendar.startOfDay(for: Date())
        let tomorrowStart = calendar.date(byAdding: .day, value: 1, to: todayStart)!
        var items: [FocusItem] = []
        var total = 0
        var done = 0

        for list in ws.lists where !list.isFlagged {
            for task in (ws.tasksByList[list.id] ?? []) {
                if task.title.hasPrefix(progressPrefix) { continue }
                total += 1
                if task.status == "completed" { done += 1; continue }
                let overdue = task.due.map { $0 < todayStart } ?? false
                let dueToday = task.due.map { $0 >= todayStart && $0 < tomorrowStart } ?? false
                guard overdue || dueToday || task.due == nil else { continue }
                items.append(FocusItem(
                    id: task.id,
                    title: task.title,
                    listId: list.id,
                    listName: list.displayName,
                    due: task.due,
                    isOverdue: overdue,
                    isDueToday: dueToday
                ))
            }
        }

        items.sort { a, b in
            if a.isOverdue != b.isOverdue { return a.isOverdue && !b.isOverdue }
            switch (a.due, b.due) {
            case (let da?, let db?):
                if da != db { return da < db }
            case (_?, nil): return true
            case (nil, _?): return false
            default: break
            }
            return a.title < b.title
        }

        focusTasks = items
        totalCount = total
        doneCount = done
        lastUpdated = Date()
        statusText = "To Do 已连接"
        statusIsError = false
    }

    func toggle(_ item: FocusItem) {
        guard port > 0 else {
            statusText = "完成失败：服务尚未连接"
            statusIsError = true
            return
        }
        guard !busyTaskIDs.contains(item.id) else { return }
        busyTaskIDs.insert(item.id)
        statusText = "正在完成…"
        statusIsError = false

        Task {
            defer { busyTaskIDs.remove(item.id) }
            do {
                guard let url = URL(string: "http://127.0.0.1:\(port)/api/lists/\(item.listId)/tasks/\(item.id)") else {
                    throw StoreError.invalidResponse
                }
                var req = URLRequest(url: url, timeoutInterval: 8)
                req.httpMethod = "PATCH"
                req.addValue("application/json", forHTTPHeaderField: "Content-Type")
                req.httpBody = try JSONSerialization.data(withJSONObject: ["status": "completed"])

                let data = try await requestData(for: req)
                let payload = try JSONDecoder().decode(TaskPatchResponse.self, from: data)
                guard payload.task.id == item.id, payload.task.status == "completed" else {
                    throw StoreError.invalidTaskResponse
                }

                // 只有服务端返回 2xx 且确认同一任务为 completed 时才更新本地列表。
                focusTasks.removeAll { $0.id == item.id }
                doneCount += 1
                statusText = "已完成：\(item.title)"
                statusIsError = false
                await load()
            } catch {
                statusText = "完成失败：\(error.localizedDescription)"
                statusIsError = true
            }
        }
    }

    func isBusy(_ item: FocusItem) -> Bool {
        busyTaskIDs.contains(item.id)
    }
}

// MARK: - 菜单栏小组件：界面

struct MenuBarWidget: View {
    @ObservedObject var store: WorkspaceStore
    let delegate: AppDelegate

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // 头部
            HStack(spacing: 8) {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(.blue)
                    .font(.system(size: 15))
                Text("今日焦点")
                    .font(.system(size: 13, weight: .semibold))
                Spacer()
                if let t = store.lastUpdated {
                    Text(t, style: .time)
                        .font(.system(size: 10))
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 9)

            Divider()

            if store.focusTasks.isEmpty {
                VStack(spacing: 6) {
                    Image(systemName: store.statusIsError ? "wifi.exclamationmark" : "checkmark.seal.fill")
                        .font(.system(size: 22))
                        .foregroundStyle(store.statusIsError ? Color.secondary : Color.green)
                    Text(store.statusIsError ? store.statusText : "今天没有待推进的任务")
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 22)
            } else {
                ScrollView {
                    VStack(spacing: 1) {
                        ForEach(Array(store.focusTasks.prefix(8).enumerated()), id: \.element.id) { _, item in
                            MenuTaskRow(
                                item: item,
                                isBusy: store.isBusy(item),
                                onToggle: { store.toggle(item) },
                                onOpenMain: { delegate.openMainWindow() }
                            )
                        }
                    }
                }
                .frame(maxHeight: 300)
            }

            if store.totalCount > 0 {
                Divider()
                HStack {
                    Text("\(store.doneCount)/\(store.totalCount) 完成")
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                    Spacer()
                    Text(store.statusText)
                        .font(.system(size: 10))
                        .foregroundStyle(store.statusIsError ? Color.red : Color.secondary)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 7)
            }

            Divider()

            // 底部操作
            HStack(spacing: 10) {
                Button {
                    store.refresh()
                } label: {
                    Label("刷新", systemImage: "arrow.clockwise")
                }
                .buttonStyle(.borderless)

                Button {
                    delegate.toggleDesktopWidget()
                } label: {
                    Label("桌面组件", systemImage: "rectangle.on.macwindow")
                }
                .buttonStyle(.borderless)

                Button {
                    delegate.openMainWindow()
                } label: {
                    Label("打开主窗口", systemImage: "macwindow")
                }
                .buttonStyle(.borderless)

                Spacer()

                Button {
                    NSApplication.shared.terminate(nil)
                } label: {
                    Label("退出", systemImage: "power")
                }
                .buttonStyle(.borderless)
            }
            .font(.system(size: 11))
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
        .frame(width: 300)
    }
}

struct MenuTaskRow: View {
    let item: FocusItem
    let isBusy: Bool
    let onToggle: () -> Void
    let onOpenMain: () -> Void
    @State private var hovering = false

    var body: some View {
        HStack(spacing: 9) {
            Button(action: onToggle) {
                Image(systemName: isBusy ? "hourglass" : "circle")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(item.isOverdue ? .red : (item.isDueToday ? .blue : .secondary))
                    .frame(width: 28, height: 28)
            }
            .buttonStyle(.plain)
            .disabled(isBusy)
            .help(isBusy ? "正在完成…" : "标记完成")

            Button(action: onOpenMain) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(item.title)
                        .font(.system(size: 12))
                        .lineLimit(1)
                        .truncationMode(.tail)
                        .foregroundStyle(.primary)
                    HStack(spacing: 4) {
                        Text(item.listName)
                            .font(.system(size: 10))
                            .foregroundStyle(.secondary)
                        if let due = item.due {
                            Text("·")
                                .font(.system(size: 10))
                                .foregroundStyle(.tertiary)
                            Text(MenuTaskRow.dueText(due, overdue: item.isOverdue, today: item.isDueToday))
                                .font(.system(size: 10))
                                .foregroundStyle(item.isOverdue ? .red : .secondary)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.vertical, 3)
            }
            .buttonStyle(.plain)
            .help("在主窗口打开")
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 4)
        .background(hovering ? Color.primary.opacity(0.06) : Color.clear)
        .contentShape(Rectangle())
        .onHover { hovering = $0 }
    }

    static func dueText(_ due: Date, overdue: Bool, today: Bool) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "zh-CN")
        if overdue {
            f.dateFormat = "M月d日"
            return "已逾期 " + f.string(from: due)
        }
        if today {
            f.dateFormat = "HH:mm"
            let s = f.string(from: due)
            return s == "00:00" ? "今天" : "今天 " + s
        }
        return "无到期日"
    }
}

// MARK: - 桌面浮窗小组件（常驻玻璃小窗）

extension AppDelegate {
    /// 创建/显示桌面浮窗。复用 WorkspaceStore 的取数与勾选逻辑。
    @MainActor
    func showDesktopWidget() {
        showDesktopWidget(force: false)
    }

    @MainActor
    private func showDesktopWidget(force: Bool) {
        guard force || widgetVisiblePreference else { return }
        if let w = desktopWindow {
            widgetVisiblePreference = true
            w.orderFront(nil)
            return
        }

        let root = DesktopWidgetView(store: WorkspaceStore.shared, delegate: self) { [weak self] in
            self?.hideDesktopWidget()
        }
        let hosting = NSHostingView(rootView: root)
        hosting.autoresizingMask = [.width, .height]
        let initialHeight = widgetCompactPreference ? Self.widgetCompactHeight : Self.widgetRegularHeight
        let w = DesktopPanel(contentRect: NSRect(x: 0, y: 0, width: Self.widgetWidth, height: initialHeight),
                             styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        w.contentView = hosting
        w.title = "今日焦点"
        w.isOpaque = false
        w.backgroundColor = .clear
        w.hasShadow = true
        w.isReleasedWhenClosed = false
        w.hidesOnDeactivate = false
        w.becomesKeyOnlyIfNeeded = true
        w.isMovableByWindowBackground = true   // 点背景即可拖动
        w.setFrameAutosaveName(Self.widgetFrameName)
        // 该面板没有 .resizable；AppKit 要求非可调整大小窗口使用 force 才会恢复保存的 frame。
        let restored = w.setFrameUsingName(Self.widgetFrameName, force: true)
        if !restored, let screen = NSScreen.main ?? NSScreen.screens.first {
            let r = screen.visibleFrame
            w.setFrameOrigin(NSPoint(x: r.maxX - Self.widgetWidth - 20, y: r.maxY - initialHeight - 20))
        }
        applyWidgetPinned(to: w)
        desktopWindow = w
        widgetVisiblePreference = true
        w.orderFront(nil)
    }

    @MainActor
    func hideDesktopWidget() {
        guard let window = desktopWindow else { return }
        window.saveFrame(usingName: Self.widgetFrameName)
        window.orderOut(nil)
        widgetVisiblePreference = false
    }

    @MainActor
    func toggleDesktopWidget() {
        if desktopWindow?.isVisible == true {
            hideDesktopWidget()
        } else {
            showDesktopWidget(force: true)
        }
    }

    @MainActor
    func setWidgetPinned(_ pinned: Bool) {
        widgetPinnedPreference = pinned
        if let window = desktopWindow {
            applyWidgetPinned(to: window)
            window.saveFrame(usingName: Self.widgetFrameName)
        }
    }

    @MainActor
    func setWidgetCompact(_ compact: Bool, animated: Bool) {
        widgetCompactPreference = compact
        guard let window = desktopWindow else { return }
        let frame = window.frame
        let height = compact ? Self.widgetCompactHeight : Self.widgetRegularHeight
        let target = NSRect(x: frame.minX, y: frame.maxY - height, width: Self.widgetWidth, height: height)
        if animated {
            NSAnimationContext.runAnimationGroup({ context in
                context.duration = 0.18
                context.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
                window.animator().setFrame(target, display: true)
            }) {
                window.saveFrame(usingName: Self.widgetFrameName)
            }
        } else {
            window.setFrame(target, display: true)
            window.saveFrame(usingName: Self.widgetFrameName)
        }
    }

    @MainActor
    private func applyWidgetPinned(to window: NSPanel) {
        let pinned = widgetPinnedPreference
        window.isFloatingPanel = pinned
        window.level = pinned ? .floating : .normal
        window.collectionBehavior = pinned
            ? [.canJoinAllSpaces, .stationary, .ignoresCycle]
            : [.stationary, .ignoresCycle]
    }
}

struct DesktopWidgetView: View {
    @ObservedObject var store: WorkspaceStore
    let delegate: AppDelegate
    let onClose: () -> Void
    @AppStorage(AppDelegate.widgetPinnedKey) private var pinnedMode = true
    @AppStorage(AppDelegate.widgetCompactKey) private var compactMode = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private var visibleLimit: Int { compactMode ? 3 : 8 }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // 头部
            HStack(spacing: 8) {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(.blue)
                    .font(.system(size: 15))
                Text("今日焦点")
                    .font(.system(size: 13, weight: .semibold))
                Spacer()
                if store.totalCount > 0 {
                    Text("\(store.doneCount)/\(store.totalCount)")
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                }
                Button {
                    pinnedMode.toggle()
                    delegate.setWidgetPinned(pinnedMode)
                } label: {
                    Image(systemName: pinnedMode ? "pin.fill" : "pin")
                        .font(.system(size: 12))
                        .foregroundStyle(pinnedMode ? Color.blue : Color.secondary)
                        .frame(width: 28, height: 28)
                }
                .buttonStyle(.plain)
                .help(pinnedMode ? "取消置顶" : "固定置顶")
                Menu {
                    Button(compactMode ? "显示更多任务" : "紧凑显示") {
                        compactMode.toggle()
                        delegate.setWidgetCompact(compactMode, animated: !reduceMotion)
                    }
                    Button("立即同步") { store.refresh() }
                    Divider()
                    Button("隐藏浮窗") { onClose() }
                } label: {
                    Image(systemName: "ellipsis")
                        .font(.system(size: 14, weight: .medium))
                        .frame(width: 28, height: 28)
                }
                .menuStyle(.borderlessButton)
                .menuIndicator(.hidden)
                .fixedSize()
                .help("浮窗选项")
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 9)

            Divider()

            if store.focusTasks.isEmpty {
                VStack(spacing: 6) {
                    Spacer()
                    Image(systemName: store.statusIsError ? "wifi.exclamationmark" : "checkmark.seal.fill")
                        .font(.system(size: 22))
                        .foregroundStyle(store.statusIsError ? Color.secondary : Color.green)
                    Text(store.statusIsError ? store.statusText : "今天没有待推进的任务")
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                    Spacer()
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 22)
            } else {
                ScrollView {
                    VStack(spacing: 1) {
                        ForEach(Array(store.focusTasks.prefix(visibleLimit).enumerated()), id: \.element.id) { _, item in
                            MenuTaskRow(
                                item: item,
                                isBusy: store.isBusy(item),
                                onToggle: { store.toggle(item) },
                                onOpenMain: { delegate.openMainWindow() }
                            )
                        }
                        if store.focusTasks.count > visibleLimit {
                            Text("还有 \(store.focusTasks.count - visibleLimit) 项")
                                .font(.system(size: 10))
                                .foregroundStyle(.secondary)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 6)
                        }
                    }
                }
                .frame(maxHeight: compactMode ? 168 : 300)
            }

            Divider()

            HStack {
                Text(store.statusText)
                    .font(.system(size: 10))
                    .foregroundStyle(store.statusIsError ? .red : .secondary)
                    .lineLimit(1)
                Spacer()
                Button {
                    delegate.openMainWindow()
                } label: {
                    Label("主窗口", systemImage: "macwindow")
                        .font(.system(size: 11))
                        .frame(minHeight: 28)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
        }
        .frame(width: AppDelegate.widgetWidth, height: compactMode ? AppDelegate.widgetCompactHeight : AppDelegate.widgetRegularHeight)
        .modifier(DesktopWidgetSurfaceModifier())
    }
}

private struct DesktopWidgetSurfaceModifier: ViewModifier {
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    @ViewBuilder
    func body(content: Content) -> some View {
        if #available(macOS 26.0, *), !reduceTransparency {
            content.glassEffect(.regular, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        } else if reduceTransparency {
            content
                .background(Color(nsColor: .windowBackgroundColor), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(widgetBorder)
        } else {
            content
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(widgetBorder)
        }
    }

    private var widgetBorder: some View {
        RoundedRectangle(cornerRadius: 14, style: .continuous)
            .stroke(Color.white.opacity(0.16), lineWidth: 1)
    }
}
