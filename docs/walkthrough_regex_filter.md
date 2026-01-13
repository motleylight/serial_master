# Walkthrough - JS-based Regex Filter & Replacement

## 变更摘要 (Summary of Changes)
实现了纯前端 (React) 的实时日志过滤与视图修改功能的，替代了受限的后端 Python 脚本方案。

### 主要功能 (Key Features)
1.  **Regex Filter (正则过滤)**:
    *   在终端工具栏输入 JS 正则表达式 (例如 `Error code: (\d+)`)。
    *   实时过滤日志列表，仅显示匹配行。
    *   **HEX 模式互斥**: 为了避免混淆，HE 模式下禁用此功能。

2.  **Regex Replacement (正则替换)**:
    *   支持使用正则表达式捕获组重写日志显示内容。
    *   **语法**: 输入替换模版，使用 `$1`, `$2` 引用捕获组。
    *   **示例**:
        *   Text: `[INFO] Temp=25.5C`
        *   Filter: `Temp=(\d+\.\d+)`
        *   Replace: `温度: $1`
        *   Result: `温度: 25.5`

3.  **Context View (上下文视图)**:
    *   **Ctx 输入框**: 指定显示匹配行的前后 N 行。
    *   **分隔符**: 自动检测不连续的匹配块，并在中间插入 `---` 虚线分隔符。

4.  **Performance & Safety (性能与安全)**:
    *   **Debounce**: 输入防抖 300ms，保证流畅度。
    *   **Validation**: 实时检测正则语法，错误时输入框标红，防止应用崩溃。
    *   **Virtual Scroll**: 基于 `useMemo` 优化，支持大数据量滚动。

## 文件变更 (File Changes)
*   **[Modified]** `src/ui/src/components/Terminal/TerminalContainer.tsx`: 实现了过滤、替换、上下文逻辑及 UI 控件。
*   **[Modified]** `src/ui/src/components/Terminal/LogEntry.tsx`: 增加了 `SEP`分隔符类型的渲染支持；兼容 `string` 类型的数据显示。
*   **[New]** `src/ui/src/hooks/useDebounce.ts`: 通用防抖 Hook。
*   **[New]** `docs/implementation_plan_regex_filter.md`: 实施计划文档。

## 验证 (Verification)
用户已通过实际操作验证了：
- [x] 过滤功能正常 (Filter)
- [x] 替换与捕获组功能正常 (Replace $1)
- [x] 上下文显示与分隔符正常 (Context & Separator)
