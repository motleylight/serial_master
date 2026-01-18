//! com0com 虚拟串口驱动管理器
//! 
//! 封装 com0com 的 setupc.exe 命令行操作，提供虚拟串口对的创建、列表、删除功能。

use anyhow::{Result, anyhow, Context};
use std::path::PathBuf;
use std::process::Command;
use std::os::windows::process::CommandExt;
use serde::{Serialize, Deserialize};
 


/// 虚拟串口对信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortPair {
    /// 端口对编号 (0, 1, 2, ...)
    pub pair_id: u32,
    /// 端口A名称 (如 "CNCA0" 或 "COM10")
    pub port_a: String,
    /// 端口B名称 (如 "CNCB0" 或 "COM11")  
    pub port_b: String,
}

/// com0com 管理器
pub struct Com0comManager {
    /// setupc.exe 路径
    setupc_path: PathBuf,
    /// 认证 Token (UUID)
    admin_token: String,
}

const CREATE_NO_WINDOW: u32 = 0x08000000;

impl Com0comManager {
    /// 创建管理器实例，自动检测 com0com 安装路径
    pub fn new() -> Result<Self> {
        let setupc_path = Self::find_setupc_path()?;
        let admin_token = uuid::Uuid::new_v4().to_string();
        Ok(Self { setupc_path, admin_token })
    }

    /// 检测 com0com 是否已安装
    pub fn is_installed() -> bool {
        Self::find_setupc_path().is_ok()
    }

    pub fn get_setupc_path(&self) -> &PathBuf {
        &self.setupc_path
    }

    /// 查找 setupc.exe 路径
    fn find_setupc_path() -> Result<PathBuf> {
        // 常见安装路径
        let possible_paths = [
            r"C:\Program Files (x86)\com0com\setupc.exe",
            r"C:\Program Files\com0com\setupc.exe",
            r"C:\Program Files (x86)\com0com\x64\setupc.exe",
            r"C:\Program Files\com0com\x64\setupc.exe",
        ];

        for path in &possible_paths {
            let p = PathBuf::from(path);
            if p.exists() {
                return Ok(p);
            }
        }

        // 尝试从注册表获取安装路径
        if let Ok(path) = Self::get_path_from_registry() {
            return Ok(path);
        }

        Err(anyhow!("com0com 未安装或无法找到 setupc.exe"))
    }

    /// 从注册表获取安装路径
    fn get_path_from_registry() -> Result<PathBuf> {
        #[cfg(target_os = "windows")]
        {
            use winreg::enums::*;
            use winreg::RegKey;

            let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
            
            // 尝试 64 位注册表路径
            if let Ok(key) = hklm.open_subkey(r"SOFTWARE\com0com") {
                if let Ok(install_path) = key.get_value::<String, _>("Install_Dir") {
                    let setupc = PathBuf::from(&install_path).join("setupc.exe");
                    if setupc.exists() {
                        return Ok(setupc);
                    }
                    // 尝试 x64 子目录
                    let setupc_x64 = PathBuf::from(&install_path).join("x64").join("setupc.exe");
                    if setupc_x64.exists() {
                        return Ok(setupc_x64);
                    }
                }
            }

            // 尝试 32 位注册表路径 (WOW6432Node)
            if let Ok(key) = hklm.open_subkey(r"SOFTWARE\WOW6432Node\com0com") {
                if let Ok(install_path) = key.get_value::<String, _>("Install_Dir") {
                    let setupc = PathBuf::from(&install_path).join("setupc.exe");
                    if setupc.exists() {
                        return Ok(setupc);
                    }
                }
            }
        }

        Err(anyhow!("注册表中未找到 com0com 安装路径"))
    }

