// 轻量项目助理 · WidgetKit 桌面组件（共享数据层）
// 解析 /api/workspace 的返回，挑出「今日焦点」任务。
import Foundation

let PROGRESS_PREFIX = "【项目日志】"
let PORT_FILE = "/tmp/com.local.MicrosoftTodoFocusConsole.serverport"

// MARK: - 解码模型（与 /api/workspace 的 JSON 对应）

struct WList: Decodable, Identifiable {
    let id: String
    let displayName: String
    let wellknownListName: String?
    var isFlagged: Bool { (wellknownListName ?? "").lowercased() == "flaggedemails" }
}

struct WTask: Decodable, Identifiable {
    let id: String
    let title: String
    let status: String
    let due: Date?

    enum CodingKeys: String, CodingKey { case id, title, status, dueDateTime, dueDate }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        title = try c.decodeIfPresent(String.self, forKey: .title) ?? "未命名任务"
        status = try c.decodeIfPresent(String.self, forKey: .status) ?? "notStarted"
        var raw: String? = nil
        if let s = try? c.decodeIfPresent(String.self, forKey: .dueDateTime) { raw = s }
        else if let s = try? c.decodeIfPresent(String.self, forKey: .dueDate) { raw = s }
        else if let obj = try? c.decodeIfPresent([String: String].self, forKey: .dueDateTime) { raw = obj["dateTime"] ?? obj["date"] }
        due = parseDate(raw)
    }
}

struct WResponse: Decodable {
    let lists: [WList]
    let tasksByList: [String: [WTask]]
}

struct FocusItem: Identifiable {
    let id: String
    let title: String
    let listName: String
    let due: Date?
    let isOverdue: Bool
    let isDueToday: Bool
}

// MARK: - 工具

func parseDate(_ raw: String?) -> Date? {
    guard let s = raw, !s.isEmpty else { return nil }
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let d = f.date(from: s) { return d }
    let trimmed = s.replacingOccurrences(of: "\\.\\d+", with: "", options: .regularExpression)
    f.formatOptions = [.withInternetDateTime]
    if let d = f.date(from: trimmed) { return d }
    f.formatOptions = [.withFullDate]
    return f.date(from: String(trimmed.prefix(10)))
}

/// 读取主程序写入的端口；默认 4177（主程序优先用 4177）。
func resolvePort() -> Int {
    if let s = try? String(contentsOfFile: PORT_FILE, encoding: .utf8),
       let p = Int(s.trimmingCharacters(in: .whitespacesAndNewlines)), p > 0 {
        return p
    }
    return 4177
}

/// 同步拉取并挑出今日焦点任务。Widget 进程与主机进程隔离，通过 localhost HTTP 取数。
func loadFocusItems() -> (items: [FocusItem], total: Int, done: Int, connected: Bool) {
    let port = resolvePort()
    guard let url = URL(string: "http://127.0.0.1:\(port)/api/workspace") else {
        return ([], 0, 0, false)
    }
    var req = URLRequest(url: url, timeoutInterval: 4)
    req.cachePolicy = .reloadIgnoringLocalCacheData

    let sem = DispatchSemaphore(value: 0)
    var result: (items: [FocusItem], total: Int, done: Int, connected: Bool) = ([], 0, 0, false)
    let task = URLSession.shared.dataTask(with: req) { data, _, err in
        defer { sem.signal() }
        guard let data = data, err == nil else { return }
        guard let decoded = try? JSONDecoder().decode(WResponse.self, from: data) else { return }
        result = buildFocus(from: decoded)
    }
    task.resume()
    sem.wait()
    return result
}

func buildFocus(from decoded: WResponse) -> (items: [FocusItem], total: Int, done: Int, connected: Bool) {
        let calendar = Calendar.current
        let todayStart = calendar.startOfDay(for: Date())
        let tomorrowStart = calendar.date(byAdding: .day, value: 1, to: todayStart)!
        var items: [FocusItem] = []
        var total = 0, done = 0
        for list in decoded.lists where !list.isFlagged {
            for t in (decoded.tasksByList[list.id] ?? []) {
                if t.title.hasPrefix(PROGRESS_PREFIX) { continue }
                total += 1
                if t.status == "completed" { done += 1; continue }
                let overdue = t.due.map { $0 < todayStart } ?? false
                let dueToday = t.due.map { $0 >= todayStart && $0 < tomorrowStart } ?? false
                guard overdue || dueToday || t.due == nil else { continue }
                items.append(FocusItem(
                    id: t.id, title: t.title, listName: list.displayName,
                    due: t.due, isOverdue: overdue, isDueToday: dueToday))
            }
        }
        items.sort {
            if $0.isOverdue != $1.isOverdue { return $0.isOverdue && !$1.isOverdue }
            switch ($0.due, $1.due) {
            case (let da?, let db?): if da != db { return da < db }
            case (_?, nil): return true
            case (nil, _?): return false
            default: break
            }
            return $0.title < $1.title
        }
        return (items, total, done, true)
    }
