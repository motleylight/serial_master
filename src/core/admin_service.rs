use anyhow::{Result, anyhow};
use std::io::Write;
use std::process::Command;
use std::os::windows::process::CommandExt;
use std::net::{TcpListener, TcpStream};
use super::ipc::{AdminRequest, AdminResponse};

const ADMIN_PORT: u16 = 56789;

pub struct AdminService;

impl AdminService {
    /// 运行 Admin Service (阻塞运行)
    pub fn run(parent_pid: Option<u32>) -> Result<()> {
        let addr = format!("127.0.0.1:{}", ADMIN_PORT);
        let listener = TcpListener::bind(&addr)
            .map_err(|e| anyhow!("Failed to bind TCP listener on {}: {}", addr, e))?;
        
        // Ensure non-blocking acception so we can loop and check PID
        listener.set_nonblocking(true)?;

        log::info!("Admin Service started on TCP {}", addr);

        loop {
            // 1. Check Parent PID
            if let Some(pid) = parent_pid {
                if !is_process_running(pid) {
                     log::info!("Parent process {} died. Exiting.", pid);
                     break;
                }
            }
            
            // 2. Accept connections (non-blocking)
            match listener.accept() {
                Ok((mut stream, addr)) => {
                    log::info!("Client connected from {:?}", addr);
                    
                    // Set timeout for read/write to avoid hanging
                     stream.set_read_timeout(Some(std::time::Duration::from_secs(5))).ok();
                     stream.set_write_timeout(Some(std::time::Duration::from_secs(5))).ok();

                    // Note: TcpStream implements Read/Write, compatible with serde_json
                    // We use Deserializer directly to avoid buffering issues if any?
                    // from_reader is usually fine.
                    let request_res: serde_json::Result<AdminRequest> = serde_json::from_reader(&mut stream);
                    
                    match request_res {
                        Ok(req) => {
                            let response = Self::handle_request(req);
                            if let Err(e) = serde_json::to_writer(&mut stream, &response) {
                                log::error!("Failed to write response: {}", e);
                            }
                            let _ = stream.flush();
                        }
                        Err(e) => {
                            log::error!("Failed to parse request: {}", e);
                        }
                    }
                },
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    // No connection, sleep slightly
                    std::thread::sleep(std::time::Duration::from_millis(500));
                },
                Err(e) => {
                     log::error!("Accept failed: {}", e);
                }
            }
        }
        
        Ok(())
    }

    fn handle_request(req: AdminRequest) -> AdminResponse {
        match req {
            AdminRequest::ExecuteSetupc { args, cwd } => {
                log::info!("Executing setupc: {:?} in {}", args, cwd);
                
                match crate::core::com0com_manager::Com0comManager::new() {
                    Ok(manager) => {
                         let setupc_path = manager.get_setupc_path();

                         let output = Command::new(setupc_path)
                            .args(&args)
                            .current_dir(cwd)
                            .creation_flags(0x08000000) // CREATE_NO_WINDOW
                            .output();

                         match output {
                             Ok(o) => AdminResponse {
                                 success: o.status.success(),
                                 stdout: String::from_utf8_lossy(&o.stdout).to_string(),
                                 stderr: String::from_utf8_lossy(&o.stderr).to_string(),
                                 error: None,
                             },
                             Err(e) => AdminResponse {
                                 success: false,
                                 stdout: "".to_string(),
                                 stderr: "".to_string(),
                                 error: Some(e.to_string()),
                             }
                         }
                    }
                    Err(e) => AdminResponse {
                        success: false,
                        stdout: "".to_string(),
                        stderr: "".to_string(),
                        error: Some(format!("Failed to find setupc: {}", e)),
                    }
                }
            }
            AdminRequest::Shutdown => {
                std::process::exit(0);
            }
        }
    }
}

// Simple process checker using tasklist (avoids FFI type issues)
fn is_process_running(pid: u32) -> bool {
    let filter = format!("PID eq {}", pid);
    let output = std::process::Command::new("tasklist")
        .args(&["/FI", &filter, "/NH"])
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .output();

    match output {
        Ok(o) => {
            let stdout = String::from_utf8_lossy(&o.stdout);
            stdout.contains(&pid.to_string())
        },
        Err(_) => false,
    }
}
