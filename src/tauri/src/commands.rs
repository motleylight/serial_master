use serial_master::core::serial_manager::SerialManager;
use tauri::State;
use tokio::sync::Mutex;
use serde::{Deserialize, Serialize};
use serialport::{DataBits, FlowControl, Parity, StopBits, SerialPortType};

// Generic helper to map any error to String
fn to_string_err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

#[derive(Debug, Deserialize)]
pub struct SerialConfig {
    pub port_name: String,
    pub baud_rate: u32,
    pub data_bits: u8,
    pub flow_control: String,
    pub parity: String,
    pub stop_bits: u8,
}

impl SerialConfig {
    fn to_params(&self) -> Result<(DataBits, FlowControl, Parity, StopBits), String> {
        let data_bits = match self.data_bits {
            5 => DataBits::Five,
            6 => DataBits::Six,
            7 => DataBits::Seven,
            8 => DataBits::Eight,
            _ => return Err(format!("Invalid data bits: {}", self.data_bits)),
        };

        let flow_control = match self.flow_control.as_str() {
            "None" => FlowControl::None,
            "Software" => FlowControl::Software,
            "Hardware" => FlowControl::Hardware,
            _ => return Err(format!("Invalid flow control: {}", self.flow_control)),
        };

        let parity = match self.parity.as_str() {
            "None" => Parity::None,
            "Odd" => Parity::Odd,
            "Even" => Parity::Even,
            _ => return Err(format!("Invalid parity: {}", self.parity)),
        };

        let stop_bits = match self.stop_bits {
            1 => StopBits::One,
            2 => StopBits::Two,
            _ => return Err(format!("Invalid stop bits: {}", self.stop_bits)),
        };

        Ok((data_bits, flow_control, parity, stop_bits))
    }
}

#[derive(Debug, Serialize, Clone)]
pub struct PortInfo {
    pub port_name: String,
    pub product_name: Option<String>,
}

use std::collections::HashMap;

#[derive(Deserialize)]
struct Win32SerialPort {
    DeviceID: String,
    Name: String,
}

fn get_win32_port_names() -> HashMap<String, String> {
    let mut map = HashMap::new();
    
    // Only run on Windows
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        
        let output = std::process::Command::new("powershell")
            .args(&["-NoProfile", "-Command", "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-CimInstance Win32_SerialPort | Select-Object DeviceID, Name | ConvertTo-Json"])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .output();

        if let Ok(output) = output {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                // Handle single object vs array vs empty
                if let Ok(ports) = serde_json::from_str::<Vec<Win32SerialPort>>(&stdout) {
                    for port in ports {
                        map.insert(port.DeviceID, port.Name);
                    }
                } else if let Ok(port) = serde_json::from_str::<Win32SerialPort>(&stdout) {
                     map.insert(port.DeviceID, port.Name);
                }
            }
        }
    }
    
    map
}

#[tauri::command]
pub async fn get_ports() -> Result<Vec<PortInfo>, String> {
    let friendly_names = get_win32_port_names();

    let mut ports: Vec<PortInfo> = serialport::available_ports()
        .map_err(|e: serialport::Error| e.to_string())?
        .into_iter()
        .filter(|p| !p.port_name.to_lowercase().starts_with("cnc"))
        .map(|p| {
            // Try to get name from Windows WMI first (matches Device Manager)
            let wmi_name = friendly_names.get(&p.port_name).cloned();

            // Fallback to library detection
            let product_name = match wmi_name {
                Some(name) => Some(name),
                None => match p.port_type {
                    SerialPortType::UsbPort(info) => {
                        let product = info.product.unwrap_or_default();
                        let manufacturer = info.manufacturer.unwrap_or_default();
                        if !product.is_empty() {
                            Some(product)
                        } else if !manufacturer.is_empty() {
                            Some(manufacturer)
                        } else {
                            Some("USB Device".to_string())
                        }
                    },
                    SerialPortType::BluetoothPort => Some("Bluetooth Device".to_string()),
                    SerialPortType::PciPort => Some("PCI Device".to_string()),
                    SerialPortType::Unknown => Some("Standard Serial Port".to_string()),
                }
            };
            
            PortInfo {
                port_name: p.port_name,
                product_name,
            }
        })
        .collect();
    
    // Natural Sort (e.g., COM9 before COM10)
    ports.sort_by(|a, b| {
        // Extract numeric part if possible
        let extract_num = |s: &str| -> Option<u32> {
            s.chars()
             .skip_while(|c| !c.is_ascii_digit())
             .take_while(|c| c.is_ascii_digit())
             .collect::<String>()
             .parse::<u32>()
             .ok()
        };

        let num_a = extract_num(&a.port_name);
        let num_b = extract_num(&b.port_name);

        match (num_a, num_b) {
            (Some(na), Some(nb)) => na.cmp(&nb),
            _ => a.port_name.cmp(&b.port_name),
        }
    });

    Ok(ports)
}

#[tauri::command]
pub async fn connect(
    state: State<'_, Mutex<SerialManager>>,
    config: SerialConfig,
) -> Result<(), String> {
    let mut manager = state.lock().await;
    let (data_bits, flow_control, parity, stop_bits) = config.to_params()?;
    
    manager.open(
        &config.port_name, 
        config.baud_rate,
        data_bits,
        flow_control,
        parity,
        stop_bits
    ).map_err(to_string_err)?;
    Ok(())
}

#[tauri::command]
pub async fn disconnect(state: State<'_, Mutex<SerialManager>>) -> Result<(), String> {
    let mut manager = state.lock().await;
    manager.close().map_err(to_string_err)?;
    Ok(())
}

#[tauri::command]
pub async fn send(state: State<'_, Mutex<SerialManager>>, script_manager: State<'_, crate::scripting::ScriptManager>, content: Vec<u8>) -> Result<(), String> {
    let final_content = script_manager.run_pre_send(content)?;
    let manager = state.lock().await;
    manager.write(&final_content).await.map_err(to_string_err)?;
    Ok(())
}

#[tauri::command]
pub async fn set_script(state: State<'_, crate::scripting::ScriptManager>, script_type: String, content: String) -> Result<(), String> {
    match script_type.as_str() {
        "pre_send" => state.set_pre_send_script(content),
        "post_send" => state.set_post_send_script(content),
        "rx" => state.set_rx_script(content),
        _ => return Err(format!("Invalid script type: {}", script_type)),
    }
    Ok(())
}
