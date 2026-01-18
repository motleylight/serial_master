use serde::{Deserialize, Serialize};

/// Admin Service 请求信封 (带认证)
#[derive(Debug, Serialize, Deserialize)]
pub struct AdminRequestEnvelope {
    pub token: String,
    pub payload: AdminRequest,
}

/// Admin Service 请求
#[derive(Debug, Serialize, Deserialize)]
pub enum AdminRequest {
    /// 执行 setupc 指令
    ExecuteSetupc {
        args: Vec<String>,
        cwd: String,
    },
    /// 关闭服务
    Shutdown,
}

/// Admin Service 响应
#[derive(Debug, Serialize, Deserialize)]
pub struct AdminResponse {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
    pub error: Option<String>,
}
