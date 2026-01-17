# 脚本功能使用指南

SerialMaster 提供了强大的脚本扩展能力，允许用户通过自定义脚本对串口收发数据进行处理。

## 1. 概述

脚本系统支持两种执行模式和两个挂载点（Hook）：

| 挂载点 | 说明 |
|--------|------|
| **TX Hook** | 在数据发送到串口**之前**执行 |
| **RX Hook** | 在从串口接收数据**之后**执行 |

| 执行模式 | 执行位置 | 说明 |
|----------|----------|------|
| **JavaScript** | 前端 (浏览器) | 使用 `new Function()` 执行，无需任何外部依赖 |
| **External** | 后端 (Rust) | 调用外部程序，通过 stdin/stdout 传递数据 |

---

## 2. 如何使用

### 2.1 打开脚本编辑器

1. 在控制面板工具栏找到 **"Script"** 按钮
2. 点击打开脚本编辑器弹窗

### 2.2 配置脚本

1. 在编辑器中选择 **TX** 或 **RX** 标签页
2. 选择脚本类型：
   - **JS** - JavaScript 脚本（推荐，零配置）
   - **External** - 外部程序命令
3. 在编辑区域输入脚本内容或命令
4. 点击 **"Run"** 按钮启用脚本

### 2.3 脚本状态指示

当脚本激活时：
- **"Script"** 按钮变为**蓝色胶囊状态**
- 胶囊中间显示当前运行的 Hook 类型（`TX`、`RX` 或两者都有）
- 点击胶囊最右侧的 **"×"** 按钮可快速停止所有脚本

---

## 3. JavaScript 脚本

JavaScript 脚本直接在前端浏览器环境中执行，具有最低延迟和最简单的配置。

### 3.1 上下文变量

脚本可以访问一个名为 `data` 的变量：

```javascript
// data 是一个字节数组 (number[])，每个元素是 0-255 的整数
// 例如：[72, 101, 108, 108, 111] 对应 "Hello"
```

### 3.2 脚本规则

- **直接修改 `data`**：脚本执行后，系统读取 `data` 的最终状态
- **返回新数组**：脚本也可以返回一个新数组作为处理结果
- **TX Hook**：修改后的 `data` 会被发送到串口
- **RX Hook**：
  - 修改后的 `data` 会显示在终端
  - 返回空数组 `[]` 或 `null` 将丢弃该包（不显示）

### 3.3 示例代码

#### TX Hook：添加校验和

```javascript
// 计算所有字节的和（取低8位），追加到数据末尾
const sum = data.reduce((a, b) => a + b, 0) & 0xFF;
data.push(sum);
```

#### TX Hook：添加包头包尾

```javascript
// 协议：[0xAA] [0x55] [数据] [0xFF]
const header = [0xAA, 0x55];
const footer = [0xFF];
return [...header, ...data, ...footer];
```

#### TX Hook：CRC16-Modbus

```javascript
// CRC16-Modbus 计算（低字节在前）
let crc = 0xFFFF;
for (let byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
        if (crc & 1) {
            crc = (crc >> 1) ^ 0xA001;
        } else {
            crc >>= 1;
        }
    }
}
data.push(crc & 0xFF);         // 低字节
data.push((crc >> 8) & 0xFF);  // 高字节
```

#### RX Hook：过滤非打印字符

```javascript
// 只保留可打印 ASCII 字符 (32-126) 和换行符
const filtered = data.filter(b => 
    (b >= 32 && b <= 126) || b === 10 || b === 13
);
data.length = 0;
data.push(...filtered);
```

#### RX Hook：丢弃特定数据

```javascript
// 如果数据包含 0xFF，认为是噪声，丢弃
if (data.includes(0xFF)) {
    return [];  // 返回空数组表示丢弃
}
```

#### RX Hook：十六进制转 ASCII

```javascript
// 将收到的十六进制字符串（如 "48656C6C6F"）转换为 ASCII
const hexStr = String.fromCharCode(...data);
const bytes = [];
for (let i = 0; i < hexStr.length; i += 2) {
    bytes.push(parseInt(hexStr.substr(i, 2), 16));
}
return bytes;
```

