# com0com、hub4com使用说明

文中提到的COM10 COM11 COM12 COM13 COM3是为了说明方便而写的示例，实际使用中根据情况而定，不是一定要这几个串口

## 1. 设计拓扑（2 个软件 ↔ 1 个真实串口）

```
App A          App B
  |              |
 COM10          COM12        （应用侧看到的“独占串口”）
  |              |
 COM11          COM13        （hub4com 侧）
      \        /
       \      /
        hub4com
            |
           COM3              （真实串口）
```

* `COM10 <-> COM11`：com0com 虚拟串口对
* `COM12 <-> COM13`：com0com 虚拟串口对
* **只有 hub4com 打开真实串口 `COM3`**

---

## 2. com0com：命令行用法（仅本场景）

### 创建两对虚拟串口

```bat
setupc install PortName=COM10 PortName=COM11
setupc install PortName=COM12 PortName=COM13
```

**语义**

* `install`：创建一对 back-to-back 虚拟串口
* `PortName=COMx`：指定端口名

**使用约定（推荐）**

* App 用偶数口（COM10 / COM12）
* hub4com 用奇数口（COM11 / COM13）

---

## 3. hub4com：命令行模型

### 基本形式

```text
hub4com <port0> <port1> ... <portN> --route=A:B [--route=C:D ...]
```

* 串口参数顺序 → **决定 Port 编号**
* `--route=A:B`
  **语义**：Port A 收到的数据 → 转发到 Port B
  （单向，不自动对称）

---

## 4. 二对一（两个软件同时读写）配置

### 串口列表

```text
Port 0 → COM11   （App A 的虚拟对端）
Port 1 → COM13   （App B 的虚拟对端）
Port 2 → COM3    （真实串口）
```

### 路由需求

```
COM11 ↔ COM3
COM13 ↔ COM3
```

### 等价 route 表达

```
0 → 2
2 → 0
1 → 2
2 → 1
```

---

## 5. 完整单行示例（可直接用）

```bat
hub4com COM11 COM13 COM3 --route=0:2 --route=2:0 --route=1:2 --route=2:1
```

### 数据流效果

* 写：

  * App A → COM10 → COM11 → COM3
  * App B → COM12 → COM13 → COM3
* 读：

  * COM3 → COM11 → COM10 → App A
  * COM3 → COM13 → COM12 → App B

---

## 6. 工程注意点（一句话版）

* **hub4com 不做仲裁**：多写 ≠ 安全，多主协议才可行
* 建议真实串口参数显式指定：

  ```bat
  COM3:baud=115200,parity=n,data=8,stop=1
  ```

---

## 7. 总结（工程视角）

* **com0com**：提供 *N* 个“伪独占串口端点”
* **hub4com**：唯一真实串口 owner + 数据分发
* 二对一场景本质是：
  **多虚拟端口 ↔ 单真实端口的路由映射**
