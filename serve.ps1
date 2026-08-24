# out/ 폴더를 로컬 웹서버로 띄우고 기본 브라우저로 자동 연다.
# Windows 기본 PowerShell만으로 동작하며 별도 설치가 필요 없다.

$ErrorActionPreference = "Stop"

$root = Join-Path $PSScriptRoot "out"
if (-not (Test-Path $root)) {
    Write-Host "out 폴더를 찾을 수 없습니다: $root"
    Write-Host "먼저 이 폴더와 out 폴더가 같은 위치에 있는지 확인하세요."
    pause
    exit 1
}

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".js"   = "text/javascript; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".ico"  = "image/x-icon"
    ".svg"  = "image/svg+xml"
    ".png"  = "image/png"
    ".woff" = "font/woff"
    ".woff2" = "font/woff2"
    ".txt"  = "text/plain; charset=utf-8"
}

function Get-FreePort {
    $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, 0)
    $listener.Start()
    $port = $listener.LocalEndpoint.Port
    $listener.Stop()
    return $port
}

$port = 5173
$listener = New-Object System.Net.HttpListener
try {
    $listener.Prefixes.Add("http://localhost:$port/")
    $listener.Start()
} catch {
    $port = Get-FreePort
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add("http://localhost:$port/")
    $listener.Start()
}

$url = "http://localhost:$port/"
Write-Host "채권세상 로컬 서버 시작: $url"
Write-Host "이 창을 닫으면 서버가 종료됩니다. 종료하려면 Ctrl+C를 누르세요."

Start-Process $url

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $localPath = $request.Url.LocalPath
        if ($localPath -eq "/") { $localPath = "/index.html" }
        $filePath = Join-Path $root ($localPath.TrimStart("/") -replace "/", "\")

        if (Test-Path $filePath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($filePath)
            $contentType = $mimeTypes[$ext]
            if (-not $contentType) { $contentType = "application/octet-stream" }
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $response.ContentType = $contentType
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $notFoundPath = Join-Path $root "404.html"
            $response.StatusCode = 404
            if (Test-Path $notFoundPath -PathType Leaf) {
                $bytes = [System.IO.File]::ReadAllBytes($notFoundPath)
                $response.ContentType = "text/html; charset=utf-8"
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            }
        }
        $response.OutputStream.Close()
    }
} finally {
    $listener.Stop()
    $listener.Close()
}
