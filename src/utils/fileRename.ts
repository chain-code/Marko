export type RenameFileNameResult =
  | { ok: true; fileName: string }
  | { ok: false; message: string };

export function normalizeRenameFileName(input: string | null | undefined, currentName: string): RenameFileNameResult {
  const fileName = (input ?? "").trim();

  if (!fileName) {
    return { ok: false, message: "文件名不能为空" };
  }

  if (fileName === "." || fileName === ".." || /[\\/]/.test(fileName)) {
    return { ok: false, message: "文件名不能包含路径分隔符" };
  }

  if (getFileExtension(fileName)) {
    return { ok: true, fileName };
  }

  const currentExtension = getFileExtension(currentName) || "md";
  return { ok: true, fileName: `${fileName}.${currentExtension}` };
}

export function normalizeFolderName(input: string | null | undefined): RenameFileNameResult {
  const folderName = (input ?? "").trim();

  if (!folderName) {
    return { ok: false, message: "文件夹名不能为空" };
  }

  if (folderName === "." || folderName === ".." || /[\\/]/.test(folderName)) {
    return { ok: false, message: "文件夹名不能包含路径分隔符" };
  }

  return { ok: true, fileName: folderName };
}

function getFileExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === fileName.length - 1) return "";
  return fileName.slice(dotIndex + 1);
}
