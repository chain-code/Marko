# 用本机的 Typora 打开一个文件，截一张窗口图（阶段 0，test/visual/README.md）。
# Typora 不认 --user-data-dir，发布版也关了调试，接不上 CDP；所以用系统的 PrintWindow 截窗口。
# APPDATA 指向临时目录，不碰本机 Typora 的配置和最近文件；不发任何按键（免得按键落到别的窗口），截完直接结束进程。
# 用法：powershell -NoProfile -File typora-window.ps1 -Exe <Typora.exe> -File <文件.md> -Out <输出.png>
param(
  [Parameter(Mandatory = $true)][string]$Exe,
  [Parameter(Mandatory = $true)][string]$File,
  [Parameter(Mandatory = $true)][string]$Out,
  [int]$Width = 1360,
  [int]$Height = 1000,
  [int]$SettleMs = 3500
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class MarkoWin {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
}
"@

$appdata = Join-Path ([System.IO.Path]::GetTempPath()) ("marko-typora-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
New-Item -ItemType Directory -Path $appdata | Out-Null
$startInfo = New-Object System.Diagnostics.ProcessStartInfo
$startInfo.FileName = $Exe
$startInfo.Arguments = '"' + $File + '"'
$startInfo.UseShellExecute = $false
$startInfo.EnvironmentVariables["APPDATA"] = $appdata
$process = [System.Diagnostics.Process]::Start($startInfo)

function Stop-Launched {
  # 只结束这次启动的 Typora 和它的子进程
  $ids = @($process.Id)
  $children = Get-CimInstance Win32_Process -Filter "Name = 'Typora.exe'" | Where-Object { $ids -contains $_.ParentProcessId }
  foreach ($child in $children) { Stop-Process -Id $child.ProcessId -Force -ErrorAction SilentlyContinue }
  Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
}

try {
  $fileName = [System.IO.Path]::GetFileName($File)
  $window = $null
  for ($i = 0; $i -lt 80 -and -not $window; $i++) {
    Start-Sleep -Milliseconds 500
    $window = Get-Process -Name Typora -ErrorAction SilentlyContinue |
      Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -like "*$fileName*" } |
      Select-Object -First 1
  }
  if (-not $window) { Write-Output "NO_WINDOW $fileName"; exit 2 }
  $handle = $window.MainWindowHandle
  [MarkoWin]::ShowWindow($handle, 9) | Out-Null
  # SWP_NOZORDER | SWP_NOACTIVATE：不抢前台
  [MarkoWin]::SetWindowPos($handle, [IntPtr]::Zero, 20, 20, $Width, $Height, 0x0014) | Out-Null
  Start-Sleep -Milliseconds $SettleMs

  $rect = New-Object MarkoWin+RECT
  [MarkoWin]::GetWindowRect($handle, [ref]$rect) | Out-Null
  $bitmap = New-Object System.Drawing.Bitmap ($rect.Right - $rect.Left), ($rect.Bottom - $rect.Top)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $hdc = $graphics.GetHdc()
  [MarkoWin]::PrintWindow($handle, $hdc, 2) | Out-Null
  $graphics.ReleaseHdc($hdc)
  $graphics.Dispose()
  $bitmap.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()
  Write-Output "OK $Out"
} finally {
  Stop-Launched
  Start-Sleep -Milliseconds 500
  Remove-Item -Recurse -Force $appdata -ErrorAction SilentlyContinue
}
