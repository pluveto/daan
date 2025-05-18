use std::process::Stdio;

use crate::{
    mcp::control::{emit_event, handle_stdout, monitor_process, ManagedProcess},
    ProcessRegistry,
};
use tauri::AppHandle;
use tauri::State;
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin},
};
use uuid::Uuid;

async fn spawn_and_manage_process_internal(
    command_str: String,
    args_vec: Vec<String>,
    app_handle: &AppHandle,                      // Pass as reference
    registry_state: &State<'_, ProcessRegistry>, // Pass as reference
) -> Result<String, std::io::Error> {
    // Return std::io::Error to check kind
    println!("Internal spawn: {} with args {:?}", command_str, args_vec);

    let mut cmd = tokio::process::Command::new(&command_str);
    cmd.args(&args_vec)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    // Conditional compilation for Windows-specific settings if needed
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    match cmd.spawn() {
        Ok(mut child) => {
            let process_id = Uuid::new_v4().to_string();
            println!("Process started successfully with ID: {}", process_id);

            let stdin = child.stdin.take().ok_or_else(|| {
                std::io::Error::new(std::io::ErrorKind::Other, "Failed to capture stdin")
            })?;
            let stdout = child.stdout.take().ok_or_else(|| {
                std::io::Error::new(std::io::ErrorKind::Other, "Failed to capture stdout")
            })?;
            let stderr = child.stderr.take().ok_or_else(|| {
                std::io::Error::new(std::io::ErrorKind::Other, "Failed to capture stderr")
            })?;

            let managed_process = ManagedProcess::new(child).with_stdin(stdin);

            registry_state
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

            // Spawn task to read stderr
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
            // Clone the Arc<Mutex<...>> for the monitor task
            let monitor_registry_clone = registry_state.inner().clone();
            let monitor_handle = app_handle.clone();
            let monitor_pid = process_id.clone();

            tokio::spawn(async move {
                monitor_process(monitor_pid, monitor_handle, monitor_registry_clone).await;
            });
            println!("Spawned process monitor task for process {}.", process_id);

            Ok(process_id)
        }
        Err(e) => {
            // Don't print here, let the caller decide based on whether it's a retry
            Err(e)
        }
    }
}

#[tauri::command]
pub async fn start_external_process(
    command: String,
    args: Vec<String>,
    app_handle: AppHandle,
    registry: State<'_, ProcessRegistry>,
) -> Result<String, String> {
    println!(
        "Attempting to start process: {} with args {:?}",
        command, args
    );

    // First attempt
    match spawn_and_manage_process_internal(command.clone(), args.clone(), &app_handle, &registry)
        .await
    {
        Ok(process_id) => Ok(process_id),
        Err(e) => {
            if e.kind() == std::io::ErrorKind::NotFound {
                eprintln!(
                    "Initial spawn failed (NotFound): {}. Attempting OS-specific retry.",
                    e
                );

                let (retry_command_str, retry_args_vec) = if cfg!(target_os = "windows") {
                    let mut new_args = vec!["/c".to_string(), command.clone()];
                    new_args.extend(args.clone()); // Add original args after original command
                    ("cmd.exe".to_string(), new_args)
                } else {
                    // For sh -c "command arg1 arg2..."
                    // We need to join the original command and its arguments into a single string.
                    // Arguments containing spaces or special characters should be quoted.
                    let mut cmd_parts = vec![command.clone()]; // Start with the command
                    cmd_parts.extend(args.clone()); // Add all arguments

                    // shell-words::join will handle quoting individual parts if they contain spaces etc.
                    // and then join them with spaces. This is suitable for sh -c "..."
                    let escaped_full_command = shell_words::join(&cmd_parts);
                    (
                        "sh".to_string(),
                        vec!["-c".to_string(), escaped_full_command],
                    )
                };

                println!(
                    "Retrying with: {} and args {:?}",
                    retry_command_str, retry_args_vec
                );

                // Second attempt with OS-specific shell
                match spawn_and_manage_process_internal(
                    retry_command_str.clone(),
                    retry_args_vec.clone(),
                    &app_handle,
                    &registry,
                )
                .await
                {
                    Ok(process_id) => Ok(process_id),
                    Err(e2) => {
                        let err_msg = format!(
                            "Failed to start process on retry (cmd: '{}', args: {:?}): {}",
                            retry_command_str, retry_args_vec, e2
                        );
                        eprintln!("{}", err_msg);
                        Err(err_msg)
                    }
                }
            } else {
                // Error was not NotFound, or retry also failed
                let err_msg = format!(
                    "Failed to start process (cmd: '{}', args: {:?}): {}",
                    command, args, e
                );
                eprintln!("{}", err_msg);
                Err(err_msg)
            }
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
    let mut stdin_handle = {
        // Create a scope for the MutexGuard
        let mut lock = registry.lock().map_err(|_| "Mutex poisoned".to_string())?; // Handle potential poisoning

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
    if let Some(mut stdin) = stdin_handle.take() {
        // Take ownership of stdin from the Option
        let mut msg_with_newline = message;
        msg_with_newline.push('\n');

        let write_result = stdin.write_all(msg_with_newline.as_bytes()).await;

        // --- Step 3: Re-acquire lock to potentially put stdin back ---
        {
            // Create a new scope for the second lock
            let mut lock = registry
                .lock()
                .map_err(|_| "Mutex poisoned while trying to return stdin".to_string())?;

            // Check if the process *still* exists in the registry
            if let Some(managed_process) = lock.get_mut(&id) {
                // Put the stdin handle back into the managed process only if write was successful
                // If write failed, stdin might be in a bad state, maybe log and drop it?
                // Or always try to put it back? Let's put it back for now.
                if managed_process.stdin.is_none() {
                    // Avoid overwriting if another thread somehow put one back
                    managed_process.stdin = Some(stdin);
                } else {
                    eprintln!("Stdin for process {} was unexpectedly present when trying to return handle.", id);
                    // Drop the handle we took earlier as we cannot put it back
                    drop(stdin);
                }
            } else {
                // The process was removed from the registry (e.g., stopped) while we were writing.
                // The stdin handle we have will be dropped naturally when `stdin` goes out of scope.
                eprintln!(
                    "Process {} was removed while sending message. Stdin handle will be dropped.",
                    id
                );
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
    let child_to_kill: Option<Child> = {
        // Scope for the lock guard
        let lock_result = registry.lock();
        match lock_result {
            Ok(mut guard) => {
                // Remove the process from the registry
                guard
                    .remove(&id)
                    // into_child now returns Option<Child>
                    .and_then(|managed_process| managed_process.into_child())
            }
            Err(poison_error) => {
                eprintln!(
                    "Mutex poisoned when trying to stop process {}: {}",
                    id, poison_error
                );
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
        eprintln!(
            "Process {} not found or child handle already taken when stopping.",
            id
        );
        Err(format!(
            "Process with ID {} not found or already being monitored/stopped.",
            id
        ))
    }
}
