# 发送ASCII
AT+ENABLELOG

# 发送ASCII2
AT+DISABLELOG

# 发送hex
*01 02 03 04*

# 循环延迟发送脚本
```js
log("Starting Loop...");
for(let i = 0; i < 2; i++) {
    log(cmd[i]);
    send(cmd[i]); 
    delay(1000); // 500ms delay
}
```