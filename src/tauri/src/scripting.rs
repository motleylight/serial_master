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
        let script = self.pre_send_script.lock().unwrap();
        if script.trim().is_empty() {
            return Ok(data);
        }

        // Initialize VM without standard library for speed/safety for now, or maybe with? 
        // using default() usually includes stdlib if features enabled.
        // For MVP let's assume simple logic.
        vm::Interpreter::without_stdlib(Default::default()).enter(|vm| {
            let scope = vm.new_scope_with_builtins();

            // Prepare data: list of integers
            let elements: Vec<PyObjectRef> = data
                .into_iter()
                .map(|b| vm.ctx.new_int(b).into())
                .collect();
            let py_data = vm.ctx.new_list(elements);

            // Set 'data' variable
            scope.locals.set_item("data", py_data.into(), vm).map_err(|e| format!("Scope error: {:?}", e))?;

            // Compile and run script
            let code_obj = vm
                .compile(script.as_str(), vm::compiler::Mode::Exec, "<pre_send_script>".to_owned())
                .map_err(|err| format!("Compile error: {:?}", err))?;

            vm.run_code_obj(code_obj, scope.clone())
                .map_err(|err| format!("Runtime error: {:?}", err))?;

            // Get 'data' back
            let result = scope.locals.get_item("data", vm).map_err(|_| "Variable 'data' missing after execution".to_string())?;

            // Expect a list of integers (bytes)
             let list = result.payload::<PyList>().ok_or("Result 'data' is not a list")?;
             let mut output = Vec::new();
             for item in list.borrow_vec().iter() {
                 let int_val = u8::try_from_object(vm, item.clone()).map_err(|_| "List item is not a valid byte (0-255)")?;
                 output.push(int_val);
             }

             Ok(output)
        })
    }

    pub fn run_rx_script(&self, data: Vec<u8>) -> Result<Vec<u8>, String> {
        let script = self.rx_script.lock().unwrap();
        if script.trim().is_empty() {
            return Ok(data);
        }

        vm::Interpreter::without_stdlib(Default::default()).enter(|vm| {
            let scope = vm.new_scope_with_builtins();
            let elements: Vec<PyObjectRef> = data.into_iter().map(|b| vm.ctx.new_int(b).into()).collect();
            let py_data = vm.ctx.new_list(elements);
            scope.locals.set_item("data", py_data.into(), vm).map_err(|e| format!("Scope error: {:?}", e))?;

            let code_obj = vm
                .compile(script.as_str(), vm::compiler::Mode::Exec, "<rx_script>".to_owned())
                .map_err(|err| format!("Compile error: {:?}", err))?;

            vm.run_code_obj(code_obj, scope.clone())
                .map_err(|err| format!("Runtime error: {:?}", err))?;

            let result = scope.locals.get_item("data", vm).map_err(|_| "Variable 'data' missing after execution".to_string())?;
            let list = result.payload::<PyList>().ok_or("Result 'data' is not a list")?;
            let mut output = Vec::new();
            for item in list.borrow_vec().iter() {
                let int_val = u8::try_from_object(vm, item.clone()).map_err(|_| "List item is not a valid byte (0-255)")?;
                output.push(int_val);
            }
            Ok(output)
        })
    }
}
