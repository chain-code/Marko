#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::Engine;
use serde::Serialize;
use std::{
    ffi::OsString,
    fs::{self, OpenOptions},
    io::{self, Write},
    path::{Path, PathBuf},
    process::{self, Command},
    time::{SystemTime, UNIX_EPOCH},
};
use walkdir::WalkDir;

const MARKDOWN_EXTENSIONS: &[&str] = &[
    "md", "markdown", "mdown", "mkd", "mkdn", "mdwn", "mdtxt", "mdtext", "rmd",
];
const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"];

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
        .add_filter("Markdown", MARKDOWN_EXTENSIONS)
        .pick_file()
        .map(path_to_string))
}

#[tauri::command]
fn pick_folder() -> Result<Option<String>, String> {
    Ok(rfd::FileDialog::new().pick_folder().map(path_to_string))
}

#[tauri::command]
fn pick_image_file() -> Result<Option<String>, String> {
    Ok(rfd::FileDialog::new()
        .add_filter("Image", IMAGE_EXTENSIONS)
        .pick_file()
        .map(path_to_string))
}

#[tauri::command]
fn open_devtools(window: tauri::WebviewWindow) {
    window.open_devtools();
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(format_io_error)
}

#[tauri::command]
fn startup_markdown_files() -> Vec<String> {
    collect_startup_markdown_files(std::env::args().skip(1))
}

fn collect_startup_markdown_files<I, S>(args: I) -> Vec<String>
where
    I: IntoIterator<Item = S>,
    S: Into<PathBuf>,
{
    args.into_iter()
        .map(Into::into)
        .filter(|path: &PathBuf| path.is_file() && is_markdown_file(path))
        .map(path_to_string)
        .collect()
}

#[tauri::command]
fn write_text_file(
    path: String,
    content: String,
    expected_content: Option<String>,
) -> Result<(), String> {
    write_text_file_safely(Path::new(&path), &content, expected_content.as_deref())
        .map_err(format_io_error)
}

fn write_text_file_safely(
    path: &Path,
    content: &str,
    expected_content: Option<&str>,
) -> io::Result<()> {
    verify_expected_content(path, expected_content)?;

    let original_permissions = fs::metadata(path)
        .ok()
        .map(|metadata| metadata.permissions());
    let (temporary_path, mut temporary_file) = create_temporary_save_file(path)?;
    let write_result = (|| {
        temporary_file.write_all(content.as_bytes())?;
        temporary_file.flush()?;
        if let Some(permissions) = original_permissions {
            fs::set_permissions(&temporary_path, permissions)?;
        }
        temporary_file.sync_all()
    })();
    drop(temporary_file);

    if let Err(error) = write_result {
        let _ = fs::remove_file(&temporary_path);
        return Err(error);
    }

    if let Err(error) = verify_expected_content(path, expected_content) {
        let _ = fs::remove_file(&temporary_path);
        return Err(error);
    }

    if let Err(error) = replace_file_atomically(&temporary_path, path) {
        let _ = fs::remove_file(&temporary_path);
        return Err(error);
    }

    Ok(())
}

fn verify_expected_content(path: &Path, expected_content: Option<&str>) -> io::Result<()> {
    let Some(expected_content) = expected_content else {
        return Ok(());
    };
    let current_content = fs::read_to_string(path)?;
    if current_content == expected_content {
        return Ok(());
    }

    Err(io::Error::new(
        io::ErrorKind::Other,
        "文件已被外部修改，已取消保存。",
    ))
}

fn create_temporary_save_file(path: &Path) -> io::Result<(PathBuf, fs::File)> {
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    let file_name = path
        .file_name()
        .unwrap_or_else(|| std::ffi::OsStr::new("document"));

    for attempt in 0..100_u32 {
        let mut temporary_name = OsString::from(".");
        temporary_name.push(file_name);
        temporary_name.push(format!(
            ".marko-save-{}-{}-{attempt}.tmp",
            process::id(),
            timestamp_millis(),
        ));
        let temporary_path = parent.join(temporary_name);
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary_path)
        {
            Ok(file) => return Ok((temporary_path, file)),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error),
        }
    }

    Err(io::Error::new(
        io::ErrorKind::AlreadyExists,
        "无法创建唯一的临时保存文件。",
    ))
}

