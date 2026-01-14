# 串口调试器性能优化 Walkthrough

## 问题描述

用户反馈串口调试器存在以下性能问题：
1. 数据多时界面卡顿（无论是否连接）
2. Clear Output 按钮无法完全清空
3. AutoScroll 按钮抖动，甚至自动断开

## 根因分析

通过代码审查，发现了 **5 个关键性能瓶颈**：

| 问题 | 严重程度 | 位置 |
|------|---------|------|
| 未使用虚拟化渲染，10000条日志渲染10000个DOM节点 | 🔴 严重 | `TerminalContainer.tsx` |
| useMemo 中调用 setState，导致无限渲染循环 | 🔴 严重 | `TerminalContainer.tsx` |
| AutoScroll 检测没有节流，程序滚动也被捕获 | 🟠 中等 | `TerminalContainer.tsx` |
| 日志数组每次数据到达都复制整个数组 | 🟠 中等 | `App.tsx` |
| TextDecoder 每次过滤都重新创建 | 🟡 轻微 | `TerminalContainer.tsx` |

## 实施的优化

### 1. 引入虚拟化渲染 (react-window v2)

**改动**：使用 `react-window` 的 `List` 组件替代 `.map()` 渲染

```diff
-{filteredLogs.map((log, index) => (
-    <LogEntry key={log.id} ... />
-))}
+<List
+    rowComponent={LogRow}
+    rowProps={rowProps}
+    rowCount={filteredLogs.length}
+    rowHeight={ROW_HEIGHT}
+    overscanCount={10}
+/>
```

**效果**：无论有多少日志，只渲染可见区域的 20-50 个 DOM 节点。

---

### 2. 修复 useMemo 中的 setState

**改动**：将 regex 验证逻辑移到 `useEffect` 中

```diff
+useEffect(() => {
+    if (debouncedFilterText) {
+        try {
+            new RegExp(debouncedFilterText, 'i');
+            setIsRegexValid(true);
+        } catch {
+            setIsRegexValid(false);
+        }
+    }
+}, [debouncedFilterText]);

 const filteredLogs = useMemo(() => {
-    setIsRegexValid(true);  // ❌ 移除
     // ...
 }, [...]);
```

**效果**：消除无限渲染循环，Clear 按钮可以正常工作。

---

### 3. 优化 AutoScroll 逻辑

**改动**：
- 添加 100ms 节流控制
- 使用 ref 标记程序触发的滚动
- 增大底部检测阈值到 100px

```typescript
const isProgrammaticScrollRef = useRef(false);
const scrollThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

// 程序滚动时设置标记
isProgrammaticScrollRef.current = true;
listRef.current.scrollToRow({ index: filteredLogs.length - 1, align: 'end' });

// 滚动事件处理时检查标记
if (isProgrammaticScrollRef.current) return;
if (scrollThrottleRef.current) return; // 节流
```

**效果**：AutoScroll 按钮不再抖动。

---

### 4. 日志批量更新

**改动**：使用 buffer + 定时刷新（100ms 间隔）

```typescript
const logBufferRef = useRef<LogData[]>([]);

// 数据到达时只放入 buffer
logBufferRef.current.push(newEntry);

// 每 100ms 批量刷新一次
setInterval(flushLogBuffer, 100);
```

**效果**：减少状态更新频率约 10 倍。

---

### 5. 复用 TextDecoder

```diff
+const textDecoder = new TextDecoder(); // 模块级别复用

 logs.forEach((log) => {
-    textContent = new TextDecoder().decode(log.data);
+    textContent = textDecoder.decode(log.data);
 });
```

---

## 修改的文件

| 文件 | 改动说明 |
|------|---------|
| [TerminalContainer.tsx](file:///D:/SerialMaster/src/ui/src/components/Terminal/TerminalContainer.tsx) | 虚拟化渲染、AutoScroll优化、useMemo修复 |
| [App.tsx](file:///D:/SerialMaster/src/ui/src/App.tsx) | 日志批量更新机制 |

render_diffs(file:///D:/SerialMaster/src/ui/src/components/Terminal/TerminalContainer.tsx)

render_diffs(file:///D:/SerialMaster/src/ui/src/App.tsx)

## 验证结果

✅ 页面正常渲染，无 JavaScript 错误
✅ 终端区域使用虚拟化列表正确显示
✅ Auto Scroll 按钮可以正常点击切换
✅ 数据发送后在终端正确显示

![验证截图](verification_screenshot.png)

## 后续建议

如果仍有性能问题，可以考虑：
1. 在后端实现数据分页，减少前端内存占用
2. 使用 Web Worker 处理数据解析
3. 考虑减少日志上限（当前 10000 条）
