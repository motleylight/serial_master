use anyhow::{Result, anyhow};
use serialport::SerialPort;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::mpsc;
use log::{info, error};

pub struct SerialManager {
    port: Arc<Mutex<Option<Box<dyn SerialPort>>>>,
    tx: Option<mpsc::Sender<Vec<u8>>>,
}

impl SerialManager {
    pub fn new() -> Self {
        Self {
            port: Arc::new(Mutex::new(None)),
            tx: None,
        }
    }

    pub fn open(
        &mut self, 
        port_name: &str, 
        baud_rate: u32,
        data_bits: serialport::DataBits,
        flow_control: serialport::FlowControl,
        parity: serialport::Parity,
        stop_bits: serialport::StopBits,
    ) -> Result<()> {
        let port = serialport::new(port_name, baud_rate)
            .data_bits(data_bits)
            .flow_control(flow_control)
            .parity(parity)
            .stop_bits(stop_bits)
            .timeout(Duration::from_millis(10))
            .open()
            .map_err(|e| anyhow!("Failed to open port: {}", e))?;

        let mut port_clone = port.try_clone().map_err(|e| anyhow!("Failed to clone port: {}", e))?;
        
        // Spawn read thread if we have a sender
        if let Some(tx) = self.tx.clone() {
            std::thread::spawn(move || {
                let mut buf = [0u8; 1024];
                loop {
                    match port_clone.read(&mut buf) {
                        Ok(n) if n > 0 => {
                            let data = buf[0..n].to_vec();
                            // If receiver is dropped, stop reading
                            if tx.blocking_send(data).is_err() {
                                break;
                            }
                        }
                        Ok(_) => {}, // Zero bytes read, ignore
                        Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => {
                            // Timeout is normal, just continue
                            continue;
                        }
                        Err(e) => {
                            error!("Serial read error: {}", e);
                            break;
                        }
                    }
                }
                info!("Read thread exited");
            });
        }

        let mut guard = self.port.lock().unwrap();
        *guard = Some(port);
        info!("Opened serial port: {} at {}", port_name, baud_rate);
        Ok(())
    }

    pub fn set_sender(&mut self, tx: mpsc::Sender<Vec<u8>>) {
        self.tx = Some(tx);
    }

    pub fn close(&mut self) -> Result<()> {
        let mut guard = self.port.lock().unwrap();
        if guard.is_some() {
            *guard = None; // Drop the port
            info!("Closed serial port");
        }
        Ok(())
    }

    pub async fn write(&self, data: &[u8]) -> Result<()> {
        let mut guard = self.port.lock().unwrap();
        if let Some(port) = guard.as_mut() {
            port.write_all(data).map_err(|e| anyhow!("Write error: {}", e))?;
            port.flush().map_err(|e| anyhow!("Flush error: {}", e))?;
            Ok(())
        } else {
            Err(anyhow!("Port not open"))
        }
    }
    
    // Placeholder for event loop
    pub fn start_event_loop(&mut self) {
        // Implementation for reading thread/task would go here
    }
}
