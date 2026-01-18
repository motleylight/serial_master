# SerialUtil Command & Scripting Guide

SerialUtil 提供了强大的命令管理和脚本自动化功能，支持 Markdown 格式的命令文件和 JavaScript 脚本执行。

## 1. 界面概览

命令面板支持两种视图，点击标题栏右上角的切换按钮即可切换：

- **Grid View (网格视图)**: 卡片式布局，适合快速点击发送常用指令。
- **Editor View (编辑器视图)**: 基于 Monaco Editor 的代码编辑环境，支持只有编辑、语法高亮和脚本编写。

所有命令保存在 `commands.md` 文件中，方便分享和版本管理。

## 2. 命令语法 (Markdown)

SerialUtil 使用标准的 Markdown 格式来定义命令。

### 2.1 普通文本命令
使用 `#` 定义命令名称，下一行紧跟要发送的文本内容。

```markdown
# Hello Command
Hello World
```

### 2.2 Hex (十六进制) 命令
使用一对星号 `*` 包裹十六进制数据。编辑器会自动识别并以 Hex 模式发送。

```markdown
# Send Bytes
*AA 55 01 FF*
```
*提示：编辑器中 Hex 命令会显示特殊的 "HEX" 标识。*

## 3. 脚本系统 (JavaScript)

对于复杂的自动化任务，您可以使用 JavaScript 脚本。脚本运行在独立的 Worker 线程中，不会阻塞界面。

### 3.1 脚本语法
使用 ` ```js ` 代码块包裹脚本内容。

```markdown
# My Script
\`\`\`js
// 脚本内容
\`\`\`
```

### 3.2 内置 API
脚本环境内置了以下能够直接使用的函数（无需 import）：

- **`send(data)`**
  发送数据到串口。
  - `data`: 字符串 (String) 或 数组 (Array/Uint8Array)。
  - 支持 `*AA BB*` 格式的十六进制字符串（会自动识别并以 Hex 发送）。
  - 例: `send("AT\r\n")` 或 `send([0xAA, 0xBB])` 或 `send("*AA BB*")`

- **`delay(ms)`**
  延时等待。**无需使用 await**，系统自动处理。
  - `ms`: 毫秒数。
  - 例: `delay(1000)` (等待1秒)

- **`recv(timeout)`**
  接收串口数据。**无需使用 await**。
  - `timeout`: 超时时间（毫秒），默认为 1000ms。
  - 返回: `Uint8Array` (如果收到数据) 或 `null` (如果超时)。
  - 例: `var data = recv(2000)`

- **`log(msg)`**
  打印日志到系统主界面的日志窗口（显示为紫色 SYS 消息）。
  - `msg`: 要打印的字符串。
  - 例: `log("Test Passed")`

- **`cmd` (Array)**
  包含当前文件所有命令的内容数组（字符串）。
  - `cmd[0]`: 第一条命令的内容。
  - 如果命令是 Hex (如 `*AA BB*`)，则保留星号格式，可直接传给 `send()`。
  - 例: `send(cmd[0])` (自动发送第一条命令的内容)

---

## 4. 脚本示例

以下是三个典型的脚本示例：

### 示例 1: 循环带延时发送
每隔 500ms 发送一次数据，循环 5 次。

```markdown
# Loop Test
\`\`\`js
log("Starting Loop Test...");

for(let i = 1; i <= 5; i++) {
    log("Iteration " + i);
    
    // 发送带有序号的数据
    send([0xAA, i]); 
    
    // 等待 500ms
    delay(500);
}

log("Loop Finished");
\`\`\`
```

### 示例 2: 一发一收 (基本的 AT 指令测试)
发送查询指令，并等待设备回复。

```markdown
# AT Query
\`\`\`js
log("Sending AT Command...");

// 发送查询
send("AT+VERSION\r\n");

// 等待回复 (最多 2000ms)
const resp = recv(2000);

if (resp) {
    // 收到数据，转换为字符串更容易查看 (假设是 ASCII 回复)
    const text = new TextDecoder().decode(resp);
    log("Received: " + text);
} else {
    log("Error: Timeout waiting for response");
}
\`\`\`
```

### 示例 3: 接收判断后发送 (自动应答)
等待接收特定的握手信号 (0xAA 0x55)，如果收到则回复确认 (0xOK)，否则报错。

```markdown
# Handshake Check
\`\`\`js
log("Waiting for Handshake (AA 55)...");

// 先确保清空之前的缓存? recv 会读取最新的流数据
// 发送一个触发信号或者直接等待
// 这里假设我们是被动等待设备发数据
const packet = recv(5000); // 等待5秒

if (packet) {
    // 简单的判断：检查前两个字节
    if (packet.length >= 2 && packet[0] === 0xAA && packet[1] === 0x55) {
        log("Handshake Valid! Sending ACK.");
        send("OK");
    } else {
        log("Invalid Handshake Data: " + packet.length + " bytes");
    }
} else {
    log("No Handshake Received within 5s");
}
\`\`\`
```
