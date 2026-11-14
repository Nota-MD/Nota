//! Small GTK4 helper for secondary dialogs.
//!
//! The editor process stays on GTK3. GTK3 and GTK4 cannot share one process, so
//! file and print dialogs run here and return their result over stdout.

#![cfg(target_os = "linux")]

use std::path::{Path, PathBuf};
use std::sync::mpsc;

use gtk4 as gtk;
use gtk4::prelude::*;
use gtk4::{gio, glib};
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DialogFilter {
    name: String,
    extensions: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FileRequest {
    mode: String,
    title: Option<String>,
    default_path: Option<String>,
    #[serde(default)]
    filters: Vec<DialogFilter>,
    #[serde(default)]
    multiple: bool,
}

#[derive(Debug, Serialize)]
struct FileResponse {
    paths: Vec<String>,
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    // A separate GTK4 dialog is the point; do not hand the request to a portal
    // whose appearance is controlled by another desktop process.
    std::env::set_var("GTK_USE_PORTAL", "0");
    gtk::init().map_err(|error| format!("GTK4 initialization failed: {error}"))?;

    let mut args = std::env::args_os().skip(1);
    match args
        .next()
        .and_then(|arg| arg.into_string().ok())
        .as_deref()
    {
        Some("file") => {
            let request_path = args
                .next()
                .map(PathBuf::from)
                .ok_or_else(|| "missing file-dialog request path".to_string())?;
            let request: FileRequest = serde_json::from_slice(
                &std::fs::read(&request_path)
                    .map_err(|error| format!("read request failed: {error}"))?,
            )
            .map_err(|error| format!("parse request failed: {error}"))?;
            let paths = file_dialog(request)?;
            println!(
                "{}",
                serde_json::to_string(&FileResponse {
                    paths: paths
                        .into_iter()
                        .map(|path| path.to_string_lossy().into_owned())
                        .collect(),
                })
                .map_err(|error| format!("serialize response failed: {error}"))?
            );
            Ok(())
        }
        Some("print") => {
            let pdf = args
                .next()
                .map(PathBuf::from)
                .ok_or_else(|| "missing PDF path".to_string())?;
            print_dialog(&pdf)
        }
        _ => Err("usage: nota-gtk4-dialogs file <request.json> | print <file.pdf>".to_string()),
    }
}

fn file_dialog(request: FileRequest) -> Result<Vec<PathBuf>, String> {
    let dialog = gtk::FileDialog::new();
    dialog.set_modal(true);
    if let Some(title) = request.title.filter(|title| !title.trim().is_empty()) {
        dialog.set_title(&title);
    }

    let filters = gio::ListStore::new::<gtk::FileFilter>();
    for filter in request.filters {
        let next = gtk::FileFilter::new();
        next.set_name(Some(&filter.name));
        for extension in filter.extensions {
            let extension = extension
                .trim()
                .trim_start_matches("*.")
                .trim_start_matches('.');
            if !extension.is_empty() {
                let pattern = if extension == "*" {
                    "*".to_string()
                } else {
                    format!("*.{extension}")
                };
                next.add_pattern(&pattern);
            }
        }
        filters.append(&next);
    }
    if filters.n_items() > 0 {
        dialog.set_filters(Some(&filters));
    }

    let default_path = request.default_path.as_deref().map(Path::new);
    if let Some(path) = default_path {
        let folder = if path.is_dir() {
            Some(path)
        } else {
            path.parent()
        };
        if let Some(folder) = folder {
            dialog.set_initial_folder(Some(&gio::File::for_path(folder)));
        }
        if request.mode == "save" {
            if let Some(name) = path.file_name().and_then(|name| name.to_str()) {
                dialog.set_initial_name(Some(name));
            }
        }
    }

    let loop_ = glib::MainLoop::new(None, false);
    let (sender, receiver) = mpsc::channel();
    if request.mode == "directory" {
        let done = loop_.clone();
        dialog.select_folder(
            None::<&gtk::Window>,
            None::<&gio::Cancellable>,
            move |result| {
                let _ = sender.send(result.map(|file| vec![file]));
                done.quit();
            },
        );
    } else if request.mode == "save" {
        let done = loop_.clone();
        dialog.save(
            None::<&gtk::Window>,
            None::<&gio::Cancellable>,
            move |result| {
                let _ = sender.send(result.map(|file| vec![file]));
                done.quit();
            },
        );
    } else if request.multiple {
        let done = loop_.clone();
        dialog.open_multiple(
            None::<&gtk::Window>,
            None::<&gio::Cancellable>,
            move |result| {
                let files = result.map(|model| {
                    (0..model.n_items())
                        .filter_map(|index| model.item(index)?.downcast::<gio::File>().ok())
                        .collect::<Vec<_>>()
                });
                let _ = sender.send(files);
                done.quit();
            },
        );
    } else {
        let done = loop_.clone();
        dialog.open(
            None::<&gtk::Window>,
            None::<&gio::Cancellable>,
            move |result| {
                let _ = sender.send(result.map(|file| vec![file]));
                done.quit();
            },
        );
    }
    loop_.run();
    let result = receiver
        .recv()
        .map_err(|_| "GTK4 file dialog returned no result".to_string())?;
    let files = match result {
        Ok(files) => files,
        Err(error) if dialog_was_cancelled(&error) => return Ok(Vec::new()),
        Err(error) => return Err(error.to_string()),
    };
    Ok(files.into_iter().filter_map(|file| file.path()).collect())
}

fn print_dialog(pdf: &Path) -> Result<(), String> {
    let dialog = gtk::PrintDialog::new();
    dialog.set_title("Nota");
    let file = gio::File::for_path(pdf);
    let loop_ = glib::MainLoop::new(None, false);
    let (sender, receiver) = mpsc::channel();
    let done = loop_.clone();
    dialog.print_file(
        None::<&gtk::Window>,
        None,
        &file,
        None::<&gio::Cancellable>,
        move |result| {
            let _ = sender.send(result);
            done.quit();
        },
    );
    loop_.run();
    let result = receiver
        .recv()
        .map_err(|_| "GTK4 print dialog returned no result".to_string())?;
    match result {
        Ok(()) => Ok(()),
        Err(error) if dialog_was_cancelled(&error) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

fn dialog_was_cancelled(error: &gtk::glib::Error) -> bool {
    error.matches(gtk::DialogError::Cancelled) || error.matches(gtk::DialogError::Dismissed)
}
