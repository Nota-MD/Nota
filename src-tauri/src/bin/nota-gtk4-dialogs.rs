//! Platform selector for the GTK4 secondary-dialog helper.
//!
//! Cargo discovers every top-level file in `src/bin` on every target. Keeping
//! the Linux implementation in a nested module lets Cargo skip GTK4 entirely
//! on Windows while still producing a valid binary target.

#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

#[cfg(target_os = "linux")]
#[path = "../gtk4_dialogs_helper.rs"]
mod linux;

#[cfg(target_os = "linux")]
fn main() {
    linux::main();
}

#[cfg(not(target_os = "linux"))]
fn main() {
    eprintln!("nota-gtk4-dialogs is only available on Linux");
    std::process::exit(1);
}
