use crate::{
    mcp::control::{emit_event, handle_stdout, monitor_process, ManagedProcess},
    ProcessRegistry,
};
use tauri::AppHandle;
use tauri::State;
use tokio::{io::{AsyncBufReadExt, AsyncWriteExt, BufReader}, process::{Child, ChildStdin}};
use uuid::Uuid;

#[tauri::command]
pub async fn start_external_process(
    command: String,
    args: Vec<String>,
    app_handle: AppHandle, // Get AppHandle for event emission and task spawning
    registry: State<'_, ProcessRegistry>, // Access the shared state
) -> Result<String, String> {
    println!(
        "Attempting to start process: {} with args {:?}",
        command, args
    );

    let mut cmd = tokio::process::Command::new(command);
    cmd.args(args)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped()) // Capture stderr too
        .kill_on_drop(true); // Ensure process is killed if Child is dropped

    match cmd.spawn() {
        Ok(mut child) => {
            let process_id = Uuid::new_v4().to_string();
            println!("Process started successfully with ID: {}", process_id);

            let stdin = child
                .stdin
                .take()
                .ok_or_else(|| "Failed to capture stdin".to_string())?;
            let stdout = child
                .stdout
                .take()
                .ok_or_else(|| "Failed to capture stdout".to_string())?;
            // You might want to handle stderr similarly to stdout if needed
            let stderr = child
                .stderr
                .take()
                .ok_or_else(|| "Failed to capture stderr".to_string())?;

            let managed_process = ManagedProcess::new(child).with_stdin(stdin);

            // Store the process handle
            registry
                .lock()
                .unwrap()
                .insert(process_id.clone(), managed_process);
            println!("Process {} added to registry.", process_id);

            // Spawn task to read stdout
            let stdout_handle = app_handle.clone();
            let stdout_pid = process_id.clone();
            tokio::spawn(async move {
                let reader = BufReader::new(stdout);
                handle_stdout(reader, stdout_pid, stdout_handle).await;
            });
            println!("Spawned stdout handler task for process {}.", process_id);

            // Spawn task to read stderr (optional, but recommended for debugging)
            let stderr_handle = app_handle.clone();
            let stderr_pid = process_id.clone();
            tokio::spawn(async move {
                let mut reader = BufReader::new(stderr);
                let mut line = String::new();
                loop {
                    match reader.read_line(&mut line).await {
                        Ok(0) => break, // EOF
                        Ok(_) => {
                            eprintln!("[Process {} stderr]: {}", stderr_pid, line.trim());
                            emit_event(
                                &format!("process_stderr_{}", stderr_pid),
                                line.trim().to_string(),
                                &stderr_handle,
                            );
                            line.clear();
                        }
                        Err(e) => {
                            eprintln!("Error reading stderr for {}: {}", stderr_pid, e);
                            break;
                        }
                    }
                }
                println!("Stderr handler task finished for {}.", stderr_pid);
            });
            println!("Spawned stderr handler task for process {}.", process_id);

             // Spawn task to monitor process completion
            let monitor_registry = registry.clone(); // Clone the Arc<Mutex<...>> for the monitor task
            let monitor_handle = app_handle.clone();
            let monitor_pid = process_id.clone();

            // Get the child handle *from the registry* for the monitor task.
            // We need to do this carefully. The monitor task will own the Child handle.
            // Let's modify ManagedProcess to allow taking the child handle for monitoring.
             let child_to_monitor = {
                 let mut lock = registry.lock().unwrap();
                 if let Some(proc) = lock.get_mut(&monitor_pid) {
                     // Add a method like `take_child_for_monitoring` to ManagedProcess
                     // that returns Option<Child> and leaves the ManagedProcess without a child.
                     // Or, simpler: just pass the registry itself and let monitor_process handle removal.
                     // Let's stick to passing the registry.
                     // NO NEED TO TAKE CHILD HERE, monitor_process will handle it via registry.
                 } else {
                      // Should not happen if we just inserted it, but handle defensively
                      eprintln!("Failed to find process {} immediately after insertion for monitoring.", monitor_pid);
                      return Err("Internal error: Failed to setup process monitoring".to_string());
                 }
             };

             let monitor_registry_clone: ProcessRegistry = registry.inner().clone(); // <--- Use .inner().clone()

            tokio::spawn(async move {
                // Pass the registry State wrapped in the Arc directly
                monitor_process(
                    monitor_pid, // Pass ID
                    monitor_handle,
                    monitor_registry_clone, 
                )
                .await;
            });
            println!("Spawned process monitor task for process {}.", process_id);

            Ok(process_id)
        }
        Err(e) => {
            eprintln!("Failed to start process: {}", e);
            Err(format!("Failed to start process: {}", e))
        }
    }
}

