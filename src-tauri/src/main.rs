#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::Engine;
use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};
use walkdir::WalkDir;

#[derive(Serialize)]
struct FileEntry {
    name: String,
    path: String,
    #[serde(rename = "isDir")]
    is_dir: bool,
    children: Vec<FileEntry>,
}

#[derive(Serialize)]
struct SearchResult {
    path: String,
    line: usize,
    snippet: String,
}

#[tauri::command]
fn pick_markdown_file() -> Result<Option<String>, String> {
    Ok(rfd::FileDialog::new()
        .add_filter("Markdown", &["md", "markdown", "mdown"])
        .pick_file()
        .map(path_to_string))
}

#[tauri::command]
fn pick_folder() -> Result<Option<String>, String> {
    Ok(rfd::FileDialog::new().pick_folder().map(path_to_string))
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(format_io_error)
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    fs::write(path, content).map_err(format_io_error)
}

#[tauri::command]
fn save_markdown_as(
    content: String,
    default_dir: Option<String>,
) -> Result<Option<String>, String> {
    let mut dialog = rfd::FileDialog::new()
        .add_filter("Markdown", &["md"])
        .set_file_name("untitled.md");

    if let Some(dir) = default_dir.filter(|value| !value.trim().is_empty()) {
        dialog = dialog.set_directory(dir);
    }

    let Some(path) = dialog.save_file() else {
        return Ok(None);
    };

    fs::write(&path, content).map_err(format_io_error)?;
    Ok(Some(path_to_string(path)))
}

#[tauri::command]
fn list_markdown_folder(root: String) -> Result<Vec<FileEntry>, String> {
    let root_path = PathBuf::from(root);
    if !root_path.is_dir() {
        return Err("请选择有效的文件夹。".to_string());
    }

    let mut entries = Vec::new();
    for entry in fs::read_dir(root_path).map_err(format_io_error)? {
        let path = entry.map_err(format_io_error)?.path();
        if let Some(node) = build_file_tree(&path)? {
            entries.push(node);
        }
    }
    sort_entries(&mut entries);
    Ok(entries)
}

#[tauri::command]
fn search_markdown_files(root: String, query: String) -> Result<Vec<SearchResult>, String> {
    let normalized_query = query.trim().to_lowercase();
    if normalized_query.is_empty() {
        return Ok(Vec::new());
    }

    let mut results = Vec::new();
    for entry in WalkDir::new(root).into_iter().filter_map(Result::ok) {
        if results.len() >= 200 {
            break;
        }
        let path = entry.path();
        if !path.is_file() || !is_markdown_file(path) {
            continue;
        }

        let Ok(content) = fs::read_to_string(path) else {
            continue;
        };

        for (line_index, line) in content.lines().enumerate() {
            if !line.to_lowercase().contains(&normalized_query) {
                continue;
            }

            results.push(SearchResult {
                path: path_to_string(path),
                line: line_index + 1,
                snippet: trim_snippet(line),
            });

            if results.len() >= 200 {
                break;
            }
        }
    }

    Ok(results)
}

#[tauri::command]
fn save_data_url_asset(
    current_path: Option<String>,
    name: String,
    data_url: String,
) -> Result<String, String> {
    let (meta, payload) = data_url
        .split_once(',')
        .ok_or_else(|| "图片数据格式不正确。".to_string())?;
    if !meta.contains(";base64") {
        return Err("仅支持 base64 图片数据。".to_string());
    }

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(payload)
        .map_err(|error| format!("图片解码失败：{error}"))?;

    let current = current_path
        .as_ref()
        .filter(|value| !value.trim().is_empty())
        .map(PathBuf::from);
    let asset_dir = current
        .as_ref()
        .and_then(|path| path.parent().map(|parent| parent.join("assets")))
        .unwrap_or_else(default_asset_dir);

    fs::create_dir_all(&asset_dir).map_err(format_io_error)?;

    let extension = infer_extension(&name, meta);
    let stem = sanitize_file_stem(&name);
    let file_name = format!("{}-{}.{}", stem, timestamp_millis(), extension);
    let output_path = asset_dir.join(file_name);
    fs::write(&output_path, bytes).map_err(format_io_error)?;

    if current.is_some() {
        return Ok(format!(
            "assets/{}",
            output_path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("image.png")
        ));
    }

    Ok(path_to_string(output_path))
}

#[tauri::command]
fn copy_image_file_asset(current_path: Option<String>, path: String) -> Result<String, String> {
    let input_path = PathBuf::from(path);
    if !input_path.is_file() {
        return Err("请选择有效的图片文件。".to_string());
    }
    if !is_image_file(&input_path) {
        return Err("仅支持拖入图片文件。".to_string());
    }

    let current = current_path
        .as_ref()
        .filter(|value| !value.trim().is_empty())
        .map(PathBuf::from);
    let asset_dir = current
        .as_ref()
        .and_then(|path| path.parent().map(|parent| parent.join("assets")))
        .unwrap_or_else(default_asset_dir);

    fs::create_dir_all(&asset_dir).map_err(format_io_error)?;

    let extension = input_path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_lowercase())
        .unwrap_or_else(|| "png".to_string());
    let stem = sanitize_file_stem(
        input_path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("image"),
    );
    let file_name = format!("{}-{}.{}", stem, timestamp_millis(), extension);
    let output_path = asset_dir.join(file_name);
    fs::copy(&input_path, &output_path).map_err(format_io_error)?;

    if current.is_some() {
        return Ok(format!(
            "assets/{}",
            output_path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("image.png")
        ));
    }

    Ok(path_to_string(output_path))
}