    /// 执行 setupc.exe 命令
    fn run_command(&self, args: &[&str]) -> Result<String> {
        // 获取 setupc.exe 所在目录作为工作目录
        // 这很重要，因为 setupc.exe 需要在其安装目录下找到 .inf 文件
        let working_dir = self.setupc_path.parent()
            .ok_or_else(|| anyhow!("无法获取 setupc.exe 所在目录"))?;
        
        // 尝试普通执行
        log::info!("Executing setupc: path={:?}, args={:?}, cwd={:?}", self.setupc_path, args, working_dir);
        
        let output_result = Command::new(&self.setupc_path)
            .args(args)
            .current_dir(working_dir)  // 设置工作目录
            .creation_flags(CREATE_NO_WINDOW)
            .output();

        let output = match output_result {
            Ok(o) => o,
            Err(e) => {
                // 如果启动失败，检查是否是因为需要提权 (Error 740)
                let error_msg = e.to_string();
                log::warn!("Failed to start setupc: {}", error_msg);
                if error_msg.contains("740") || error_msg.contains("requires elevation") || error_msg.contains("需要提升") {
                     return self.run_elevated(args, working_dir);
                }
                return Err(anyhow!("Execute setupc failed: {} (path: {:?})", e, self.setupc_path));
            }
        };

        // Decode output (lossy utf8 first, maybe improve later if needed for Chinese output)
        // Windows cmd output is often in local codepage (e.g. GBK). 
        // For simple string matching "failed 5", utf8-lossy is usually enough as numbers/english match.
        // But "拒绝访问" (Access Denied in Chinese) might be mangled if treated as UTF-8.
        // We will try detecting "failed 5" first.
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        log::info!("setupc stdout: {}", stdout);
        if !stderr.is_empty() {
             log::warn!("setupc stderr: {}", stderr);
        }

        if output.status.success() {
            return Ok(stdout);
        }

        // 检查是否是权限错误
        // Note: checking both stdout and stderr because setupc sometimes prints errors to stdout
        let combined_output = format!("{} {}", stdout, stderr);
        
        // 增强检测逻辑：Check for common error codes
        let is_permission_error = combined_output.contains("failed 5") 
           || combined_output.to_lowercase().contains("denied") 
           || combined_output.contains("拒绝访问")
           // GBK '拒绝访问' roughly translates to bytes checks if we really wanted, 
           // but often 'failed 5' is reliably present in setupc output.
           // Also check for 'UpdateDriverForPlugAndPlayDevices' failure which usually implies Admin needed
           || combined_output.contains("UpdateDriverForPlugAndPlayDevices") && combined_output.contains("5");

        if is_permission_error {
            // 尝试提权执行
            return self.run_elevated(args, working_dir);
        }

        Err(anyhow!("setupc.exe 返回错误: {}", stderr))
    }

    /// 以管理员权限执行命令 (通过 Admin Service IPC)
    /// 以管理员权限执行命令 (通过 Admin Service IPC)
    fn run_elevated(&self, args: &[&str], working_dir: &std::path::Path) -> Result<String> {
        use super::ipc::{AdminRequest, AdminResponse};
        use std::net::TcpStream;
        use std::io::Write;
        
        let addr = "127.0.0.1:56789";

        // 1. 尝试连接 Admin Service
        let mut stream = match TcpStream::connect(addr) {
            Ok(s) => {
                log::info!("Connected to Admin Service at {}", addr);
                s
            },
            Err(_) => {
                // 连接失败，尝试启动服务
                log::info!("Admin Service not running (TCP {}), attempting to start...", addr);
                self.start_admin_service()?;
                
                // 等待服务启动 (简单的重试机制)
                let mut retries = 10;
                let mut last_err = None;
                loop {
                    std::thread::sleep(std::time::Duration::from_millis(500));
                    match TcpStream::connect(addr) {
                        Ok(s) => {
                            log::info!("Successfully connected to Admin Service after spawn.");
                            break s;
                        },
                        Err(e) => {
                            last_err = Some(e);
                            retries -= 1;
                            if retries == 0 {
                                return Err(anyhow!("Failed to connect to Admin Service after spawn: {:?}", last_err));
                            }
                        }
                    }
                }
            }
        };

        // 2. 发送请求 Envelope
        log::info!("Sending AdminRequest: ExecuteSetupc {:?}", args);
        let payload = AdminRequest::ExecuteSetupc {
            args: args.iter().map(|s| s.to_string()).collect(),
            cwd: working_dir.to_string_lossy().to_string(),
        };

        let envelope = super::ipc::AdminRequestEnvelope {
            token: self.admin_token.clone(),
            payload,
        };

        serde_json::to_writer(&mut stream, &envelope).context("Failed to send request to Admin Service")?;
        stream.flush()?; 
        stream.shutdown(std::net::Shutdown::Write).context("Failed to shutdown write stream")?;

        // 3. 接收响应
        log::info!("Waiting for AdminResponse...");
        let resp: AdminResponse = serde_json::from_reader(&mut stream).context("Failed to receive response from Admin Service")?;
        
        log::info!("Received AdminResponse: success={}, stdout_len={}, stderr='{}'", resp.success, resp.stdout.len(), resp.stderr);

        if resp.success {
            Ok(resp.stdout)
        } else {
             if let Some(err) = resp.error {
                 Err(anyhow!("Admin Service Error: {}", err))
             } else {
                 Err(anyhow!("setupc failed via Admin Service: {}", resp.stderr))
             }
        }
    }