---

## 4. 外部程序脚本

外部程序脚本允许调用任意可执行程序来处理数据，适合复杂的协议解析或需要使用特定语言/库的场景。

### 4.1 工作原理

1. 每次触发 Hook 时，后端启动指定的外部程序
2. 原始数据以**二进制**形式写入程序的 **stdin**
3. 程序处理后，将结果以**二进制**形式写入 **stdout**
4. 后端读取 stdout 内容作为处理结果

### 4.2 配置方法

1. 在脚本编辑器中选择 **"External"** 类型
2. 在输入框中填写完整的命令行，例如：

```
python process.py
```

```
node handler.js
```

```
./my_processor.exe
```

> **注意**：命令将通过系统 Shell 执行（Windows: cmd /C，Linux/macOS: sh -c）

### 4.3 Python 示例

创建文件 `process.py`：

```python
import sys

# 从 stdin 读取二进制数据
data = sys.stdin.buffer.read()

# 处理数据：添加校验和
checksum = sum(data) & 0xFF
result = data + bytes([checksum])

# 输出到 stdout（必须用 buffer 写入二进制）
sys.stdout.buffer.write(result)
```

在脚本编辑器中配置命令：

```
python process.py
```

### 4.4 Python 示例：CRC16 计算

```python
import sys

def crc16_modbus(data):
    crc = 0xFFFF
    for byte in data:
        crc ^= byte
        for _ in range(8):
            if crc & 1:
                crc = (crc >> 1) ^ 0xA001
            else:
                crc >>= 1
    return crc

# 读取数据
data = sys.stdin.buffer.read()

# 计算 CRC
crc = crc16_modbus(data)

# 追加 CRC（低字节在前）
result = data + bytes([crc & 0xFF, (crc >> 8) & 0xFF])

# 输出
sys.stdout.buffer.write(result)
```

### 4.5 Node.js 示例

创建文件 `handler.js`：

```javascript
const fs = require('fs');

// 从 stdin 读取数据
const data = fs.readFileSync(0);  // 0 是 stdin 的文件描述符

// 处理：添加包头
const header = Buffer.from([0xAA, 0x55]);
const result = Buffer.concat([header, data]);

// 输出到 stdout
process.stdout.write(result);
```

---

## 5. 使用模板

脚本编辑器提供了常用模板，点击 **"Templates"** 下拉菜单快速加载：

### JavaScript 模板

| 模板名称 | 用途 |
|----------|------|
| TX: Add Checksum | 添加校验和 |
| TX: Add Header/Footer | 添加包头包尾 |
| RX: Only Printable | 过滤非打印字符 |

### External 模板

| 模板名称 | 命令 |
|----------|------|
| Python Script | `python script.py` |
| Node Script | `node script.js` |
| Executable | `./path/to/executable.exe` |

---

## 6. 注意事项

### 性能

- **JavaScript 脚本**：毫秒级延迟，适合高频数据
- **外部程序**：每次调用需启动进程，有一定开销（~10-50ms）

### 错误处理

- **JavaScript 语法错误**：脚本不会执行，控制台显示错误
- **外部程序错误**：
  - 程序不存在：显示 "Failed to spawn process" 错误
  - 程序返回非零退出码：操作中断，显示 stderr 内容

### 安全性

- JavaScript 脚本在浏览器沙箱中执行，权限受限
- 外部程序以当前用户权限执行，请确保脚本来源可信

---

## 7. 常见问题

**Q: 脚本配置会保存吗？**

A: 是的。脚本配置保存在 `config.yaml` 中，应用重启后自动恢复。

**Q: 可以同时运行 TX 和 RX 脚本吗？**

A: 可以。TX 和 RX 是独立的，可以分别配置并同时运行。

**Q: JS 和 External 可以混用吗？**

A: 可以。例如 TX 使用 JavaScript，RX 使用外部 Python 程序。

**Q: 外部程序的工作目录是什么？**

A: 工作目录是 SerialMaster 可执行文件所在的目录。

**Q: 为什么 Python 脚本的输出是乱码？**

A: 请确保使用 `sys.stdout.buffer.write()` 输出二进制数据，而不是 `print()`。
