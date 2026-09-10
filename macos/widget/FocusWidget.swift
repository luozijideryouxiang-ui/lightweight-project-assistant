// 轻量项目助理 · WidgetKit 桌面组件（组件定义）
import WidgetKit
import SwiftUI

struct FocusWidget: Widget {
    let kind = "FocusWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            FocusWidgetView(entry: entry)
                .widgetURL(URL(string: "todo-console://focus"))
        }
        .configurationDisplayName("今日焦点")
        .description("Microsoft To Do 中今天需要推进的任务")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