#[cfg(not(target_os = "windows"))]
fn replace_file_atomically(source: &Path, destination: &Path) -> io::Result<()> {
    fs::rename(source, destination)
}

#[cfg(target_os = "windows")]
fn replace_file_atomically(source: &Path, destination: &Path) -> io::Result<()> {
    use std::os::windows::ffi::OsStrExt;

    const MOVEFILE_REPLACE_EXISTING: u32 = 0x00000001;
    const MOVEFILE_WRITE_THROUGH: u32 = 0x00000008;

    #[link(name = "Kernel32")]
    extern "system" {
        fn MoveFileExW(
            existing_file_name: *const u16,
            new_file_name: *const u16,
            flags: u32,
        ) -> i32;
    }

    let source_wide = source
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let destination_wide = destination
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let replaced = unsafe {
        MoveFileExW(
            source_wide.as_ptr(),
            destination_wide.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if replaced == 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[tauri::command]
fn path_is_directory(path: String) -> bool {
    PathBuf::from(path).is_dir()
}

#[tauri::command]
fn create_markdown_file(folder_path: String, file_name: String) -> Result<String, String> {
    let folder = PathBuf::from(folder_path);
    if !folder.is_dir() {
        return Err("请选择有效的文件夹。".to_string());
    }

    let mut normalized_name = normalize_plain_file_name(&file_name)?;
    if Path::new(&normalized_name).extension().is_none() {
        normalized_name.push_str(".md");
    }

    let path = folder.join(normalized_name);
    if path.exists() {
        return Err("目标文件已存在。".to_string());
    }

    fs::write(&path, "").map_err(format_io_error)?;
    Ok(path_to_string(path))
}

#[tauri::command]
fn create_folder(parent_path: String, folder_name: String) -> Result<String, String> {
    let parent = PathBuf::from(parent_path);
    if !parent.is_dir() {
        return Err("请选择有效的文件夹。".to_string());
    }

    let normalized_name = normalize_plain_file_name(&folder_name)?;
    let path = parent.join(normalized_name);
    if path.exists() {
        return Err("目标文件夹已存在。".to_string());
    }

    fs::create_dir(&path).map_err(format_io_error)?;
    Ok(path_to_string(path))
}

#[tauri::command]
fn rename_markdown_file(path: String, new_name: String) -> Result<String, String> {
    let current_path = PathBuf::from(path);
    if !current_path.is_file() {
        return Err("请选择有效的文件。".to_string());
    }

    let trimmed_name = normalize_plain_file_name(&new_name)?;

    let parent = current_path
        .parent()
        .ok_or_else(|| "无法定位文件所在文件夹。".to_string())?;
    let next_path = parent.join(&trimmed_name);
    if next_path == current_path {
        return Ok(path_to_string(current_path));
    }
    if next_path.exists() {
        return Err("目标文件已存在。".to_string());
    }

    fs::rename(&current_path, &next_path).map_err(format_io_error)?;
    Ok(path_to_string(next_path))
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

    write_text_file_safely(&path, &content, None).map_err(format_io_error)?;
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
    action: Option<String>,
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
    let action = action.as_deref().unwrap_or("assets");
    let asset_dir = resolve_image_asset_dir(current.as_deref(), action);

    fs::create_dir_all(&asset_dir).map_err(format_io_error)?;

    let extension = infer_extension(&name, meta);
    let stem = sanitize_file_stem(&name);
    let file_name = format!("{}-{}.{}", stem, timestamp_millis(), extension);
    let output_path = asset_dir.join(file_name);
    fs::write(&output_path, bytes).map_err(format_io_error)?;

    if let Some(current_path) = current.as_deref() {
        return Ok(relative_image_asset_path(current_path, &output_path));
    }

    Ok(path_to_string(output_path))
}

#[tauri::command]
fn copy_image_file_asset(
    current_path: Option<String>,
    path: String,
    action: Option<String>,
) -> Result<String, String> {
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
    let action = action.as_deref().unwrap_or("assets");
    let asset_dir = resolve_image_asset_dir(current.as_deref(), action);

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

    if let Some(current_path) = current.as_deref() {
        return Ok(relative_image_asset_path(current_path, &output_path));
    }

    Ok(path_to_string(output_path))
}

#[tauri::command]
fn reveal_file_in_folder(path: String) -> Result<(), String> {
    let command = build_reveal_file_command(Path::new(&path))?;
    let status = Command::new(&command.program)
        .args(&command.args)
        .status()
        .map_err(|error| format!("打开文件管理器失败：{error}"))?;

    if status.success() {
        Ok(())
    } else {
        Err("无法在文件管理器中显示该文件。".to_string())
    }
}

#[tauri::command]
fn open_containing_folder(path: String) -> Result<(), String> {
    let command = build_open_containing_folder_command(Path::new(&path))?;
    let status = Command::new(&command.program)
        .args(&command.args)
        .status()
        .map_err(|error| format!("打开文件夹失败：{error}"))?;

    if status.success() {
        Ok(())
    } else {
        Err("无法打开文件所在文件夹。".to_string())
    }
}

#[tauri::command]
fn open_folder_path(path: String) -> Result<(), String> {
    let command = build_open_folder_command(Path::new(&path))?;
    let status = Command::new(&command.program)
        .args(&command.args)
        .status()
        .map_err(|error| format!("打开文件夹失败：{error}"))?;

    if status.success() {
        Ok(())
    } else {
        Err("无法打开该文件夹。".to_string())
    }
}

#[tauri::command]
fn trash_path(path: String) -> Result<(), String> {
    let command = build_trash_path_command(Path::new(&path))?;
    let status = Command::new(&command.program)
        .args(&command.args)
        .status()
        .map_err(|error| format!("移动到回收站失败：{error}"))?;

    if status.success() {
        Ok(())
    } else {
        Err("无法将该项目移到回收站。".to_string())
    }
}

#[tauri::command]
fn export_document_pandoc(
    markdown: String,
    current_path: Option<String>,
    format: String,
    default_file_name: Option<String>,
) -> Result<Option<String>, String> {
    let extension = match format.as_str() {
        "pdf" | "html" | "docx" | "rtf" | "epub" => format.as_str(),
        _ => return Err("不支持的导出格式。".to_string()),
    };

    let Some(output_path) = rfd::FileDialog::new()
        .add_filter(extension.to_uppercase(), &[extension])
        .set_file_name(normalize_export_file_name(default_file_name, extension))
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
            pick_image_file,
            open_devtools,
            read_text_file,
            startup_markdown_files,
            write_text_file,
            path_is_directory,
            create_markdown_file,
            create_folder,
            rename_markdown_file,
            save_markdown_as,
            list_markdown_folder,
            search_markdown_files,
            save_data_url_asset,
            copy_image_file_asset,
            reveal_file_in_folder,
            open_containing_folder,
            open_folder_path,
            trash_path,
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
        .map(|value| {
            let extension = value.to_lowercase();
            MARKDOWN_EXTENSIONS.contains(&extension.as_str())
        })
        .unwrap_or(false)
}

fn is_image_file(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|value| {
            let extension = value.to_lowercase();
            IMAGE_EXTENSIONS.contains(&extension.as_str())
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

fn resolve_image_asset_dir(current_path: Option<&Path>, action: &str) -> PathBuf {
    let Some(current_path) = current_path else {
        return default_asset_dir();
    };
    let Some(parent) = current_path.parent() else {
        return default_asset_dir();
    };

    match action {
        "current" => parent.to_path_buf(),
        "documentAssets" => {
            let stem = current_path
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or("document");
            parent.join(format!("{stem}.assets"))
        }
        _ => parent.join("assets"),
    }
}

fn relative_image_asset_path(current_path: &Path, output_path: &Path) -> String {
    let Some(parent) = current_path.parent() else {
        return path_to_string(output_path);
    };
    output_path
        .strip_prefix(parent)
        .map(path_to_string)
        .unwrap_or_else(|_| path_to_string(output_path))
        .replace('\\', "/")
}

fn normalize_plain_file_name(file_name: &str) -> Result<String, String> {
    let trimmed_name = file_name.trim();
    if trimmed_name.is_empty() {
        return Err("文件名不能为空。".to_string());
    }
    if trimmed_name == "."
        || trimmed_name == ".."
        || trimmed_name.contains('/')
        || trimmed_name.contains('\\')
    {
        return Err("文件名不能包含路径分隔符。".to_string());
    }
    Ok(trimmed_name.to_string())
}

fn normalize_export_file_name(default_file_name: Option<String>, extension: &str) -> String {
    let fallback = format!("marko-export.{extension}");
    let Some(file_name) = default_file_name else {
        return fallback;
    };

    let normalized = Path::new(file_name.trim())
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .trim();

    if normalized.is_empty() {
        return fallback;
    }

    if normalized
        .to_lowercase()
        .ends_with(&format!(".{extension}"))
    {
        normalized.to_string()
    } else {
        format!("{normalized}.{extension}")
    }
}

struct RevealFileCommand {
    program: String,
    args: Vec<String>,
}

fn build_reveal_file_command(path: &Path) -> Result<RevealFileCommand, String> {
    if !path.is_file() {
        return Err("请选择有效的文件。".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        Ok(RevealFileCommand {
            program: "explorer".to_string(),
            args: vec![format!("/select,{}", path_to_string(path))],
        })
    }

    #[cfg(target_os = "macos")]
    {
        Ok(RevealFileCommand {
            program: "open".to_string(),
            args: vec!["-R".to_string(), path_to_string(path)],
        })
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        let parent = path
            .parent()
            .ok_or_else(|| "无法定位文件所在文件夹。".to_string())?;
        Ok(RevealFileCommand {
            program: "xdg-open".to_string(),
            args: vec![path_to_string(parent)],
        })
    }
}

fn build_open_containing_folder_command(path: &Path) -> Result<RevealFileCommand, String> {
    if !path.is_file() {
        return Err("请选择有效的文件。".to_string());
    }
    let parent = path
        .parent()
        .ok_or_else(|| "无法定位文件所在文件夹。".to_string())?;

    #[cfg(target_os = "windows")]
    {
        Ok(RevealFileCommand {
            program: "explorer".to_string(),
            args: vec![path_to_string(parent)],
        })
    }

    #[cfg(target_os = "macos")]
    {
        Ok(RevealFileCommand {
            program: "open".to_string(),
            args: vec![path_to_string(parent)],
        })
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        Ok(RevealFileCommand {
            program: "xdg-open".to_string(),
            args: vec![path_to_string(parent)],
        })
    }
}

fn build_open_folder_command(path: &Path) -> Result<RevealFileCommand, String> {
    if !path.is_dir() {
        return Err("请选择有效的文件夹。".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        Ok(RevealFileCommand {
            program: "explorer".to_string(),
            args: vec![path_to_string(path)],
        })
    }

    #[cfg(target_os = "macos")]
    {
        Ok(RevealFileCommand {
            program: "open".to_string(),
            args: vec![path_to_string(path)],
        })
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        Ok(RevealFileCommand {
            program: "xdg-open".to_string(),
            args: vec![path_to_string(path)],
        })
    }
}

fn build_trash_path_command(path: &Path) -> Result<RevealFileCommand, String> {
    if !path.exists() {
        return Err("请选择有效的文件或文件夹。".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        let kind = if path.is_dir() { "dir" } else { "file" };
        Ok(RevealFileCommand {
            program: "powershell".to_string(),
            args: vec![
                "-NoProfile".to_string(),
                "-Command".to_string(),
                "param([string]$TargetPath,[string]$Kind) Add-Type -AssemblyName Microsoft.VisualBasic; if ($Kind -eq 'dir') { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($TargetPath, [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs, [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin) } else { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($TargetPath, [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs, [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin) }".to_string(),
                path_to_string(path),
                kind.to_string(),
            ],
        })
    }

    #[cfg(target_os = "macos")]
    {
        Ok(RevealFileCommand {
            program: "osascript".to_string(),
            args: vec![
                "-e".to_string(),
                "on run argv".to_string(),
                "-e".to_string(),
                "tell application \"Finder\" to delete POSIX file (item 1 of argv)".to_string(),
                "-e".to_string(),
                "end run".to_string(),
                path_to_string(path),
            ],
        })
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        Ok(RevealFileCommand {
            program: "gio".to_string(),
            args: vec!["trash".to_string(), path_to_string(path)],
        })
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_tree_keeps_empty_directories_and_filters_non_markdown_files() {
        let temp_dir =
            std::env::temp_dir().join(format!("marko-empty-folder-test-{}", timestamp_millis()));
        let empty_dir = temp_dir.join("empty");
        fs::create_dir_all(&empty_dir).unwrap();
        fs::write(temp_dir.join("ignored.txt"), "plain text").unwrap();

        let entries = list_markdown_folder(path_to_string(&temp_dir)).unwrap();

        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "empty");
        assert!(entries[0].is_dir);
        assert!(entries[0].children.is_empty());

        fs::remove_file(temp_dir.join("ignored.txt")).unwrap();
        fs::remove_dir(empty_dir).unwrap();
        fs::remove_dir(temp_dir).unwrap();
    }

    #[test]
    fn write_text_file_rejects_external_changes_without_overwriting_them() {
        let temp_dir =
            std::env::temp_dir().join(format!("marko-save-conflict-test-{}", timestamp_millis()));
        fs::create_dir_all(&temp_dir).unwrap();
        let file_path = temp_dir.join("note.md");
        fs::write(&file_path, "saved baseline").unwrap();
        fs::write(&file_path, "external revision").unwrap();

        let error = write_text_file(
            path_to_string(&file_path),
            "editor revision".to_string(),
            Some("saved baseline".to_string()),
        )
        .unwrap_err();

        assert!(error.contains("外部修改"));
        assert_eq!(fs::read_to_string(&file_path).unwrap(), "external revision");
        assert_eq!(fs::read_dir(&temp_dir).unwrap().count(), 1);

        fs::remove_file(file_path).unwrap();
        fs::remove_dir(temp_dir).unwrap();
    }

    #[test]
    fn write_text_file_replaces_matching_content_and_cleans_up_the_temporary_file() {
        let temp_dir =
            std::env::temp_dir().join(format!("marko-save-success-test-{}", timestamp_millis()));
        fs::create_dir_all(&temp_dir).unwrap();
        let file_path = temp_dir.join("note.md");
        fs::write(&file_path, "saved baseline").unwrap();

        write_text_file(
            path_to_string(&file_path),
            "editor revision".to_string(),
            Some("saved baseline".to_string()),
        )
        .unwrap();

        assert_eq!(fs::read_to_string(&file_path).unwrap(), "editor revision");
        assert_eq!(fs::read_dir(&temp_dir).unwrap().count(), 1);

        fs::remove_file(file_path).unwrap();
        fs::remove_dir(temp_dir).unwrap();
    }

    #[test]
    fn write_text_file_creates_a_new_file_without_an_expected_baseline() {
        let temp_dir =
            std::env::temp_dir().join(format!("marko-save-new-test-{}", timestamp_millis()));
        fs::create_dir_all(&temp_dir).unwrap();
        let file_path = temp_dir.join("new.md");

        write_text_file(path_to_string(&file_path), "new document".to_string(), None).unwrap();

        assert_eq!(fs::read_to_string(&file_path).unwrap(), "new document");
        assert_eq!(fs::read_dir(&temp_dir).unwrap().count(), 1);

        fs::remove_file(file_path).unwrap();
        fs::remove_dir(temp_dir).unwrap();
    }

    #[test]
    fn write_text_file_atomically_overwrites_an_existing_file_without_a_baseline() {
        let temp_dir = std::env::temp_dir().join(format!(
            "marko-save-overwrite-test-{}",
            timestamp_millis()
        ));
        fs::create_dir_all(&temp_dir).unwrap();
        let file_path = temp_dir.join("existing.md");
        fs::write(&file_path, "old content").unwrap();

        write_text_file_safely(&file_path, "new content", None).unwrap();

        assert_eq!(fs::read_to_string(&file_path).unwrap(), "new content");
        assert_eq!(fs::read_dir(&temp_dir).unwrap().count(), 1);

        fs::remove_file(file_path).unwrap();
        fs::remove_dir(temp_dir).unwrap();
    }

    #[test]
    fn markdown_file_detection_matches_typora_style_extensions() {
        for extension in MARKDOWN_EXTENSIONS {
            let file_name = format!("note.{extension}");
            assert!(is_markdown_file(Path::new(&file_name)));

            let upper = format!("NOTE.{}", extension.to_uppercase());
            assert!(is_markdown_file(Path::new(&upper)));
        }

        assert!(!is_markdown_file(Path::new("note.txt")));
        assert!(!is_markdown_file(Path::new("note.md.backup")));
    }

    #[test]
    fn startup_markdown_files_keeps_existing_markdown_arguments_only() {
        let temp_dir =
            std::env::temp_dir().join(format!("marko-startup-test-{}", timestamp_millis()));
        fs::create_dir_all(&temp_dir).unwrap();
        let markdown_path = temp_dir.join("note.md");
        let uppercase_path = temp_dir.join("UPPER.MARKDOWN");
        let text_path = temp_dir.join("note.txt");
        let missing_path = temp_dir.join("missing.md");
        fs::write(&markdown_path, "# note").unwrap();
        fs::write(&uppercase_path, "# upper").unwrap();
        fs::write(&text_path, "plain").unwrap();

        let files = collect_startup_markdown_files(vec![
            path_to_string(&markdown_path),
            path_to_string(&text_path),
            path_to_string(&missing_path),
            path_to_string(&uppercase_path),
        ]);

        assert_eq!(
            files,
            vec![
                path_to_string(&markdown_path),
                path_to_string(&uppercase_path)
            ]
        );

        fs::remove_file(markdown_path).unwrap();
        fs::remove_file(uppercase_path).unwrap();
        fs::remove_file(text_path).unwrap();
        fs::remove_dir(temp_dir).unwrap();
    }

    #[test]
    fn reveal_file_command_targets_the_current_file_location() {
        let temp_dir = std::env::temp_dir().join(format!("marko-test-{}", timestamp_millis()));
        fs::create_dir_all(&temp_dir).unwrap();
        let file_path = temp_dir.join("note.md");
        fs::write(&file_path, "# note").unwrap();

        let command = build_reveal_file_command(&file_path).unwrap();

        #[cfg(target_os = "windows")]
        {
            assert_eq!(command.program, "explorer");
            assert_eq!(
                command.args,
                vec![format!("/select,{}", path_to_string(&file_path))]
            );
        }

        #[cfg(target_os = "macos")]
        {
            assert_eq!(command.program, "open");
            assert_eq!(
                command.args,
                vec!["-R".to_string(), path_to_string(&file_path)]
            );
        }

        #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
        {
            assert_eq!(command.program, "xdg-open");
            assert_eq!(command.args, vec![path_to_string(&temp_dir)]);
        }

        fs::remove_file(file_path).unwrap();
        fs::remove_dir(temp_dir).unwrap();
    }

    #[test]
    fn reveal_file_command_rejects_missing_files() {
        let missing = std::env::temp_dir().join(format!("missing-{}.md", timestamp_millis()));
        assert!(build_reveal_file_command(&missing).is_err());
    }

    #[test]
    fn create_markdown_file_writes_an_empty_markdown_file() {
        let temp_dir =
            std::env::temp_dir().join(format!("marko-create-test-{}", timestamp_millis()));
        fs::create_dir_all(&temp_dir).unwrap();

        let next_path =
            create_markdown_file(path_to_string(&temp_dir), "daily-note".to_string()).unwrap();
        let expected_path = temp_dir.join("daily-note.md");

        assert_eq!(next_path, path_to_string(&expected_path));
        assert_eq!(fs::read_to_string(&expected_path).unwrap(), "");

        fs::remove_file(expected_path).unwrap();
        fs::remove_dir(temp_dir).unwrap();
    }

    #[test]
    fn create_markdown_file_rejects_existing_or_path_like_names() {
        let temp_dir =
            std::env::temp_dir().join(format!("marko-create-reject-test-{}", timestamp_millis()));
        fs::create_dir_all(&temp_dir).unwrap();
        let existing_path = temp_dir.join("existing.md");
        fs::write(&existing_path, "# existing").unwrap();

        assert!(
            create_markdown_file(path_to_string(&temp_dir), "existing.md".to_string()).is_err()
        );
        assert!(create_markdown_file(path_to_string(&temp_dir), "../bad.md".to_string()).is_err());

        fs::remove_file(existing_path).unwrap();
        fs::remove_dir(temp_dir).unwrap();
    }

    #[test]
    fn create_folder_makes_a_child_directory() {
        let temp_dir =
            std::env::temp_dir().join(format!("marko-create-folder-test-{}", timestamp_millis()));
        fs::create_dir_all(&temp_dir).unwrap();

        let next_path = create_folder(path_to_string(&temp_dir), "notes".to_string()).unwrap();
        let expected_path = temp_dir.join("notes");

        assert_eq!(next_path, path_to_string(&expected_path));
        assert!(expected_path.is_dir());

        fs::remove_dir(expected_path).unwrap();
        fs::remove_dir(temp_dir).unwrap();
    }

    #[test]
    fn create_folder_rejects_existing_or_path_like_names() {
        let temp_dir = std::env::temp_dir().join(format!(
            "marko-create-folder-reject-test-{}",
            timestamp_millis()
        ));
        fs::create_dir_all(&temp_dir).unwrap();
        let existing_path = temp_dir.join("existing");
        fs::create_dir(&existing_path).unwrap();

        assert!(create_folder(path_to_string(&temp_dir), "existing".to_string()).is_err());
        assert!(create_folder(path_to_string(&temp_dir), "../bad".to_string()).is_err());

        fs::remove_dir(existing_path).unwrap();
        fs::remove_dir(temp_dir).unwrap();
    }

    #[test]
    fn rename_markdown_file_updates_the_file_name() {
        let temp_dir =
            std::env::temp_dir().join(format!("marko-rename-test-{}", timestamp_millis()));
        fs::create_dir_all(&temp_dir).unwrap();
        let file_path = temp_dir.join("old.md");
        fs::write(&file_path, "# old").unwrap();

        let next_path =
            rename_markdown_file(path_to_string(&file_path), "new.md".to_string()).unwrap();
        let expected_path = temp_dir.join("new.md");

        assert_eq!(next_path, path_to_string(&expected_path));
        assert!(!file_path.exists());
        assert_eq!(fs::read_to_string(&expected_path).unwrap(), "# old");

        fs::remove_file(expected_path).unwrap();
        fs::remove_dir(temp_dir).unwrap();
    }

    #[test]
    fn rename_markdown_file_rejects_existing_or_path_like_names() {
        let temp_dir =
            std::env::temp_dir().join(format!("marko-rename-reject-test-{}", timestamp_millis()));
        fs::create_dir_all(&temp_dir).unwrap();
        let file_path = temp_dir.join("old.md");
        let existing_path = temp_dir.join("existing.md");
        fs::write(&file_path, "# old").unwrap();
        fs::write(&existing_path, "# existing").unwrap();

        assert!(
            rename_markdown_file(path_to_string(&file_path), "existing.md".to_string()).is_err()
        );
        assert!(rename_markdown_file(path_to_string(&file_path), "../bad.md".to_string()).is_err());

        fs::remove_file(file_path).unwrap();
        fs::remove_file(existing_path).unwrap();
        fs::remove_dir(temp_dir).unwrap();
    }

    #[test]
    fn open_containing_folder_command_targets_the_parent_folder() {
        let temp_dir =
            std::env::temp_dir().join(format!("marko-folder-test-{}", timestamp_millis()));
        fs::create_dir_all(&temp_dir).unwrap();
        let file_path = temp_dir.join("note.md");
        fs::write(&file_path, "# note").unwrap();

        let command = build_open_containing_folder_command(&file_path).unwrap();

        #[cfg(target_os = "windows")]
        assert_eq!(command.program, "explorer");

        #[cfg(target_os = "macos")]
        assert_eq!(command.program, "open");

        #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
        assert_eq!(command.program, "xdg-open");

        assert_eq!(command.args, vec![path_to_string(&temp_dir)]);

        fs::remove_file(file_path).unwrap();
        fs::remove_dir(temp_dir).unwrap();
    }

    #[test]
    fn open_containing_folder_command_rejects_missing_files() {
        let missing =
            std::env::temp_dir().join(format!("missing-folder-{}.md", timestamp_millis()));
        assert!(build_open_containing_folder_command(&missing).is_err());
    }

    #[test]
    fn open_folder_command_targets_the_selected_folder() {
        let temp_dir =
            std::env::temp_dir().join(format!("marko-open-folder-test-{}", timestamp_millis()));
        fs::create_dir_all(&temp_dir).unwrap();

        let command = build_open_folder_command(&temp_dir).unwrap();

        #[cfg(target_os = "windows")]
        assert_eq!(command.program, "explorer");

        #[cfg(target_os = "macos")]
        assert_eq!(command.program, "open");

        #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
        assert_eq!(command.program, "xdg-open");

        assert_eq!(command.args, vec![path_to_string(&temp_dir)]);

        fs::remove_dir(temp_dir).unwrap();
    }

    #[test]
    fn open_folder_command_rejects_missing_folders() {
        let missing =
            std::env::temp_dir().join(format!("missing-open-folder-{}", timestamp_millis()));
        assert!(build_open_folder_command(&missing).is_err());
    }

    #[test]
    fn trash_path_command_targets_an_existing_file_or_folder() {
        let temp_dir =
            std::env::temp_dir().join(format!("marko-trash-test-{}", timestamp_millis()));
        fs::create_dir_all(&temp_dir).unwrap();
        let file_path = temp_dir.join("note.md");
        fs::write(&file_path, "# note").unwrap();

        let command = build_trash_path_command(&file_path).unwrap();

        #[cfg(target_os = "windows")]
        {
            assert_eq!(command.program, "powershell");
            assert!(command
                .args
                .iter()
                .any(|item| item == &path_to_string(&file_path)));
            assert!(command.args.iter().any(|item| item == "file"));
        }

        #[cfg(target_os = "macos")]
        assert_eq!(command.program, "osascript");

        #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
        {
            assert_eq!(command.program, "gio");
            assert_eq!(
                command.args,
                vec!["trash".to_string(), path_to_string(&file_path)]
            );
        }

        let folder_command = build_trash_path_command(&temp_dir).unwrap();
        #[cfg(target_os = "windows")]
        assert!(folder_command.args.iter().any(|item| item == "dir"));

        fs::remove_file(file_path).unwrap();
        fs::remove_dir(temp_dir).unwrap();
    }

    #[test]
    fn trash_path_command_rejects_missing_paths() {
        let missing = std::env::temp_dir().join(format!("missing-trash-{}", timestamp_millis()));
        assert!(build_trash_path_command(&missing).is_err());
    }

    #[test]
    fn normalize_export_file_name_uses_document_name_and_extension() {
        assert_eq!(
            normalize_export_file_name(Some("notes.md.pdf".to_string()), "pdf"),
            "notes.md.pdf"
        );
        assert_eq!(
            normalize_export_file_name(Some("notes".to_string()), "html"),
            "notes.html"
        );
        assert_eq!(
            normalize_export_file_name(None, "epub"),
            "marko-export.epub"
        );
    }
}