    /// 启动后台 Admin Service
    fn start_admin_service(&self) -> Result<()> {
        use std::os::windows::process::CommandExt;
        
        // 获取当前 exe 路径
        let current_exe = std::env::current_exe()?;
        
        // 使用 ShellExecute 提权启动
        // Rust std Command 不能直接用 verb "runas"，需要用 Powershell 或者是其它 crate (如 shellapi binding)
        // 这里复用之前的 PowerShell 技巧，但是这次是启动我们自己
        
        // 构造启动命令: serial_master.exe --admin-service --parent-pid <PID>
        let exe_path = current_exe.to_string_lossy();
        let pid = std::process::id();
        
        // 使用 PowerShell Start-Process -Verb RunAs 
        // Start-Process "path" -ArgumentList "--admin-service", "--parent-pid", "123", "--token", "uuid" -Verb RunAs -WindowStyle Hidden
        let ps_script = format!(
            "Start-Process -FilePath '{}' -ArgumentList '--admin-service', '--parent-pid', '{}', '--token', '{}' -Verb RunAs -WindowStyle Hidden",
            exe_path.replace("'", "''"), pid, self.admin_token
        );

        let status = Command::new("powershell")
            .args(&["-NoProfile", "-Command", &ps_script])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .status()
            .context("Failed to trigger UAC via PowerShell")?;
            
        if !status.success() {
            return Err(anyhow!("Failed into start admin service (UAC denied?)"));
        }
        
        Ok(())
    }

    /// 列出所有已创建的虚拟端口对
    pub fn list_pairs(&self) -> Result<Vec<PortPair>> {
        let output = self.run_command(&["list"])?;
        Self::parse_list_output(&output)
    }

    /// 解析 list 命令输出
    /// 
    /// 示例输出:
    /// ```
    /// CNCA0 PortName=COM10
    /// CNCB0 PortName=COM11
    /// CNCA1 PortName=-
    /// CNCB1 PortName=-
    /// ```
    fn parse_list_output(output: &str) -> Result<Vec<PortPair>> {
        let mut pairs: std::collections::HashMap<u32, (Option<String>, Option<String>)> = 
            std::collections::HashMap::new();

        for line in output.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }

            // 解析格式: "CNCA0 PortName=COM10" 或 "CNCA0 PortName=-"
            // fix: setupc 可能输出额外参数，如 "CNCA0 PortName=COM10,RealPortName=..." 或 空格分隔
            // 我们需要找到以 PortName= 开头的段
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.is_empty() { continue; }
            
            let prefix = parts[0];

