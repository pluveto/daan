use crate::mcp::control::ProcessRegistry;

mod mcp;
mod miniapp;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ProcessRegistry::default()) // Add the state
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            mcp::cmd::start_external_process,
            mcp::cmd::send_message_to_process,
            mcp::cmd::stop_external_process
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
