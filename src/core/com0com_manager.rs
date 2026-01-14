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
}

const CREATE_NO_WINDOW: u32 = 0x08000000;

impl Com0comManager {
    /// 创建管理器实例，自动检测 com0com 安装路径
    pub fn new() -> Result<Self> {
        let setupc_path = Self::find_setupc_path()?;
        Ok(Self { setupc_path })
    }

    /// 检测 com0com 是否已安装
    pub fn is_installed() -> bool {
        Self::find_setupc_path().is_ok()
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
        
        let output = Command::new(&self.setupc_path)
            .args(args)
            .current_dir(working_dir)  // 设置工作目录
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .context("执行 setupc.exe 失败")?;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        if !output.status.success() {
            return Err(anyhow!("setupc.exe 返回错误: {}", stderr));
        }

        Ok(stdout)
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
            if let Some((prefix, port_info)) = line.split_once(' ') {
                // 提取端口对编号和类型 (A/B)
                if let Some(pair_info) = Self::parse_cnc_prefix(prefix) {
                    let (pair_id, is_port_a) = pair_info;
                    
                    // 提取端口名称
                    let port_name = if let Some((_, name)) = port_info.split_once('=') {
                        let name = name.trim();
                        if name == "-" {
                            prefix.to_string() // 使用 CNCxx 名称
                        } else {
                            name.to_string()
                        }
                    } else {
                        prefix.to_string()
                    };

                    let entry = pairs.entry(pair_id).or_insert((None, None));
                    if is_port_a {
                        entry.0 = Some(port_name);
                    } else {
                        entry.1 = Some(port_name);
                    }
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
        assert_eq!(pairs[1].port_b, "CNCB1");
    }

    #[test]
    fn test_parse_cnc_prefix() {
        assert_eq!(Com0comManager::parse_cnc_prefix("CNCA0"), Some((0, true)));
        assert_eq!(Com0comManager::parse_cnc_prefix("CNCB0"), Some((0, false)));
        assert_eq!(Com0comManager::parse_cnc_prefix("CNCA12"), Some((12, true)));
        assert_eq!(Com0comManager::parse_cnc_prefix("COM10"), None);
    }
}
