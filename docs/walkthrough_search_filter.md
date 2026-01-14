# Search/Filter 功能实现完成

为串口工具添加了 Search（搜索）和 Filter（过滤）双模式功能，并进行了性能优化。

## 功能概览

| 模式 | 功能 | 性能影响 |
|------|------|----------|
| **Search** | 显示全部日志，高亮匹配项 | 低 |
| **Filter** | 只显示匹配行 + 上下文 | 低 |
| **跨行匹配** | 可选开启，支持 `\n` 跨行 | 高（O(n×5)） |

---

## 修改的文件

### [LogEntry.tsx](file:///d:/SerialMaster/src/ui/src/components/Terminal/LogEntry.tsx)

- 新增 `HighlightRange` 接口和 `highlights`、`isCurrentMatch` props
- 实现文本高亮渲染

### [TerminalContainer.tsx](file:///d:/SerialMaster/src/ui/src/components/Terminal/TerminalContainer.tsx)

**UI 优化：**
- Tab 样式 Search/Filter 模式切换（更直观）
- 跨行匹配开关按钮（默认关闭）

**性能优化：**
- 单行匹配算法（O(n)，默认使用）
- 跨行匹配算法（O(n×5)，可选开启）

---

## 截图

![Tab 样式模式切换](C:/Users/cc/.gemini/antigravity/brain/666a58ea-3fc9-4b07-b4ec-70bb0cb57900/search_filter_tabs.png)
