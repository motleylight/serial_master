mod commands;
pub mod scripting;

use serial_master::core::serial_manager::SerialManager;
use serial_master::core::port_sharing_manager::PortSharingManager;
use scripting::ScriptManager;
use tauri::{Emitter, Manager};
use tokio::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Check for admin-service flag BEFORE loading Tauri
    use clap::Parser;

    #[derive(Parser, Debug)]
    #[command(author, version, about, long_about = None)]
    struct Args {
        /// Run as background admin service
        #[arg(long)]
        admin_service: bool,
    }

    // Try to parse args. Note: Tauri also parses args? 
    // Usually Tauri apps ignore unknown args or we can just peek env::args.
    // Clap might complain about tauri args if we are strict.
    // Let's just check raw args for simplicity and robustness against tauri flags.
    let args: Vec<String> = std::env::args().collect();
    if args.contains(&"--admin-service".to_string()) {
        // Run Admin Service
        // Need to enable logging for this process too?
        env_logger::init(); 
        
        let mut parent_pid = None;
        if let Some(idx) = args.iter().position(|r| r == "--parent-pid") {
            if let Some(pid_str) = args.get(idx + 1) {
                if let Ok(pid) = pid_str.parse::<u32>() {
                    parent_pid = Some(pid);
                }
            }
        }

        log::info!("Starting SerialMaster Admin Service... Parent PID: {:?}", parent_pid);
        match serial_master::core::admin_service::AdminService::run(parent_pid) {
            Ok(_) => log::info!("Admin Service exited cleanly."),
            Err(e) => log::error!("Admin Service error: {}", e),
        }
        std::process::exit(0);
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(Mutex::new(SerialManager::new()))
        .manage(Mutex::new(PortSharingManager::new()))
        .manage(ScriptManager::new())
        .setup(|app| {
            let app_handle = app.handle().clone();
            let (tx, mut rx) = tokio::sync::mpsc::channel::<Vec<u8>>(100);

            // Configure SerialManager with sender
            let state = app.state::<Mutex<SerialManager>>();
            let mut manager = state.blocking_lock();
            manager.set_sender(tx);
            drop(manager); // Release lock

            // Retrieve ScriptManager state (it is managed, so we can get it from app)
            // We use app.state().clone() below directly
            let script_manager = (*app.state::<ScriptManager>()).clone();

            // Spawn event loop
            tauri::async_runtime::spawn(async move {
                while let Some(data) = rx.recv().await {
                    println!("[Backend-Debug] Raw Received {} bytes: {:?}", data.len(), data);
                    
                    // Run Rx Hook
                    let final_data = match script_manager.run_rx_script(data.clone()) {
                        Ok(d) => d,
                        Err(e) => {
                            log::error!("Rx Hook Error: {}", e);
                            // On error, maybe we still emit original? or drop?
                            // Let's log and keep original for safety unless empty
                            data
                        }
                    };

                    // If empty (filtered out), skip emit
                    if final_data.is_empty() {
                         continue;
                    }

                    // Emit event to frontend
                    if let Err(e) = app_handle.emit("serial-data", final_data) {
                        log::error!("Failed to emit serial-data: {}", e);
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_ports,
            commands::connect,
            commands::disconnect,
            commands::send,
            commands::set_script,
            // 端口共享命令
            commands::check_com0com_installed,
            commands::check_hub4com_installed,
            commands::get_virtual_pairs,
            commands::create_virtual_pair,
            commands::remove_virtual_pair,
            commands::rename_virtual_pair,
            commands::get_sharing_status,
            commands::start_port_sharing,
            commands::stop_port_sharing
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|_app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                // Explicitly shutdown Admin Service on exit
                let _ = std::thread::spawn(|| {
                     use serial_master::core::ipc::{AdminRequest, AdminResponse};
                     use std::net::TcpStream;
                     if let Ok(mut stream) = TcpStream::connect("127.0.0.1:56789") {
                         let req = AdminRequest::Shutdown;
                         let _ = serde_json::to_writer(&mut stream, &req);
                         let _ = std::io::Write::flush(&mut stream);
                     }
                }).join();
            }
        });
}
