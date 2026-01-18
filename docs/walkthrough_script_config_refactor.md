# 脚本配置更新演练

我已完成脚本配置系统的更新，现在 `config.yaml` 将独立保存所有四种脚本模式的内容（发送/接收 * JS/外部命令）。

## 变更内容

### 1. 配置结构更新 (`useAppConfig.ts`)
更新了 `ScriptStateConfig` 接口，现在显式包含 `js` 和 `external` 两个独立字段。

```typescript
export interface ScriptStateConfig {
    type: 'js' | 'external' | null;
    js: string;      // 独立的 JS 脚本内容
    external: string;// 独立的外部命令内容
}
```

### 2. 服务逻辑更新 (`ScriptService.ts`)
- 更新了 `ScriptService` 以匹配新的配置结构。
- 实现了 `updateTx` 和 `updateRx` 方法，支持单独更新 `js` 或 `external` 内容。
- 优化了与后端的同步逻辑：只有在模式为 `external` 时才向后端发送命令字符串，模式为 `js` 时后端收到空字符串（因为 JS 在前端执行）。

### 3. 编辑器改进 (`ScriptEditor.tsx`)
- **移除了 LocalStorage**: 不再依赖本地存储来保存草稿。
- **直接同步**: 编辑器现在的每一次输入都会实时同步到 `ScriptService` (进而触发 Config 保存)。
- **非破坏性停止**: 点击主界面或编辑器中的 "Stop" 按钮现在仅停止脚本执行，而**不会清除**您编写的脚本内容。

## 验证与测试
建议进行以下测试以验证更改：

1. 打开脚本编辑器。
2. 在 **JavaScript** 标签页输入一些代码 (例如 `log("JS Test")`)。
3. 切换到 **External Command** 标签页，输入一个命令 (例如 `python test.py`)。
4. 点击 "Apply" (运行) 并测试功能。
5. **重启应用程序**。
6. 再次打开脚本编辑器，确认 JavaScript 和 External Command tab 页中的内容都**各自保留**了下来，且没有互相覆盖。
