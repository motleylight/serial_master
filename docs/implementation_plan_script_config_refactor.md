# 更新脚本配置支持

## 目标描述
确保 `config.yaml` 和应用程序能够正确支持并持久化所有 4 种脚本组合（发送-JS、发送-外部、接收-JS、接收-外部），正如您所指出的那样。

## 需要用户审查
- [ ] 确认 `config.yaml` 的结构变更是否可接受。

## 建议变更
### 前端 (UI)
#### [MODIFY] [useAppConfig.ts](file:///d:/SerialMaster/src/ui/src/hooks/useAppConfig.ts)
- 更新 `ScriptStateConfig` 接口，包含 `js` 和 `external` 字段以分别存储内容。
- 更新 `DEFAULT_CONFIG`。
- 确保向后兼容性（处理缺失字段）。

#### [MODIFY] [ScriptService.ts](file:///d:/SerialMaster/src/ui/src/services/ScriptService.ts)
- 更新 `ScriptState` 以匹配 `ScriptStateConfig`。
- 更新 `syncState` 以处理 `js` 和 `external` 字段。
- 更新 `runTxHook`/`runRxHook` 以根据类型使用正确的内容。
- 更新相关的 setter 方法。

#### [MODIFY] [ScriptEditor.tsx](file:///d:/SerialMaster/src/ui/src/components/ScriptEditor.tsx)
- 移除 `localStorage` 草稿持久化。
- 从 `ScriptService` 初始化组件状态（现在由它保存所有草稿）。
- 更新保存/应用逻辑，调用 `ScriptService` 方法直接更新配置。

## 验证计划
### 手动验证
- [ ] 在 UI 中配置所有 4 种类型，并验证 `config.yaml` 是否正确更新。
- [ ] 重启应用并验证设置是否恢复。
