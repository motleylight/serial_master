use anyhow::{Result, anyhow};
use serialport::SerialPort;
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tokio::sync::mpsc;
use log::{info, error};
use std::io::{Read, Write};

pub struct SerialManager {
    port: Arc<Mutex<Option<Box<dyn SerialPort>>>>,
    tx: Option<mpsc::Sender<Vec<u8>>>,
    should_run: Arc<AtomicBool>,
    // Port sharing fields
    virtual_port: Arc<Mutex<Option<Box<dyn SerialPort>>>>,
    sharing_active: Arc<AtomicBool>,
}

impl SerialManager {
    pub fn new() -> Self {
        Self {
            port: Arc::new(Mutex::new(None)),
            tx: None,
            should_run: Arc::new(AtomicBool::new(false)),
            virtual_port: Arc::new(Mutex::new(None)),
            sharing_active: Arc::new(AtomicBool::new(false)),
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
        
        self.should_run.store(true, Ordering::SeqCst);
        let should_run = self.should_run.clone();
        let virtual_port_handle = self.virtual_port.clone();

        if let Some(tx) = self.tx.clone() {
            std::thread::spawn(move || {
                let mut buf = [0u8; 4096];
                while should_run.load(Ordering::SeqCst) {
                    match port_clone.read(&mut buf) {
                        Ok(n) if n > 0 => {
                            let data = buf[0..n].to_vec();
                            
                            // Send to UI
                            if tx.blocking_send(data.clone()).is_err() {
                                break;
                            }
                            
                            // Forward to Virtual Port (if sharing)
                            if let Ok(mut v_guard) = virtual_port_handle.lock() {
                                if let Some(v_port) = v_guard.as_mut() {
                                    let _ = v_port.write_all(&data);
                                    let _ = v_port.flush();
                                }
                            }
                        }
                        Ok(_) => {}
                        Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => continue,
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
        self.should_run.store(false, Ordering::SeqCst);
        // Do NOT stop sharing on close. Doing so breaks the "Persistent Sharing" feature
        // where the user expects the bridge to remain active even if the physical connection drops or is toggled.
        // let _ = self.stop_sharing(); 

        let mut guard = self.port.lock().unwrap();
        if guard.is_some() {
            *guard = None;
            info!("Closed serial port (Sharing status: preserved)");
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

    /// Start sharing: attach virtual port and spawn reverse bridge thread
    pub fn start_sharing(&mut self, virtual_port_name: &str) -> Result<()> {
        let v_port = serialport::new(virtual_port_name, 115200)
            .timeout(Duration::from_millis(10))
            .flow_control(serialport::FlowControl::None)
            .open()
            .map_err(|e| anyhow!("Failed to open virtual port {}: {}", virtual_port_name, e))?;

        info!("Sharing attached: Bridging to {}", virtual_port_name);

        // Clone for V->P thread (independent handle, no mutex contention)
        let mut v_port_for_read = v_port.try_clone()
            .map_err(|e| anyhow!("Failed to clone virtual port: {}", e))?;

        {
            let mut guard = self.virtual_port.lock().unwrap();
            *guard = Some(v_port); // Main loop uses this for P->V writes
        }
        self.sharing_active.store(true, Ordering::SeqCst);

        // Spawn V->P thread with its own port handle (no mutex needed for read)
        let physical_port_handle = self.port.clone();
        let sharing_flag = self.sharing_active.clone();

        std::thread::spawn(move || {
            let mut buf = [0u8; 1024]; // Smaller buffer for lower latency
            while sharing_flag.load(Ordering::SeqCst) {
                // Direct read without mutex - v_port_for_read is owned by this thread
                match v_port_for_read.read(&mut buf) {
                    Ok(n) if n > 0 => {
                        if let Ok(mut p_guard) = physical_port_handle.lock() {
                            if let Some(p_port) = p_guard.as_mut() {
                                let _ = p_port.write_all(&buf[0..n]);
                                let _ = p_port.flush();
                            }
                        }
                    }
                    Ok(_) => {}
                    Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => {}
                    Err(_) => break,
                }
            }
            info!("Sharing V->P thread exited");
        });

        Ok(())
    }

    /// Stop sharing
    pub fn stop_sharing(&mut self) -> Result<()> {
        self.sharing_active.store(false, Ordering::SeqCst);
        std::thread::sleep(Duration::from_millis(20));

        let mut guard = self.virtual_port.lock().unwrap();
        *guard = None;
        info!("Sharing stopped");
        Ok(())
    }
}
