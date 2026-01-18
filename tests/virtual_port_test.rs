use serial_util::core::com0com_manager::Com0comManager;
use serial_util::core::hub4com_manager::Hub4comManager;

// 注意：这些测试需要管理员权限才能完全通过
// 运行测试时会触发 UAC 弹窗

#[test]
fn test_list_pairs() {
    let result = Com0comManager::new();
    if let Ok(manager) = result {
        println!("Found setupc at: {:?}", manager.is_installed());
        match manager.list_pairs() {
            Ok(pairs) => {
                println!("Found {} pairs", pairs.len());
                for pair in pairs {
                    println!("{:?}", pair);
                }
            }
            Err(e) => eprintln!("Failed to list pairs: {}", e),
        }
    } else {
        println!("com0com not installed, skipping test");
    }
}

#[test]
#[ignore] // 默认忽略，避免 CI 失败，需手动运行
fn test_lifecycle() {
    let manager = Com0comManager::new().expect("com0com not installed");
    
    // 1. 创建 Pair
    println!("Creating pair...");
    let pair = manager.create_pair("-", "-").expect("Failed to create pair");
    println!("Created pair: {:?}", pair);
    
    let original_id = pair.pair_id;
    let old_a = pair.port_a.clone();
    
    // 2. 改名
    println!("Renaming pair...");
    // 尝试改名为两个非常规名称，避免冲突
    let new_name_a = format!("TestPortA_{}", original_id);
    let new_name_b = format!("TestPortB_{}", original_id);
    
    manager.rename_pair(original_id, &new_name_a, &new_name_b).expect("Failed to rename");
    
    // 验证改名
    let pairs = manager.list_pairs().unwrap();
    let updated = pairs.iter().find(|p| p.pair_id == original_id).unwrap();
    assert_eq!(updated.port_a, new_name_a);
    assert_eq!(updated.port_b, new_name_b);
    println!("Rename verified!");
    
    // 3. 删除
    println!("Removing pair...");
    manager.remove_pair(original_id).expect("Failed to remove");
    
    // 验证删除
    let pairs_after = manager.list_pairs().unwrap();
    assert!(pairs_after.iter().all(|p| p.pair_id != original_id));
    println!("Remove verified!");
}

#[test]
fn test_hub4com_detection() {
    if Hub4comManager::is_installed() {
        println!("hub4com is installed");
    } else {
        println!("hub4com not found");
    }
}
