# Autoscroll 功能设计文档

## 概述

Autoscroll（自动滚动）是终端组件的核心功能之一，用于在接收串口数据时自动将视图滚动到最新内容。本文档详细说明了该功能的设计原则和实现细节。

## 核心需求

| 编号 | 需求描述 |
|------|----------|
| R1 | 未激活时点击按钮，必须能开启并**保持**激活状态 |
| R2 | 激活时点击按钮，必须能**断开**激活状态 |
| R3 | 激活状态下，用户明确的手动操作必须**立即断开**激活状态 |
| R4 | 任何情况下都**不自动激活**，除非用户手动点击按钮 |

## 设计决策

### 用户意图检测策略

经过多次迭代，最终采用**显式用户行为检测**方案，而非滚动位置检测或滚轮事件检测。

#### 被放弃的方案

| 方案 | 问题 |
|------|------|
| 滚轮事件检测 | 数据高频更新时，用户滚轮容易被程序化滚动覆盖，误触发断开 |
| 位置检测 | 依赖 `handleRowsRendered` 回调，响应延迟且易与程序化滚动冲突 |
| `scrollUpdateWasRequested` | react-window v2 不再提供此属性 |

#### 最终方案：点击和滚动条拖动检测

只有以下**明确的用户行为**会触发断开：

1. **点击终端内容区域** (`onClick`)
   - 表明用户想查看或选中特定内容
   - 触发条件简单直接，无误触发风险

2. **点击/拖动滚动条** (`onMouseDown` + 位置判断)
   - 检测点击位置是否在容器右侧 20px 范围内（滚动条区域）
   - 表明用户想手动控制滚动位置

## 实现细节

### 关键状态

```typescript
// 本地状态（同步到配置）
const [autoScroll, setAutoScroll] = useState(config.autoScroll);

// Ref 用于回调中访问最新状态（避免闭包陷阱）
const autoScrollRef = useRef(autoScroll);
useEffect(() => {
    autoScrollRef.current = autoScroll;
}, [autoScroll]);

// 程序化滚动标记（防止触发断开逻辑）
const isProgrammaticScrollRef = useRef(false);

// 用户手动操作冷却时间（点击按钮后短暂忽略事件）
const userManualOverrideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
```

### 状态更新函数

```typescript
const updateAutoScroll = useCallback((val: boolean) => {
    setAutoScroll(val);
    onConfigChange({ autoScroll: val });
}, [onConfigChange]);
```

### 断开触发处理器

```typescript
// 点击终端内容
const handleTerminalClick = useCallback(() => {
    if (autoScrollRef.current) {
        updateAutoScroll(false);
    }
}, [updateAutoScroll]);

// 点击滚动条区域
const handleTerminalMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!autoScrollRef.current) return;
    
    const container = e.currentTarget;
    const rect = container.getBoundingClientRect();
    const scrollbarWidth = 20; // Windows 滚动条约 17px
    const clickX = e.clientX - rect.left;
    const isScrollbarArea = clickX > rect.width - scrollbarWidth;
    
    if (isScrollbarArea) {
        updateAutoScroll(false);
    }
}, [updateAutoScroll]);
```

### 程序化滚动

```typescript
useEffect(() => {
    if (autoScroll && listRef.current && displayLogs.length > 0) {
        isProgrammaticScrollRef.current = true;
        listRef.current.scrollToRow({
            index: displayLogs.length - 1,
            align: 'end',
            behavior: 'auto'
        });
        // 双重 RAF 确保滚动事件完成后再清除标记
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                isProgrammaticScrollRef.current = false;
            });
        });
    }
}, [displayLogs.length, autoScroll]);
```

### 按钮交互

```tsx
<button
    onClick={() => {
        updateAutoScroll(!autoScroll);
        // 设置临时冷却，防止事件处理器立即覆盖
        if (userManualOverrideRef.current) {
            clearTimeout(userManualOverrideRef.current);
        }
        userManualOverrideRef.current = setTimeout(() => {
            userManualOverrideRef.current = null;
        }, 1000);
    }}
>
    Auto Scroll
</button>
```

## 文件位置

- 主要实现：`src/ui/src/components/Terminal/TerminalContainer.tsx`

## 变更历史

| 日期 | 变更内容 |
|------|----------|
| 2026-01-17 | 重构断开检测逻辑，从位置/滚轮检测改为点击/滚动条拖动检测 |