            if let Some(pair_info) = Self::parse_cnc_prefix(prefix) {
                let (pair_id, is_port_a) = pair_info;
                
                // 查找 PortName=...
                let mut port_name = prefix.to_string(); // 默认使用 CNCxx
                
                for part in &parts[1..] {
                    // 处理可能得逗号分隔 (e.g. PortName=COM3,RealPortName=...)
                    // 先按逗号 split
                    for subpart in part.split(',') {
                         if let Some((key, val)) = subpart.split_once('=') {
                             let key = key.trim();
                             let val = val.trim();
                             
                             if key == "PortName" {
                                 if val != "-" {
                                     // Only set if we haven't found a RealPortName yet, 
                                     // OR strict override logic: RealPortName usually comes later or we prefer it.
                                     // Let's store both and decide after loop? 
                                     // Simpler: Just update port_name if it's currently the prefix (default) 
                                     // or if we want to overwrite 'COM#' with 'COM9' but technically 
                                     // we might parse RealPortName first? No, usually PortName matches first.
                                     // Let's iterate all and flag if we found RealPortName.
                                     
                                     // Actually simpler: If we find RealPortName, use it. 
                                     // If we find PortName, use it UNLESS we already have a RealPortName (unlikely in this order?)
                                     // Let's just track found candidates.
                                     port_name = val.to_string();
                                 }
                             } else if key == "RealPortName" {
                                 if val != "-" {
                                     port_name = val.to_string();
                                     break; // Found the "Real" name, stop looking for this line
                                 }
                             }
                         }
                    }
                }

                let entry = pairs.entry(pair_id).or_insert((None, None));
                if is_port_a {
                    entry.0 = Some(port_name);
                } else {
                    entry.1 = Some(port_name);
                }
            }
        }

        // 转换为 PortPair 列表
        let mut result: Vec<PortPair> = pairs
            .into_iter()
            .filter_map(|(pair_id, (port_a, port_b))| {
                match (port_a, port_b) {
                    (Some(a), Some(b)) => Some(PortPair {
                        pair_id,
                        port_a: a,
                        port_b: b,
                    }),
                    _ => None,
                }
            })
            .collect();

        result.sort_by_key(|p| p.pair_id);
        Ok(result)
    }

    /// 解析 CNC 前缀，返回 (pair_id, is_port_a)
    fn parse_cnc_prefix(prefix: &str) -> Option<(u32, bool)> {
        if prefix.starts_with("CNCA") {
            prefix[4..].parse::<u32>().ok().map(|id| (id, true))
        } else if prefix.starts_with("CNCB") {
            prefix[4..].parse::<u32>().ok().map(|id| (id, false))
        } else {
            None
        }
    }

    /// 创建一个新的虚拟端口对
    /// 
    /// # Arguments
    /// * `name_a` - 端口A名称，如 "COM10"，传 "-" 使用默认名称
    /// * `name_b` - 端口B名称，如 "COM11"，传 "-" 使用默认名称
    pub fn create_pair(&self, name_a: &str, name_b: &str) -> Result<PortPair> {
        let arg_a = if name_a == "-" { 
            "-".to_string() 
        } else { 
            format!("PortName={}", name_a) 
        };
        
        let arg_b = if name_b == "-" { 
            "-".to_string() 
        } else { 
            format!("PortName={}", name_b) 
        };

        let _output = self.run_command(&["install", &arg_a, &arg_b])?;
        
        // 解析输出获取创建的端口信息
        // 格式示例: "       CNCA2 PortName=COM10"
        let pairs = self.list_pairs()?;
        
        // 返回最后创建的端口对
        pairs.into_iter().last()
            .ok_or_else(|| anyhow!("创建端口对后无法获取端口信息"))
    }

    /// 修改虚拟端口名称
    pub fn rename_pair(&self, pair_id: u32, new_name_a: &str, new_name_b: &str) -> Result<()> {
        let arg_a = format!("PortName={}", new_name_a);
        let arg_b = format!("PortName={}", new_name_b);

        // 修改 Port A
        self.run_command(&["change", &format!("CNCA{}", pair_id), &arg_a])?;
        
        // 修改 Port B
        self.run_command(&["change", &format!("CNCB{}", pair_id), &arg_b])?;

        Ok(())
    }

    /// 移除指定的虚拟端口对
    pub fn remove_pair(&self, pair_id: u32) -> Result<()> {
        self.run_command(&["remove", &pair_id.to_string()])?;
        Ok(())
    }

    /// 移除所有虚拟端口对
    pub fn remove_all(&self) -> Result<()> {
        let pairs = self.list_pairs()?;
        for pair in pairs {
            self.remove_pair(pair.pair_id)?;
        }
        Ok(())
    }

    /// 查找可用的 COM 端口号
    /// 返回系统中未被占用的 COM 端口号
    pub fn find_available_com_numbers(&self, count: usize) -> Vec<u32> {
        let mut available = Vec::new();
        let existing_ports = serialport::available_ports().unwrap_or_default();
        let existing_names: std::collections::HashSet<String> = existing_ports
            .iter()
            .map(|p| p.port_name.to_uppercase())
            .collect();

        // 从 COM10 开始查找，避免与常用的低编号冲突
        for num in 10..256 {
            let name = format!("COM{}", num);
            if !existing_names.contains(&name) {
                available.push(num);
                if available.len() >= count {
                    break;
                }
            }
        }

        available
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_list_output() {
        let output = r#"
CNCA0 PortName=COM10
CNCB0 PortName=COM11
CNCA1 PortName=-
CNCB1 PortName=-
"#;
        let pairs = Com0comManager::parse_list_output(output).unwrap();
        assert_eq!(pairs.len(), 2);
        assert_eq!(pairs[0].pair_id, 0);
        assert_eq!(pairs[0].port_a, "COM10");
        assert_eq!(pairs[0].port_b, "COM11");
        assert_eq!(pairs[1].pair_id, 1);
        assert_eq!(pairs[1].port_a, "CNCA1");
        assert_eq!(pairs[1].port_a, "CNCA1");
        assert_eq!(pairs[1].port_b, "CNCB1");
    }

    #[test]
    fn test_parse_list_output_complex() {
        let output = r#"
CNCA0 PortName=COM#,RealPortName=COM9
CNCB0 PortName=COM10 EmuBR=yes
"#;
        let pairs = Com0comManager::parse_list_output(output).unwrap();
        assert_eq!(pairs.len(), 1);
        assert_eq!(pairs[0].port_a, "COM9"); // Should be COM9 (from RealPortName), NOT COM#
        assert_eq!(pairs[0].port_b, "COM10");
    }

    #[test]
    fn test_parse_cnc_prefix() {
        assert_eq!(Com0comManager::parse_cnc_prefix("CNCA0"), Some((0, true)));
        assert_eq!(Com0comManager::parse_cnc_prefix("CNCB0"), Some((0, false)));
        assert_eq!(Com0comManager::parse_cnc_prefix("CNCA12"), Some((12, true)));
        assert_eq!(Com0comManager::parse_cnc_prefix("COM10"), None);
    }
}