#[tauri::command]
fn export_document_pandoc(
    markdown: String,
    current_path: Option<String>,
    format: String,
) -> Result<Option<String>, String> {
    let extension = match format.as_str() {
        "pdf" | "docx" | "rtf" | "epub" => format.as_str(),
        _ => return Err("不支持的导出格式。".to_string()),
    };

    let Some(output_path) = rfd::FileDialog::new()
        .add_filter(extension.to_uppercase(), &[extension])
        .set_file_name(format!("marko-export.{extension}"))
        .save_file()
    else {
        return Ok(None);
    };

    let temp_dir = std::env::temp_dir().join("marko");
    fs::create_dir_all(&temp_dir).map_err(format_io_error)?;
    let input_path = temp_dir.join(format!("export-{}.md", timestamp_millis()));
    fs::write(&input_path, markdown).map_err(format_io_error)?;

    let current_dir = current_path
        .as_ref()
        .and_then(|value| Path::new(value).parent())
        .map(Path::to_path_buf)
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));

    let output = Command::new("pandoc")
        .arg(&input_path)
        .arg("--resource-path")
        .arg(&current_dir)
        .arg("-o")
        .arg(&output_path)
        .current_dir(&current_dir)
        .output()
        .map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                "未找到 pandoc，请先安装 Pandoc 后再导出该格式。".to_string()
            } else {
                format!("启动 Pandoc 失败：{error}")
            }
        })?;

    let _ = fs::remove_file(&input_path);

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Pandoc 导出失败：{}", stderr.trim()));
    }

    Ok(Some(path_to_string(output_path)))
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            pick_markdown_file,
            pick_folder,
            read_text_file,
            write_text_file,
            save_markdown_as,
            list_markdown_folder,
            search_markdown_files,
            save_data_url_asset,
            copy_image_file_asset,
            export_document_pandoc,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn build_file_tree(path: &Path) -> Result<Option<FileEntry>, String> {
    if path.is_file() {
        if !is_markdown_file(path) {
            return Ok(None);
        }
        return Ok(Some(FileEntry {
            name: file_name(path),
            path: path_to_string(path),
            is_dir: false,
            children: Vec::new(),
        }));
    }

    if !path.is_dir() {
        return Ok(None);
    }

    let mut children = Vec::new();
    for entry in fs::read_dir(path).map_err(format_io_error)? {
        let child_path = entry.map_err(format_io_error)?.path();
        if let Some(child) = build_file_tree(&child_path)? {
            children.push(child);
        }
    }

    if children.is_empty() {
        return Ok(None);
    }

    sort_entries(&mut children);
    Ok(Some(FileEntry {
        name: file_name(path),
        path: path_to_string(path),
        is_dir: true,
        children,
    }))
}

fn sort_entries(entries: &mut [FileEntry]) {
    entries.sort_by(|left, right| {
        right
            .is_dir
            .cmp(&left.is_dir)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });
}

fn is_markdown_file(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|value| matches!(value.to_lowercase().as_str(), "md" | "markdown" | "mdown"))
        .unwrap_or(false)
}

fn is_image_file(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|value| {
            matches!(
                value.to_lowercase().as_str(),
                "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "bmp" | "avif"
            )
        })
        .unwrap_or(false)
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_string()
}

fn path_to_string<P: AsRef<Path>>(path: P) -> String {
    path.as_ref().to_string_lossy().to_string()
}

fn trim_snippet(line: &str) -> String {
    let snippet = line.trim();
    if snippet.chars().count() <= 160 {
        return snippet.to_string();
    }
    snippet.chars().take(157).collect::<String>() + "..."
}

fn default_asset_dir() -> PathBuf {
    dirs::document_dir()
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
        .join("Marko")
        .join("assets")
}

fn infer_extension(name: &str, meta: &str) -> String {
    let from_name = Path::new(name)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_lowercase());

    if let Some(extension) = from_name.filter(|value| !value.trim().is_empty()) {
        return extension;
    }

    if meta.contains("image/jpeg") {
        "jpg".to_string()
    } else if meta.contains("image/webp") {
        "webp".to_string()
    } else if meta.contains("image/gif") {
        "gif".to_string()
    } else if meta.contains("image/svg+xml") {
        "svg".to_string()
    } else {
        "png".to_string()
    }
}

fn sanitize_file_stem(name: &str) -> String {
    let stem = Path::new(name)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("image");
    let sanitized: String = stem
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '-'
            }
        })
        .collect();
    let trimmed = sanitized.trim_matches('-').trim();
    if trimmed.is_empty() {
        "image".to_string()
    } else {
        trimmed.to_string()
    }
}

fn timestamp_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis())
        .unwrap_or(0)
}

fn format_io_error(error: std::io::Error) -> String {
    error.to_string()
}
