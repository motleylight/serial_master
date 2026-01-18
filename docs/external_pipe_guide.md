# 外部管道模式 (External Pipe Mode) 开发与使用指南

## 1. 原理说明
External Pipe 模式允许 SerialUtil 将串口数据的处理逻辑“外包”给任何外部可执行程序（如 Python 脚本、Node.js 脚本、C++ 编译出的 exe 等）。

### 数据流向
SerialUtil 与外部程序通过 **标准输入 (Stdin)** 和 **标准输出 (Stdout)** 进行通信。

- **Tx Hook (发送前处理)**:
  1. SerialUtil 准备发送数据（例如用户在终端输入了 `ABC`）。
  2. SerialUtil 启动配置的外部程序。
  3. SerialUtil 将 `ABC` 的二进制数据写入外部程序的 `Stdin`。
  4. 外部程序读取 `Stdin`，进行处理（例如加密、添加校验和）。
  5. 外部程序将处理后的数据写入 `Stdout`。
  6. SerialUtil 读取 `Stdout`，并将获得的数据发送到物理串口。

- **Rx Hook (接收后处理)**:
  1. SerialUtil 从物理串口收到数据（例如 `XYZ`）。
  2. SerialUtil 启动配置的外部程序。
  3. SerialUtil 将 `XYZ` 的二进制数据写入外部程序的 `Stdin`。
  4. 外部程序读取 `Stdin`，进行处理（例如解密、解析协议）。
  5. 外部程序将处理后的数据写入 `Stdout`。
  6. SerialUtil 读取 `Stdout`，并将获得的数据显示在终端界面上。

## 2. 使用方法

### 2.1 界面配置
1. 打开 **Scripting** 界面。
2. 点击左上角的 **External Pipe** 切换到外部模式。
3. 选择 **Tx Hook** 或 **Rx Hook** 标签页。
4. 在输入框中填写完整的命令行指令。

### 2.2 命令行示例
- **Python 脚本**: `python "C:\Scripts\my_filter.py"`
- **Node.js 脚本**: `node "C:\Scripts\parser.js"`
- **可执行文件**: `"C:\Tools\checksum_calculator.exe" --verbose`

## 3. 开发外部程序指南 (以 Python 为例)

外部程序必须遵循以下规则：
1. **读取 Stdin**: 必须以二进制模式读取所有输入数据。
2. **写入 Stdout**: 必须以二进制模式输出处理后的数据。
3. **不要输出日志到 Stdout**: 任何调试日志请输出到 `Stderr`，因为 `Stdout` 的所有内容都会被当作数据。
4. **退出码**: 程序必须以 `0` 退出表示成功。非零退出码会被 SerialUtil 视为失败（Rx Hook 会记录错误，Tx Hook 会终止发送）。

### Python 示例代码
保存在 `filter.py`:

```python
import sys

# 1. 即使在 Windows，也确保以二进制模式读取 stdin 和写入 stdout
# Python 3 默认 sys.stdin 是文本模式，这会破坏二进制数据 (如 0x0A 会被转换)
# 使用 sys.stdin.buffer 和 sys.stdout.buffer 获取原始二进制流
input_data = sys.stdin.buffer.read()

# 2. 打印调试信息到 Stderr (可选)
sys.stderr.write(f"Received {len(input_data)} bytes\n")

# 3. 进行处理 (示例：每个字节 +1)
output_data = bytearray()
for b in input_data:
    output_data.append((b + 1) % 256)

# 4. 写入处理后的数据到 Stdout
sys.stdout.buffer.write(output_data)
```

### Node.js 示例代码
保存在 `script.js`:

```javascript
const fs = require('fs');

// 读取所有 Stdin 数据
const chunks = [];
process.stdin.on('data', (chunk) => {
    chunks.push(chunk);
});

process.stdin.on('end', () => {
    const inputData = Buffer.concat(chunks);
    
    // 调试日志 (Stderr)
    console.error(`Received ${inputData.length} bytes`);

    // 处理数据 (示例：翻转数据)
    const outputData = inputData.reverse();

    // 写入 Stdout
    process.stdout.write(outputData);
});
```

## 4. 常见问题 (FAQ)

**Q: 为什么按了发送，但是没有任何反应？**
A: 请检查外部程序是否正确退出。如果外部程序死循环或等待用户输入，SerialUtil 会一直等待它结束。目前的实现是同步等待子进程结束。

**Q: 为什么数据没有变化？**
A: 请检查您的脚本是否正确写入了 `Stdout`。如果脚本输出为空，SerialUtil 将认为处理结果为空（Rx Hook 会丢弃该包）。

**Q: 是否支持流式处理 (Streaming)？**
A: 当前版本不支持长运行的流式进程。每次数据包到来都会**重新启动**一次外部进程。请确保外部程序的启动开销较低（如 Python 解释器启动可能需要几十毫秒，对于高频数据可能不够快，建议使用编译型语言如 Go/Rust/C++ 编写的小工具）。
