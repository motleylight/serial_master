use serial_master::core::serial_manager::SerialManager;
use tauri::State;
use tokio::sync::Mutex;
use serde::Deserialize;
use serialport::{DataBits, FlowControl, Parity, StopBits};

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

#[tauri::command]
pub async fn get_ports() -> Result<Vec<String>, String> {
    let ports = serialport::available_ports()
        .map_err(|e: serialport::Error| e.to_string())?
        .into_iter()
        .map(|p| p.port_name)
        .collect();
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
pub async fn send(state: State<'_, Mutex<SerialManager>>, content: Vec<u8>) -> Result<(), String> {
    let manager = state.lock().await;
    manager.write(&content).await.map_err(to_string_err)?;
    Ok(())
}
