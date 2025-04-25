use std::collections::HashMap;
use std::ops::{Deref, DerefMut};
use std::sync::{Arc, Mutex, MutexGuard};
use tauri::{AppHandle, Emitter, Manager, State, Window}; // Ensure Manager is imported
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout};
use uuid::Uuid;

pub struct ManagedProcess {
    pub child: Option<Child>,
    // We need to wrap stdin/stdout in Option because they are taken when used
    pub stdin: Option<ChildStdin>,
    // We don't store stdout reader here, it's handled in a separate task
}

impl ManagedProcess {
    pub fn new(child: Child) -> Self {
        Self {
            child: Some(child),
            stdin: None,
        }
    }

    pub fn with_stdin(mut self, stdin: ChildStdin) -> Self {
        self.stdin = Some(stdin);
        self
    }

    pub fn take_child(&mut self) -> Option<Child> {
        self.child.take()
    }

    pub fn into_child(self) -> Option<Child> {
        self.child
    }
}

// Use a Mutex to safely share the process map across threads
#[derive(Default)]
pub struct ProcessRegistry(Arc<Mutex<HashMap<String, ManagedProcess>>>);

impl Deref for ProcessRegistry {
    type Target = Mutex<HashMap<String, ManagedProcess>>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl Clone for ProcessRegistry {
    fn clone(&self) -> Self {
        ProcessRegistry(self.0.clone())
    }
}

impl DerefMut for ProcessRegistry {
    fn deref_mut(&mut self) -> &mut Self::Target {
        Arc::get_mut(&mut self.0).expect("Cannot get mutable reference when multiple owners exist")
    }
}

impl ProcessRegistry {
    pub fn lock(
        &self,
    ) -> Result<
        MutexGuard<HashMap<String, ManagedProcess>>,
        std::sync::PoisonError<MutexGuard<HashMap<String, ManagedProcess>>>,
    > {
        self.0.lock()
    }

    pub fn access<F, R>(
        &self,
        f: F,
    ) -> Result<R, std::sync::PoisonError<MutexGuard<HashMap<String, ManagedProcess>>>>
    where
        F: FnOnce(&mut HashMap<String, ManagedProcess>) -> R,
    {
        let mut guard = self.0.lock()?;
        Ok(f(&mut guard))
    }

