use rustpython::vm;
use rustpython::vm::builtins::PyList;
use rustpython::vm::PyObjectRef;
use std::sync::{Arc, Mutex};
use rustpython::vm::convert::TryFromObject;

#[derive(Clone)]
pub struct ScriptManager {
    pub pre_send_script: Arc<Mutex<String>>,
    pub post_send_script: Arc<Mutex<String>>,
    pub rx_script: Arc<Mutex<String>>,
}

impl ScriptManager {
    pub fn new() -> Self {
        Self {
            pre_send_script: Arc::new(Mutex::new(String::new())),
            post_send_script: Arc::new(Mutex::new(String::new())),
            rx_script: Arc::new(Mutex::new(String::new())),
        }
    }

    pub fn set_pre_send_script(&self, script: String) {
        let mut s = self.pre_send_script.lock().unwrap();
        *s = script;
    }

    pub fn set_post_send_script(&self, script: String) {
        let mut s = self.post_send_script.lock().unwrap();
        *s = script;
    }

    pub fn set_rx_script(&self, script: String) {
        let mut s = self.rx_script.lock().unwrap();
        *s = script;
    }

    pub fn run_pre_send(&self, data: Vec<u8>) -> Result<Vec<u8>, String> {
        let script = {
            let s = self.pre_send_script.lock().unwrap();
            if s.trim().is_empty() {
                return Ok(data);
            }
            s.clone()
        };

        // Initialize VM with standard library
        match std::panic::catch_unwind(|| {
            vm::Interpreter::without_stdlib(Default::default()).enter(|vm| {
                 let scope = vm.new_scope_with_builtins();
                 
                 // ... setup (same as before) ...
                 let elements: Vec<PyObjectRef> = data
                    .into_iter()
                    .map(|b| vm.ctx.new_int(b).into())
                    .collect();
                 let py_data = vm.ctx.new_list(elements);
                 
                 scope.locals.set_item("data", py_data.into(), vm).map_err(|e| format!("{:?}", e))?;

                 let code_obj = vm
                    .compile(script.as_str(), vm::compiler::Mode::Exec, "<pre_send_script>".to_owned())
                    .map_err(|err| format!("Compile error: {:?}", err))?;

                 vm.run_code_obj(code_obj, scope.clone())
                    .map_err(|err| format!("Runtime error: {:?}", err))?;

                 let result = scope.locals.get_item("data", vm).map_err(|_| "Variable 'data' missing".to_string())?;
                 
                 let list = result.payload::<PyList>().ok_or("Result 'data' is not a list")?;
                 let mut output = Vec::new();
                 for item in list.borrow_vec().iter() {
                     let int_val = u8::try_from_object(vm, item.clone()).map_err(|_| "List item is not a valid byte (0-255)")?;
                     output.push(int_val);
                 }
                 Ok(output)
            })
        }) {
            Ok(res) => res,
            Err(_) => Err("Script execution panicked".to_string()),
        }
    }

    pub fn run_rx_script(&self, data: Vec<u8>) -> Result<Vec<u8>, String> {
        let script = {
            let s = self.rx_script.lock().unwrap();
            if s.trim().is_empty() {
                return Ok(data);
            }
            s.clone()
        };

        match std::panic::catch_unwind(|| {
            vm::Interpreter::without_stdlib(Default::default()).enter(|vm| {
                let scope = vm.new_scope_with_builtins();
                let elements: Vec<PyObjectRef> = data.into_iter().map(|b| vm.ctx.new_int(b).into()).collect();
                let py_data = vm.ctx.new_list(elements);
                scope.locals.set_item("data", py_data.into(), vm).map_err(|e| format!("{:?}", e))?;

                let code_obj = vm
                    .compile(script.as_str(), vm::compiler::Mode::Exec, "<rx_script>".to_owned())
                    .map_err(|err| format!("Compile error: {:?}", err))?;

                vm.run_code_obj(code_obj, scope.clone())
                    .map_err(|err| format!("Runtime error: {:?}", err))?;

                let result = scope.locals.get_item("data", vm).map_err(|_| "Variable 'data' missing".to_string())?;
                let list = result.payload::<PyList>().ok_or("Result 'data' is not a list")?;
                let mut output = Vec::new();
                for item in list.borrow_vec().iter() {
                    let int_val = u8::try_from_object(vm, item.clone()).map_err(|_| "List item is not a valid byte (0-255)")?;
                    output.push(int_val);
                }
                Ok(output)
            })
        }) {
            Ok(res) => res,
            Err(_) => Err("Script execution panicked".to_string()),
        }
    }
}
