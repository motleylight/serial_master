//! 端口共享管理器
//! 
//! 管理共享模式的生命周期，协调物理串口和虚拟串口之间的数据桥接。

use anyhow::{Result, anyhow};
use std::sync::{Arc, atomic::{AtomicBool, Ordering}};
use tokio::sync::mpsc;
use log::{info, error};
use serde::{Serialize, Deserialize};

use crate::core::com0com_manager::{Com0comManager, PortPair};

/// 共享模式状态
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SharingStatus {
    /// 是否启用共享模式
    pub enabled: bool,
    /// 虚拟端口对信息
    pub port_pair: Option<PortPair>,
    /// 供其他软件连接的端口名称
    pub external_port: Option<String>,
}

/// 端口共享管理器
pub struct PortSharingManager {
    /// com0com 管理器
    com0com: Option<Com0comManager>,
    /// 当前共享状态
    status: SharingStatus,
    /// 桥接线程运行标志
    bridge_running: Arc<AtomicBool>,
}

impl PortSharingManager {
    /// 创建新的共享管理器
    pub fn new() -> Self {
        let com0com = Com0comManager::new().ok();
        
        Self {
            com0com,
            status: SharingStatus {
                enabled: false,
                port_pair: None,
                external_port: None,
            },
            bridge_running: Arc::new(AtomicBool::new(false)),
        }
    }

    /// 检测 com0com 是否已安装
    pub fn is_com0com_installed(&self) -> bool {
        self.com0com.is_some()
    }

    /// 获取当前共享状态
    pub fn get_status(&self) -> SharingStatus {
        self.status.clone()
    }

    /// 启用共享模式
    /// 
    /// # Arguments
    /// * `physical_port` - 当前连接的物理串口名 (如 "COM8")
    /// 
    /// # Returns
    /// 供其他软件使用的虚拟端口名
    pub fn enable_sharing(&mut self, _physical_port: &str) -> Result<String> {
        if self.status.enabled {
            return Err(anyhow!("共享模式已启用"));
        }

        let com0com = self.com0com.as_ref()
            .ok_or_else(|| anyhow!("com0com 未安装"))?;

        // 查找可用的 COM 端口号
        let available_nums = com0com.find_available_com_numbers(2);
        if available_nums.len() < 2 {
            return Err(anyhow!("无法找到足够的可用 COM 端口号"));
        }

        let port_a_name = format!("COM{}", available_nums[0]);
        let port_b_name = format!("COM{}", available_nums[1]);

        // 创建虚拟端口对
        let pair = com0com.create_pair(&port_a_name, &port_b_name)?;
        
        info!("创建虚拟端口对: {} <-> {}", pair.port_a, pair.port_b);

        // port_a 作为 SerialMaster 内部使用的端口
        // port_b 作为供其他软件连接的外部端口
        let external_port = pair.port_b.clone();

        self.status = SharingStatus {
            enabled: true,
            port_pair: Some(pair),
            external_port: Some(external_port.clone()),
        };

        Ok(external_port)
    }

    /// 禁用共享模式
    pub fn disable_sharing(&mut self) -> Result<()> {
        if !self.status.enabled {
            return Ok(());
        }

        // 停止桥接
        self.bridge_running.store(false, Ordering::SeqCst);

        // 移除虚拟端口对
        if let Some(ref pair) = self.status.port_pair {
            if let Some(ref com0com) = self.com0com {
                if let Err(e) = com0com.remove_pair(pair.pair_id) {
                    error!("移除虚拟端口对失败: {}", e);
                }
            }
        }

        self.status = SharingStatus {
            enabled: false,
            port_pair: None,
            external_port: None,
        };

        info!("共享模式已禁用");
        Ok(())
    }

    /// 获取内部虚拟端口名 (SerialMaster 应连接此端口)
    pub fn get_internal_port(&self) -> Option<String> {
        self.status.port_pair.as_ref().map(|p| p.port_a.clone())
    }

    /// 获取外部虚拟端口名 (供其他软件连接)
    pub fn get_external_port(&self) -> Option<String> {
        self.status.external_port.clone()
    }

    /// 启动数据桥接
    /// 
    /// 在物理串口和虚拟串口之间双向转发数据
    pub fn start_bridge(
        &self,
        mut physical_rx: mpsc::Receiver<Vec<u8>>,
        virtual_tx: mpsc::Sender<Vec<u8>>,
    ) -> Result<()> {
        if !self.status.enabled {
            return Err(anyhow!("共享模式未启用"));
        }

        self.bridge_running.store(true, Ordering::SeqCst);
        let running = self.bridge_running.clone();

        // 物理串口 -> 虚拟串口 桥接线程
        tokio::spawn(async move {
            while running.load(Ordering::SeqCst) {
                match physical_rx.recv().await {
                    Some(data) => {
                        if virtual_tx.send(data).await.is_err() {
                            break;
                        }
                    }
                    None => break,
                }
            }
            info!("数据桥接已停止");
        });

        Ok(())
    }
}

impl Drop for PortSharingManager {
    fn drop(&mut self) {
        // 确保在销毁时清理虚拟端口
        let _ = self.disable_sharing();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_manager() {
        let manager = PortSharingManager::new();
        assert!(!manager.status.enabled);
        assert!(manager.status.port_pair.is_none());
    }

    #[test]
    fn test_status_default() {
        let status = SharingStatus {
            enabled: false,
            port_pair: None,
            external_port: None,
        };
        assert!(!status.enabled);
    }
}
