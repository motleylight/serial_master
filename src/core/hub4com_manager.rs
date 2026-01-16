//! hub4com 进程管理器
//! 
//! 负责管理 hub4com.exe 进程，通过它来实现物理串口与虚拟串口之间的数据共享/路由。

use anyhow::{Result, anyhow, Context};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::os::windows::process::CommandExt;

const CREATE_NO_WINDOW: u32 = 0x08000000;

/// hub4com 运行实例
pub struct HubInstance {
    /// 进程句柄
    process: Child,
    /// 物理串口名 (如 "COM3")
    physical_port: String,
    /// 虚拟串口列表 (如 ["COM11", "COM13"])
    virtual_ports: Vec<String>,
}

/// hub4com 管理器 (线程安全)
#[derive(Clone)]
pub struct Hub4comManager {
    /// hub4com.exe 路径
    hub4com_path: PathBuf,
    /// 正在运行的实例: Map<PhysicalPort, HubInstance>
    instances: Arc<Mutex<HashMap<String, HubInstance>>>,
}

impl Hub4comManager {
    /// 创建管理器实例
    pub fn new() -> Result<Self> {
        let hub4com_path = Self::find_hub4com_path()?;
        Ok(Self { 
            hub4com_path,
            instances: Arc::new(Mutex::new(HashMap::new())),
        })
    }

    /// 检测 hub4com 是否已安装
    pub fn is_installed() -> bool {
        Self::find_hub4com_path().is_ok()
    }

    /// 查找 hub4com.exe 路径
    fn find_hub4com_path() -> Result<PathBuf> {
        let possible_paths = [
            r"C:\Program Files (x86)\com0com\hub4com.exe",
            r"C:\Program Files\com0com\hub4com.exe",
            r"C:\Program Files (x86)\com0com\x64\hub4com.exe",
            r"C:\Program Files\com0com\x64\hub4com.exe",
            // 可能在 com0com 目录下的子目录
            r"C:\Program Files (x86)\com0com\hub4com\hub4com.exe", 
            r"C:\Program Files\com0com\hub4com\hub4com.exe",
        ];

        for path in &possible_paths {
            let p = PathBuf::from(path);
            if p.exists() {
                return Ok(p);
            }
        }
        
        // 尝试从 PATH 环境变量查找 (简单检查)
        if let Ok(path) = which::which("hub4com.exe") {
             return Ok(path);
        }

        Err(anyhow!("无法找到 hub4com.exe，请确保已安装 com0com (包含 hub4com 组件)"))
    }

    /// 启动共享 (Start Sharing)
    /// 
    /// 启动 hub4com 将物理串口数据转发到多个虚拟串口。
    /// 
    /// # Arguments
    /// * `physical_port` - 物理串口名，如 "COM3"
    /// * `virtual_ports` - 虚拟串口名列表，如 ["COM11", "COM13"]
    /// * `baud_rate` - 波特率 (可选，用于显式配置物理口参数)
    pub fn start_share(&self, physical_port: &str, virtual_ports: &[String], baud_rate: Option<u32>) -> Result<()> {
        let mut instances = self.instances.lock().map_err(|_| anyhow!("获取锁失败"))?;

        if instances.contains_key(physical_port) {
            return Err(anyhow!("串口 {} 已经在共享中", physical_port));
        }

        // 构建命令行参数
        // hub4com <port0> <port1> ... <portN> --route=A:B ...
        
        let mut args: Vec<String> = Vec::new();
        let mut port_indices: HashMap<String, usize> = HashMap::new();
        let mut current_idx = 0;

        // 1. 添加虚拟端口 (Port 0..N-1)
        for v_port in virtual_ports {
            // Ensure Windows long path prefix for robustness
            let port_arg = if v_port.starts_with("\\\\.\\") {
                v_port.clone()
            } else {
                format!("\\\\.\\{}", v_port)
            };
            args.push(port_arg);
            port_indices.insert(v_port.clone(), current_idx);
            current_idx += 1;
        }

        // 2. 添加物理端口 (Port N)
        // Ensure prefix for physical port name portion
        let p_port_arg = if physical_port.starts_with("\\\\.\\") {
            physical_port.to_string()
        } else {
             format!("\\\\.\\{}", physical_port)
        };

        // Add baud rate BEFORE the physical port if present
        // Proven syntax: hub4com ... --baud=115200 \\.\COM8 ...
        if let Some(baud) = baud_rate {
             args.push(format!("--baud={}", baud));
        }

        args.push(p_port_arg);
        let p_idx = current_idx; // 物理口索引

        // 3. 构建全双工路由 (--route=All:Physical, --route=Physical:All)
        // Virtual -> Physical
        for i in 0..p_idx {
             args.push(format!("--route={}:{}", i, p_idx));
        }

        // Physical -> Virtual
        for i in 0..p_idx {
             args.push(format!("--route={}:{}", p_idx, i));
        }

        // 启动进程
        let mut child = Command::new(&self.hub4com_path)
            .args(&args)
            .creation_flags(CREATE_NO_WINDOW)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .context("启动 hub4com 失败")?;

        // Critical: Check if it dies immediately (e.g. arg error or port busy)
        // Wait a small amount of time to catch immediate failures
        std::thread::sleep(std::time::Duration::from_millis(300));
        
        match child.try_wait() {
            Ok(Some(status)) => {
                // Process already exited
                use std::io::Read;
                let mut stderr_output = String::new();
                if let Some(mut stderr) = child.stderr.take() {
                    let _ = stderr.read_to_string(&mut stderr_output);
                }
                
                return Err(anyhow!("hub4com 启动失败 (Exit code: {:?}): {}", status.code(), stderr_output));
            }
            Ok(None) => {
                // Process is still running, looks good!
            }
            Err(e) => {
                return Err(anyhow!("无法检测 hub4com 状态: {}", e));
            }
        }

        let instance = HubInstance {
            process: child,
            physical_port: physical_port.to_string(),
            virtual_ports: virtual_ports.to_vec(),
        };

        instances.insert(physical_port.to_string(), instance);

        Ok(())
    }

    /// 停止共享
    pub fn stop_share(&self, physical_port: &str) -> Result<()> {
        let mut instances = self.instances.lock().map_err(|_| anyhow!("获取锁失败"))?;

        if let Some(mut instance) = instances.remove(physical_port) {
            // 尝试优雅关闭，或者直接 Kill
            let _ = instance.process.kill();
            let _ = instance.process.wait(); // 防止僵尸进程
            Ok(())
        } else {
            Err(anyhow!("串口 {} 未在共享中", physical_port))
        }
    }

    /// 获取当前共享状态
    /// Returns: Vec<(PhysicalPort, VirtualPorts)>
    pub fn get_sharing_status(&self) -> Result<Vec<(String, Vec<String>)>> {
        let instances = self.instances.lock().map_err(|_| anyhow!("获取锁失败"))?;
        
        let status = instances.values()
            .map(|inst| (inst.physical_port.clone(), inst.virtual_ports.clone()))
            .collect();
        
        Ok(status)
    }
}