#[tauri::command]
pub async fn send_message_to_process(
    id: String,
    message: String, // Assume message is already JSON stringified by frontend
    registry: State<'_, ProcessRegistry>,
) -> Result<(), String> {
    println!("Attempting to send message to process {}: {}", id, message);

    // --- Step 1: Acquire lock, get stdin, release lock ---
    let mut stdin_handle = { // Create a scope for the MutexGuard
        let mut lock = registry.lock()
            .map_err(|_| "Mutex poisoned".to_string())?; // Handle potential poisoning

        if let Some(managed_process) = lock.get_mut(&id) {
            // Take the stdin handle out. managed_process.stdin will become None.
            managed_process.stdin.take()
        } else {
            // Process not found in the registry
            println!("Process {} not found in registry.", id);
            return Err(format!("Process with ID {} not found.", id));
        }
        // MutexGuard `lock` is dropped here as it goes out of scope
    }; // --- MutexGuard scope ends ---


    // --- Step 2: Perform async operation outside the lock ---
    if let Some(mut stdin) = stdin_handle.take() { // Take ownership of stdin from the Option
        let mut msg_with_newline = message;
        msg_with_newline.push('\n'); // Assuming newline-delimited JSON

        let write_result = stdin.write_all(msg_with_newline.as_bytes()).await;

        // --- Step 3: Re-acquire lock to potentially put stdin back ---
        { // Create a new scope for the second lock
            let mut lock = registry.lock()
                .map_err(|_| "Mutex poisoned while trying to return stdin".to_string())?;

            // Check if the process *still* exists in the registry
            if let Some(managed_process) = lock.get_mut(&id) {
                // Put the stdin handle back into the managed process only if write was successful
                // If write failed, stdin might be in a bad state, maybe log and drop it?
                // Or always try to put it back? Let's put it back for now.
                if managed_process.stdin.is_none() { // Avoid overwriting if another thread somehow put one back
                    managed_process.stdin = Some(stdin);
                } else {
                     eprintln!("Stdin for process {} was unexpectedly present when trying to return handle.", id);
                     // Drop the handle we took earlier as we cannot put it back
                     drop(stdin);
                }
            } else {
                // The process was removed from the registry (e.g., stopped) while we were writing.
                // The stdin handle we have will be dropped naturally when `stdin` goes out of scope.
                eprintln!("Process {} was removed while sending message. Stdin handle will be dropped.", id);
            }
            // Second MutexGuard `lock` is dropped here
        } // --- Second MutexGuard scope ends ---

        // Now handle the result of the write operation
        match write_result {
            Ok(_) => {
                println!("Message sent successfully to process {}.", id);
                Ok(())
            }
            Err(e) => {
                eprintln!("Failed to write to stdin for process {}: {}", id, e);
                Err(format!("Failed to write to stdin: {}", e))
            }
        }
    } else {
        // This means stdin was None when we first checked (either never existed or already taken)
        Err(format!("Stdin for process {} was not available.", id))
    }
}

#[tauri::command]
pub async fn stop_external_process(
    id: String,
    registry: State<'_, ProcessRegistry>,
    // app_handle: AppHandle,
) -> Result<(), String> {
    println!("Attempting to stop process {}", id);

    // --- Step 1: Lock, remove process, get Child, unlock ---
    let child_to_kill: Option<Child> = { // Scope for the lock guard
        let lock_result = registry.lock();
        match lock_result {
            Ok(mut guard) => {
                // Remove the process from the registry
                guard.remove(&id)
                    // into_child now returns Option<Child>
                    .and_then(|managed_process| managed_process.into_child())
            }
            Err(poison_error) => {
                eprintln!("Mutex poisoned when trying to stop process {}: {}", id, poison_error);
                return Err(format!("Mutex poisoned: {}", poison_error));
            }
        }
    }; // --- Lock guard scope ends ---

    // --- Step 2: Kill the process outside the lock ---
    if let Some(mut child) = child_to_kill {
        match child.kill().await {
            Ok(_) => {
                println!("Kill signal sent successfully to process {}.", id);
                // The monitor task might still be running briefly, but it won't find the
                // entry when it tries to remove it later, which is fine.
                Ok(())
            }
            Err(e) => {
                eprintln!("Failed to send kill signal to process {}: {}", id, e);
                Err(format!("Failed to kill process: {}", e))
            }
        }
    } else {
        // Process was not found OR ManagedProcess existed but child was already taken (e.g., by monitor)
        eprintln!("Process {} not found or child handle already taken when stopping.", id);
        Err(format!("Process with ID {} not found or already being monitored/stopped.", id))
    }
}
