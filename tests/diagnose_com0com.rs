#[cfg(test)]
mod tests {
    use std::path::PathBuf;
    use std::process::Command;
    use serial_master::core::com0com_manager::Com0comManager;

    #[test]
    fn diagnose_com0com_environment() {
        println!("=== Starting com0com Diagnostic ===");

        // 1. Check Registry
        #[cfg(target_os = "windows")]
        {
            use winreg::enums::*;
            use winreg::RegKey;
            
            println!("Checking Registry...");
            let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
            
            let keys = [
                r"SOFTWARE\com0com",
                r"SOFTWARE\WOW6432Node\com0com"
            ];

            for k in &keys {
                match hklm.open_subkey(k) {
                    Ok(key) => {
                        println!("  Found Key: {}", k);
                        match key.get_value::<String, _>("Install_Dir") {
                            Ok(val) => println!("    Install_Dir: {}", val),
                            Err(e) => println!("    Failed to read Install_Dir: {}", e),
                        }
                    },
                    Err(_) => println!("  Key not found: {}", k),
                }
            }
        }

        // 2. Check Common Paths
        println!("\nChecking Common Paths...");
        let common_paths = [
            r"C:\Program Files (x86)\com0com\setupc.exe",
            r"C:\Program Files\com0com\setupc.exe",
            r"C:\Program Files (x86)\com0com\x64\setupc.exe",
            r"C:\Program Files\com0com\x64\setupc.exe",
        ];
        for p in &common_paths {
            let path = PathBuf::from(p);
            if path.exists() {
                 println!("  [EXISTS] {}", p);
            } else {
                 println!("  [MISSING] {}", p);
            }
        }

        // 3. Try Com0comManager detection
        println!("\nTesting Com0comManager::new()...");
        match Com0comManager::new() {
            Ok(manager) => {
                println!("  Manager created successfully.");
                // We can't easily access private field setupc_path, 
                // but we can try running a simple command
                println!("  Attempting to run 'list' command...");
                match manager.list_pairs() {
                    Ok(pairs) => {
                        println!("  'list' success. Found {} pairs.", pairs.len());
                        for p in pairs {
                            println!("    - {:?} <-> {:?}", p.port_a, p.port_b);
                        }
                    },
                    Err(e) => println!("  'list' FAILED: {:?}", e),
                }
            },
            Err(e) => {
                println!("  Manager creation FAILED: {:?}", e);
            }
        }
        
        println!("=== Diagnostic Finished ===");
    }
}
