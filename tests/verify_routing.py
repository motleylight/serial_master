import sys
import time
import threading
import serial

# 前置条件：
# 1. 创建 Pair A: COM10 <-> COM11 (App A)
# 2. 创建 Pair B: COM12 <-> COM13 (App B)
# 3. 创建 Pair P: COM20 <-> COM21 (模拟物理口)
# 4. 启动 Hub4com: 共享 COM20，连接到 COM11 和 COM13
#    hub4com COM11 COM13 COM20 --route=0:2 --route=2:0 --route=1:2 --route=2:1

def read_thread(ser, name):
    print(f"[{name}] Listening on {ser.port}...")
    while True:
        try:
            if ser.in_waiting:
                data = ser.read(ser.in_waiting)
                print(f"[{name}] Received: {data}")
        except Exception as e:
            print(f"[{name}] Error: {e}")
            break
        time.sleep(0.1)

def test_routing():
    try:
        # 模拟物理设备 (连接到 COM21)
        # Hub连接的是 COM20
        phy_device = serial.Serial('COM21', 9600, timeout=1)
        
        # 模拟 App A (连接到 COM10)
        # Hub连接的是 COM11
        app_a = serial.Serial('COM10', 9600, timeout=1)
        
        # 模拟 App B (连接到 COM12)
        # Hub连接的是 COM13
        app_b = serial.Serial('COM12', 9600, timeout=1)
        
        # 启动接收线程
        threading.Thread(target=read_thread, args=(app_a, "App A"), daemon=True).start()
        threading.Thread(target=read_thread, args=(app_b, "App B"), daemon=True).start()
        threading.Thread(target=read_thread, args=(phy_device, "Device"), daemon=True).start()
        
        print("Ports opened successfully. Starting test...")
        time.sleep(1)
        
        # 测试 1: 设备发送 -> App A & B 接收
        msg1 = b"Hello from Device"
        print(f"\n[Step 1] Device sending: {msg1}")
        phy_device.write(msg1)
        time.sleep(1)
        
        # 测试 2: App A 发送 -> 设备接收
        msg2 = b"Command from App A"
        print(f"\n[Step 2] App A sending: {msg2}")
        app_a.write(msg2)
        time.sleep(1)
        
        # 测试 3: App B 发送 -> 设备接收
        msg3 = b"Command from App B"
        print(f"\n[Step 3] App B sending: {msg3}")
        app_b.write(msg3)
        time.sleep(1)
        
        phy_device.close()
        app_a.close()
        app_b.close()
        print("\nTest Finished.")
        
    except serial.SerialException as e:
        print(f"Serial Error: {e}")
        print("Please ensure manual setup is done described in comments.")

if __name__ == "__main__":
    test_routing()
