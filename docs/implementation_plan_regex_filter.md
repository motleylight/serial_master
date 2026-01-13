# 实施计划 - 基于 JS 的正则表达式过滤功能
# Implementation Plan - JS-based Regex Filtering

## 目标 (Goal)
在前端 (React) 实现实时的正则表达式 (Regex) 过滤功能，允许用户过滤终端日志或高亮关注点，以此替代暂不可用的后端 Python 正则功能。

## 理由 (Rationale)
用户发现后端 Python 引擎因缺失标准库 (`re` 模块) 而无法进行复杂的文本处理。基于前端 JavaScript 的 RegExp 解决方案具有以下优势：
1.  **完整正则支持**: 利用浏览器原生的 V8 RegExp 引擎 (高性能，功能完整)。
2.  **实时反馈**: 过滤即时生效，无需后端往返。
3.  **非破坏性**: 仅过滤日志的**视图 (View)**，内存中的原始数据保持完整，随时可以恢复显示。

## 提议变更 (Proposed Changes)

### 1. UI 更新 (`TerminalContainer.tsx`)
-   在终端标题栏 (Terminal Header) 内部添加 **过滤工具栏 (Filter Toolbar)**。
-   **组件**:
    -   `Input` (Filter): 用于输入匹配正则表达式 (例如 `Value=(\d+)`)。
    -   `Input` (Replace): *[新增]* 用于输入替换模版 (例如 `Val: $1`)，支持 `$1`, `$2` 等捕获组引用。
    -   `Toggle`: 启用/禁用 "Replace View" 模式。
    -   `Badge`: 显示当前匹配的行数。

### 2. 逻辑实现
-   **状态管理 (State Management)**:
    -   `filterPattern`: string (匹配正则)
    -   `replacePattern`: string (替换模版) *[新增]*
    -   `isFilterActive`: boolean (启用过滤)
    -   `isReplaceActive`: boolean (启用替换) *[新增]*
    -   `contextLines`: number (上下文行数) *[新增]*
-   **处理逻辑 (Processing Logic)**:
    1.  **转换**: 二进制 -> 字符串
    2.  **索引 (Indexing)**: 遍历所有行，找出匹配正则的行索引 `matches[]`。
    3.  **上下文扩展 (Context Expansion)**: 对每个匹配索引 `i`，将 `[i - context, i + context]` 加入显示集合 `displaySet`。
    4.  **构建列表 (Build List)**: 遍历排序后的 `displaySet`。如果当前行索引与上一行不连续，插入一个 "Separator" (空行/分隔符)。
    5.  **替换 (Transform)**: 对最终显示的行应用替换逻辑 (Separator 除外)。

### 3. 安全性与性能
-   **防抖 (Debounce)**: 两个输入框均需防抖。
-   **错误处理**: 捕获无效正则。

## 任务分解 (Work Breakdown)

### 第一阶段: 过滤与替换 UI
- [ ] 修改 `TerminalContainer`，添加 Filter/Replace 输入框和开关。
- [ ] 实现 `filteredLogs` 计算逻辑：先 Filter 再 Replace。
- [ ] 支持 `$1` 等捕获组替换 (JS `replace` 原生支持，无需额外逻辑)。
- [ ] 添加防抖与错误提示。


### 第二阶段: 优化 (后续/可选)
- [ ] "反向过滤" 模式 (排除匹配项)。
- [ ] "仅高亮" 模式 (保留所有行，将匹配文本标红)。
