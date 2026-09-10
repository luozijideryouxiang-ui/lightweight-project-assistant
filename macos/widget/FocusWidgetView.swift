// 轻量项目助理 · WidgetKit 桌面组件（界面）
import SwiftUI
import WidgetKit

struct FocusWidgetView: View {
    var entry: FocusEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // 头部
            HStack(spacing: 6) {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(.blue)
                    .font(.system(size: 14))
                Text("今日焦点")
                    .font(.system(size: 13, weight: .semibold))
                Spacer()
                if entry.connected {
                    Text("\(entry.done)/\(entry.total)")
                        .font(.system(size: 10))
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                } else {
                    Text("未连接")
                        .font(.system(size: 10))
                        .foregroundStyle(.secondary)
                }
            }

            Divider()

            if entry.items.isEmpty {
                VStack(spacing: 6) {
                    Spacer()
                    Image(systemName: entry.connected ? "checkmark.seal.fill" : "wifi.exclamationmark")
                        .font(.system(size: 20))
                        .foregroundStyle(entry.connected ? .green : .secondary)
                    Text(entry.connected ? "今天没有待推进的任务" : "请先打开主程序")
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                    Spacer()
                }
                .frame(maxWidth: .infinity)
            } else {
                ForEach(Array(entry.items.prefix(7).enumerated()), id: \.element.id) { _, item in
                    HStack(spacing: 7) {
                        Image(systemName: "circle")
                            .font(.system(size: 11))
                            .foregroundStyle(item.isOverdue ? .red : (item.isDueToday ? .blue : .secondary))
                        Text(item.title)
                            .font(.system(size: 11))
                            .lineLimit(1)
                            .truncationMode(.tail)
                            .foregroundStyle(.primary)
                        Spacer(minLength: 0)
                        if let due = item.due {
                            Text(dueText(due, overdue: item.isOverdue, today: item.isDueToday))
                                .font(.system(size: 9))
                                .foregroundStyle(item.isOverdue ? .red : .secondary)
                        }
                    }
                }
                Spacer(minLength: 0)
            }
        }
        .padding(11)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .containerBackground(for: .widget) {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(.ultraThinMaterial)
        }
    }

    private func dueText(_ due: Date, overdue: Bool, today: Bool) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "zh-CN")
        if overdue {
            f.dateFormat = "M/d"
            return "逾期" + f.string(from: due)
        }
        if today {
            f.dateFormat = "HH:mm"
            let s = f.string(from: due)
            return s == "00:00" ? "今天" : "今天 " + s
        }
        return "无期限"
    }
}
