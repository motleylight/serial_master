use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::io::Write;

#[derive(Clone)]
pub struct ScriptManager {
    pub pre_send_cmd: Arc<Mutex<Option<String>>>,
    pub rx_cmd: Arc<Mutex<Option<String>>>,
}

impl ScriptManager {
    pub fn new() -> Self {
        Self {
            pre_send_cmd: Arc::new(Mutex::new(None)),
            rx_cmd: Arc::new(Mutex::new(None)),
        }
    }

    pub fn set_pre_send_cmd(&self, cmd: Option<String>) {
        let mut s = self.pre_send_cmd.lock().unwrap();
        *s = cmd;
    }

    pub fn set_rx_cmd(&self, cmd: Option<String>) {
        let mut s = self.rx_cmd.lock().unwrap();
        *s = cmd;
    }

    pub fn run_external_hook(&self, data: Vec<u8>, cmd_line: &str) -> Result<Vec<u8>, String> {
        println!("[Script] External Hook Called. Command: '{}', Data Len: {}", cmd_line, data.len());

        // Use shell execution to handle command parsing and paths robustly
        #[cfg(target_os = "windows")]
        let (program, args) = ("cmd", vec!["/C", cmd_line]);
        
        #[cfg(not(target_os = "windows"))]
        let (program, args) = ("sh", vec!["-c", cmd_line]);

        println!("[Script] Spawning process: {} {:?}", program, args);

        let mut command = Command::new(program);
        command.args(&args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            command.creation_flags(CREATE_NO_WINDOW);
        }

        let mut child = command.spawn()
            .map_err(|e| format!("Failed to spawn process '{}': {}", program, e))?;

        // Write to stdin
        if let Some(mut stdin) = child.stdin.take() {
            println!("[Script] Writing {} bytes to stdin...", data.len());
            if let Err(e) = stdin.write_all(&data) {
                println!("[Script] Error writing to stdin: {}", e);
                return Err(format!("Failed to write to stdin: {}", e));
            }
            // Explicitly drop stdin to close the pipe, ensuring child sees EOF
            drop(stdin);
            println!("[Script] Stdin closed (EOF sent). waiting for output...");
        }

        // Wait for output
        let output = child.wait_with_output().map_err(|e| format!("Failed to wait on process: {}", e))?;

        println!("[Script] Process exited. Status: {:?}, Stdout Len: {}, Stderr Len: {}", output.status, output.stdout.len(), output.stderr.len());

        if !output.stderr.is_empty() {
            let stderr_str = String::from_utf8_lossy(&output.stderr);
            println!("[Script] Stderr content: {}", stderr_str);
        }

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            println!("[Script] Failure detected. Exit code: {:?}", output.status.code());
            return Err(format!("External process failed (exit code: {:?}): {}", output.status.code(), stderr));
        }

        println!("[Script] Success. Returning {} bytes.", output.stdout.len());
        Ok(output.stdout)
    }

    pub fn run_pre_send(&self, data: Vec<u8>) -> Result<Vec<u8>, String> {
        let cmd = {
            let s = self.pre_send_cmd.lock().unwrap();
            s.clone()
        };

        if let Some(c) = cmd {
             self.run_external_hook(data, &c)
        } else {
            Ok(data)
        }
    }

    pub fn run_rx_script(&self, data: Vec<u8>) -> Result<Vec<u8>, String> {
        let cmd = {
            let s = self.rx_cmd.lock().unwrap();
            s.clone()
        };

        if let Some(c) = cmd {
             self.run_external_hook(data, &c)
        } else {
            Ok(data)
        }
    }
}