    // pub fn clone_inner(&self) -> Result<HashMap<String, ManagedProcess>, std::sync::PoisonError<MutexGuard<HashMap<String, ManagedProcess>>>> {
    //     let guard = self.0.lock()?;
    //     Ok(guard.clone())
    // }
}

// Helper function to emit events to ALL windows
pub fn emit_event<S: Clone + serde::Serialize>(
    // Ensure S is Clone
    event_name: &str,
    payload: S, // Payload no longer needs Into<String> if it's Serialize
    app_handle: &AppHandle,
) {
    if let Err(e) = app_handle.emit(event_name, payload) {
        eprintln!(
            "Failed to emit event '{}' to all windows: {}",
            event_name, e
        );
    }
}

// Function to handle reading stdout from the process
pub async fn handle_stdout(
    mut stdout: BufReader<ChildStdout>,
    process_id: String,
    app_handle: AppHandle,
) {
    let mut line_buf = String::new();
    loop {
       
        match stdout.read_line(&mut line_buf).await {
            Ok(0) => {
                // EOF reached
                println!("Process {} stdout closed.", process_id);
                break;
            }
            Ok(_) => {
                // Attempt to parse the line as JSON
                let trimmed_line = line_buf.trim();
                if !trimmed_line.is_empty() {
                    // Emit the raw line or parsed JSON
                    // For robustness, you might want error handling for JSON parsing here
                    println!(
                        "Got stdout line from process {}: {}",
                        process_id, trimmed_line
                    );
                    emit_event(
                        &format!("process_message_{}", process_id),
                        trimmed_line.to_string(), // Send as string, frontend can parse JSON
                        &app_handle,
                    );
                }
                line_buf.clear(); // Clear buffer for the next line
            }
            Err(e) => {
                eprintln!("Error reading stdout for process {}: {}", process_id, e);
                emit_event(
                    &format!("process_error_{}", process_id),
                    format!("Error reading stdout: {}", e),
                    &app_handle,
                );
                break;
            }
        }
    }
    // Optionally emit a specific event when stdout stream ends
    // emit_event(&format!("process_stdout_closed_{}", process_id), (), &app_handle);
}

// Function to handle reading stdout from the process
pub async fn handle_stderr(
    mut stderr: BufReader<ChildStdout>,
    process_id: String,
    app_handle: AppHandle,
) {
    let mut line_buf = String::new();
    loop {
        match stderr.read_line(&mut line_buf).await {
            Ok(0) => {
                // EOF reached
                println!("Process {} stderr closed.", process_id);
                break;
            }
            Ok(_) => {
                // Attempt to parse the line as JSON
                let trimmed_line = line_buf.trim();
                if !trimmed_line.is_empty() {
                    // Emit the raw line or parsed JSON
                    // For robustness, you might want error handling for JSON parsing here
                    // emit_event(
                    //     &format!("process_message_{}", process_id),
                    //     trimmed_line.to_string(), // Send as string, frontend can parse JSON
                    //     &app_handle,
                    // );
                    println!(
                        "Got stderr line from process {}: {}",
                        process_id, trimmed_line
                    );
                }
                line_buf.clear(); // Clear buffer for the next line
            }
            Err(e) => {
                eprintln!("Error reading stderr for process {}: {}", process_id, e);
                break;
            }
        }
    }
    // Optionally emit a specific event when stdout stream ends
    // emit_event(&format!("process_stdout_closed_{}", process_id), (), &app_handle);
}

// Function to monitor process completion
pub async fn monitor_process(
    process_id: String,
    app_handle: AppHandle,
    registry: ProcessRegistry, // Takes the Arc<Mutex<...>> wrapper
) {
    // --- Step 1: Take the Child handle out of the registry ---
    let child_to_monitor: Option<Child> = { // Scope for the first lock guard
        let lock_result = registry.lock();
        match lock_result {
            Ok(mut guard) => {
                // Get mutable access to the ManagedProcess entry
                if let Some(managed_proc) = guard.get_mut(&process_id) {
                    // Take the child handle out of the ManagedProcess struct
                    managed_proc.take_child() // Returns Option<Child>
                } else {
                    // Process entry somehow already gone? Log error.
                    eprintln!("Monitor task could not find process {} in registry to take child.", process_id);
                    None
                }
            }
            Err(poison_error) => {
                eprintln!("Mutex poisoned when monitor task tried to take child {}: {}", process_id, poison_error);
                None
            }
        }
        // First MutexGuard is dropped here
    }; // --- First lock guard scope ends ---

    // --- Step 2: Wait for the process completion (if child was obtained) ---
    let mut maybe_wait_result: Option<Result<std::process::ExitStatus, std::io::Error>> = None;
    if let Some(mut child) = child_to_monitor {
        println!("Monitoring process {} for completion.", process_id); // Log now happens *before* waiting
        maybe_wait_result = Some(child.wait().await); // Await happens *outside* the lock
                                                      // child handle is dropped here
    } else {
        eprintln!(
            "Monitor task for process {} could not obtain child handle.",
            process_id
        );
        // Process might have been stopped externally before monitor could take child
    }

    // --- Step 3: Emit events based on wait result ---
    if let Some(wait_result) = maybe_wait_result {
        match wait_result {
            Ok(status) => {
                println!("Process {} exited with status: {}", process_id, status);
                emit_event(
                    &format!("process_closed_{}", process_id),
                    format!("Exited with status: {}", status),
                    &app_handle,
                );
            }
            Err(e) => {
                eprintln!("Error waiting for process {}: {}", process_id, e);
                emit_event(
                    &format!("process_error_{}", process_id),
                    format!("Error waiting for process: {}", e),
                    &app_handle,
                );
            }
        }
    }
    // If maybe_wait_result is None, it means we couldn't get the child, potentially stopped externally.
    // A closed event might have been emitted by stop_external_process or similar.

    // --- Step 4: Re-acquire lock and remove the ManagedProcess entry ---
    {
        // Scope for the second lock guard
        let lock_result = registry.lock();
        match lock_result {
            Ok(mut guard) => {
                // Remove the entry regardless of wait result, as monitoring is finished.
                if guard.remove(&process_id).is_some() {
                    println!(
                        "Removed process {} from registry after monitoring.",
                        process_id
                    );
                } else {
                    // Entry might have been removed by stop_external_process already
                    println!(
                        "Process {} was already removed from registry when monitor task finished.",
                        process_id
                    );
                }
            }
            Err(poison_error) => {
                eprintln!(
                    "Mutex poisoned when monitor task tried to remove entry {}: {}",
                    process_id, poison_error
                );
            }
        }
        // Second MutexGuard is dropped here
    } // --- Second lock guard scope ends ---

    println!("Finished monitoring task for process {}.", process_id);
}
