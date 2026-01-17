//! 端口共享管理器
//! 
//! 管理共享模式的生命周期，协调物理串口和虚拟串口之间的数据桥接。

use anyhow::{Result, anyhow};
use serde::{Serialize, Deserialize};


use crate::core::com0com_manager::{Com0comManager, PortPair};


use std::sync::Arc;
use std::sync::atomic::{AtomicBool};

/// 共享模式状态
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SharingStatus {
    /// 是否启用共享模式
    pub enabled: bool,
    /// 虚拟端口对列表
    pub port_pairs: Vec<PortPair>,
    /// 物理串口名
    pub physical_port: Option<String>,
}

/// 端口共享管理器
pub struct PortSharingManager {
    /// com0com 管理器
    com0com: Option<Com0comManager>,

    /// 当前共享状态
    status: SharingStatus,
    /// 运行标志 (用于停止桥接线程)
    running: Arc<AtomicBool>,
}

impl PortSharingManager {
    /// 创建新的共享管理器
    pub fn new() -> Self {
        let com0com = Com0comManager::new().ok();

        Self {
            com0com,
            status: SharingStatus {
                enabled: false,
                port_pairs: Vec::new(),
                physical_port: None,
            },
            running: Arc::new(AtomicBool::new(false)),
        }
    }

    /// 检测 com0com 是否已安装
    pub fn is_com0com_installed(&self) -> bool {
        self.com0com.is_some()
    }
    

    
    /// 获取 com0com 管理器引用
    pub fn com0com(&self) -> Option<&Com0comManager> {
        self.com0com.as_ref()
    }

    /// 获取当前共享状态
    pub fn get_status(&self) -> SharingStatus {
        self.status.clone()
    }
    
    /// 刷新状态
    pub fn refresh_status(&mut self) -> Result<()> {
        // 内部状态即真理，不需要去查询外部进程
        Ok(())
    }

    /// 启用共享模式 (仅更新状态，实际转发由 SerialManager 处理)
    pub fn start_sharing_status_only(&mut self, physical_port: &str, virtual_pair_ids: &[u32]) -> Result<String> {
        let com0com = self.com0com.as_ref()
            .ok_or_else(|| anyhow!("com0com 未安装"))?;

        // 1. 获取目标虚拟端口
        let all_pairs = com0com.list_pairs()?;
        let mut target_pairs = Vec::new();
        
        let target_pair = if let Some(&id) = virtual_pair_ids.first() {
            if let Some(pair) = all_pairs.iter().find(|p| p.pair_id == id) {
                 target_pairs.push(pair.clone());
                 pair.clone()
            } else {
                return Err(anyhow!("未找到 ID 为 {} 的虚拟端口对", id));
            }
        } else {
            return Err(anyhow!("请选择一个虚拟端口对"));
        };

        let v_port_name = target_pair.port_b.clone();

        // 2. 更新状态
        self.status = SharingStatus {
            enabled: true,
            port_pairs: target_pairs,
            physical_port: Some(physical_port.to_string()),
        };

        Ok(v_port_name)
    }

    /// 停止共享模式 (状态)
    pub fn stop_sharing_status_only(&mut self) -> Result<()> {
        self.status = SharingStatus {
            enabled: false,
            port_pairs: Vec::new(),
            physical_port: None,
        };
        Ok(())
    }
}
