// 轻量项目助理 · WidgetKit 桌面组件（时间线 / 取数）
import WidgetKit
import SwiftUI

struct FocusEntry: TimelineEntry {
    let date: Date
    let items: [FocusItem]
    let total: Int
    let done: Int
    let connected: Bool
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> FocusEntry {
        FocusEntry(date: Date(), items: Self.sample, total: Self.sample.count, done: 0, connected: true)
    }

    func getSnapshot(in context: Context, completion: @escaping @Sendable (FocusEntry) -> Void) {
        if context.isPreview {
            completion(FocusEntry(date: Date(), items: Self.sample, total: Self.sample.count, done: 0, connected: true))
            return
        }
        let r = loadFocusItems()
        completion(FocusEntry(date: Date(), items: r.items, total: r.total, done: r.done, connected: r.connected))
    }

    func getTimeline(in context: Context, completion: @escaping @Sendable (Timeline<FocusEntry>) -> Void) {
        let r = loadFocusItems()
        let entry = FocusEntry(date: Date(), items: r.items, total: r.total, done: r.done, connected: r.connected)
        // 每 15 分钟刷新一次；用户在前端操作时由 WidgetCenter.reloadTimelines 触发即时刷新。
        let next = Date().addingTimeInterval(15 * 60)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }

    static let sample: [FocusItem] = [
        FocusItem(id: "s1", title: "给客户回邮件", listName: "Tasks", due: Date(), isOverdue: false, isDueToday: true),
        FocusItem(id: "s2", title: "提交本周周报", listName: "Tasks", due: nil, isOverdue: false, isDueToday: false),
        FocusItem(id: "s3", title: "review 设计稿", listName: "Tasks", due: Date().addingTimeInterval(-3600), isOverdue: true, isDueToday: false)
    ]
}
