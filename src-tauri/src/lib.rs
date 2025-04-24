use crate::mcp::ProcessRegistry;

mod mcp;
mod cmd;

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
      cmd::start_external_process,
      cmd::send_message_to_process,
      cmd::stop_external_process
  ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
