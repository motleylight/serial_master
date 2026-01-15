'''
这个测试程序会从sdtin里面读取字节流，去掉其中heart字样后，再打印到sdtout中
'''

import sys
import os

if __name__ == "__main__":
    while True:
        chunk = sys.stdin.buffer.read(4096)
        if not chunk:
            break
        sys.stdout.buffer.write(chunk.replace(b'Heart', b''))
        sys.stdout.buffer.flush()

