# SerialMaster 用户指南

## 📋 项目概述

**SerialMaster** 是一个基于现代技术栈的跨平台串口调试与自动化工具。

**技术栈：**
- **后端：** Rust + Tauri v2 + Tokio
- **前端：** React + TypeScript + Shadcn UI
- **核心：** `serialport-rs` 串口通信库

## 🚀 快速开始

### 环境要求

- **Rust 工具链:** cargo 1.92.0+
- **Node.js:** 用于前端开发
- **系统支持:** Windows/Linux/macOS

### 环境检查

```bash
# 验证 Rust 安装
cargo --version

# 验证 Tauri CLI
npx tauri --version
```

## 🔧 后端运行

### 核心库验证

SerialMaster 的后端核心库已构建并可正常运行：

```bash
# 构建核心库
cargo build --lib

# 运行后端功能示例
cargo run --bin backend_example
```

**输出示例：**
```
Available serial ports:
  - COM1
  - COM5
  - COM7
  - COM9
  - COM8
  - COM6

SerialManager 功能验证：
✓ 串口检测
✓ 端口打开/关闭
✓ 数据发送
```

### 测试数据生成

```bash
# 向 COM9 发送测试数据（50ms间隔）
cargo run --bin flood_com9
```

## 📁 项目结构

```
SerialMaster/
├── Cargo.toml              # Rust 工作区配置
├── src/
│   ├── lib.rs              # 库入口
│   ├── core/
│   │   └── serial_manager.rs # 串口管理器（核心功能）
│   ├── bin/
│   │   ├── flood_com9.rs   # 测试数据发生器
│   │   └── backend_example.rs # 后端功能演示
│   └── tauri/              # Tauri 应用后端
└── src/ui/                 # React 前端
```

## 🔗 端口共享功能

SerialMaster 支持端口共享模式，允许其他软件同时访问您正在使用的串口。

### 前置条件

需要安装 [com0com](https://sourceforge.net/projects/com0com/) 虚拟串口驱动。

**安装步骤：**
1. 下载 com0com 安装包
2. 以管理员身份运行安装程序
3. 安装完成后重启电脑
4. 在 SerialMaster 中即可使用共享功能

### 使用方法

1. **连接串口**：先正常连接您要使用的物理串口（如 COM8）
2. **启用共享**：点击控制面板中的「共享」按钮
3. **获取虚拟端口**：系统会自动创建虚拟端口（如 COM11）
4. **其他软件连接**：在其他串口软件中连接虚拟端口即可

### 工作原理

```
物理串口 COM8 ←→ SerialMaster ←→ 虚拟端口 COM10
                              ↔ 虚拟端口 COM11 ←→ 其他软件
```

### 常见问题

**Q: 提示 com0com 未安装怎么办？**  
A: 请从 [SourceForge](https://sourceforge.net/projects/com0com/) 下载安装。

**Q: 共享后其他软件连接失败？**  
A: 确保连接共享界面显示的虚拟端口名，而不是原始物理端口。

**Q: 如何关闭共享模式？**  
A: 再次点击「共享」按钮即可关闭。断开串口连接也会自动关闭共享。

## ⚠️ 已知问题与解决方案

### 1. 测试依赖虚拟串口对

**问题：** 自动化测试需要配对的 COM8 ↔ COM9 虚拟串口。

**解决方案：**
- 安装虚拟串口工具（com0com 或 VSPE）
- 创建配对的 COM8 ↔ COM9 端口
- 验证连接：`cargo test`

### 2. Tauri 编译时文件锁定

**问题：** Windows 防病毒软件或系统服务可能锁定构建文件。

**临时解决方案：**
- 清理构建缓存：`cargo clean`
- 暂时禁用实时防病毒保护
- 在系统资源占用较低时尝试构建

## 🎯 常用命令

```bash
# 1. 核心库功能测试
cargo run --bin backend_example

# 2. 测试数据生成
cargo run --bin flood_com9

# 3. 运行完整测试套件
cargo test

# 4. 构建 Tauri 应用（注意文件锁定问题）
cd src/tauri
cargo build

# 5. 启动完整 GUI 应用（需要解决 Tauri 编译问题）
npx tauri dev
```

## 🔍 故障排除

### 串口访问被拒绝

**现象：** `Failed to open port: 拒绝访问。`

**可能原因：**
1. 端口已被其他程序占用
2. 权限不足（Linux/macOS）
3. 虚拟串口配置错误

**解决方案：**
- 确认端口未被其他串口工具占用
- Windows：以管理员权限运行
- Linux：将用户加入 `dialout` 组

### Tauri 构建失败

**现象：** `failed to remove ... 另一个程序正在使用此文件`

**解决方案：**
1. 关闭所有占用 target/ 目录的进程
2. 使用 `cargo clean` 清理缓存
3. 重启系统后重试

## 📈 开发路线（参考）

当前项目状态对应 **Phase 0**（基础设施与测试回路搭建）：

- ✅ Rust + Tauri 项目骨架
- ✅ serialport-rs 和 Tokio 集成
- ✅ 串口管理器基础功能
- ⏳ 虚拟串口对测试套件（需配置环境）

**下一步建议：** 配置虚拟串口环境，完成 Phase 0 的自动化测试验证。

## 📞 技术支持

如遇问题：
1. 检查本文档的"故障排除"章节
2. 验证环境配置是否符合要求
3. 确保虚拟串口配置正确

---

*最后更新：2026-01-12*
*项目状态：后端核心功能已验证，GUI 应用待优化构建环境*
