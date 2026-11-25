[CmdletBinding()]
param([switch]$NoBrowser, [string]$StandaloneBrowser)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$url = 'http://127.0.0.1:17860/'

function Test-Client {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2
        return $response.StatusCode -eq 200 -and $response.Content.Contains('name="altnet-session"')
    } catch { return $false }
}

$clientRunning = Test-Client
if ($clientRunning -and $StandaloneBrowser) {
    throw 'AltNet is already running; the new browser path cannot be applied to the existing process.'
}
if (-not $clientRunning) {
    $state = Join-Path $root 'state'
    New-Item -Path $state -ItemType Directory -Force | Out-Null
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    & icacls.exe $state '/inheritance:r' '/grant:r' ("*" + $sid + ":(OI)(CI)F") '*S-1-5-18:(OI)(CI)F' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not restrict local state to the current user.' }
    $temp = Join-Path $state 'temp'
    New-Item -Path $temp -ItemType Directory -Force | Out-Null
    $env:TEMP = $temp
    $env:TMP = $temp
    $python = (Get-Command python.exe -ErrorAction Stop).Source
    $gpgv = (Get-Command gpgv.exe -ErrorAction SilentlyContinue).Source
    if (-not $gpgv) { $gpgv = Join-Path $env:ProgramFiles 'Git/usr/bin/gpgv.exe' }
    if (-not (Test-Path -LiteralPath $gpgv)) { throw 'Install gpgv or Git for Windows.' }
    $pt = 'runtime/tor/pluggable_transports/lyrebird.exe'
    $params = @('-B', '-X', 'utf8', 'scripts/bridge_client.py', '--state', 'state', '--dist', 'ui',
                '--tor', 'runtime/tor/tor.exe', '--transport', $pt, '--snowflake', $pt, '--seed', 'seed',
                '--gpgv', $gpgv, '--keyring', 'trusted.gpg')
    if ($StandaloneBrowser) {
        if (-not [IO.Path]::IsPathRooted($StandaloneBrowser) -or -not (Test-Path -LiteralPath $StandaloneBrowser -PathType Leaf)) {
            throw 'StandaloneBrowser must be an absolute path to an existing executable.'
        }
        $params += @('--standalone-browser', $StandaloneBrowser)
    }
    $settingsFile = Join-Path $root 'network.json'
    if (Test-Path -LiteralPath $settingsFile) {
        $settings = Get-Content -LiteralPath $settingsFile -Raw | ConvertFrom-Json
        foreach ($peer in $settings.peers) { $params += @('--peer', [string]$peer) }
        if ($settings.shareOn) { $params += @('--mirror-host', [string]$settings.shareOn) }
        if ($settings.localDiscovery -eq $false) { $params += '--no-lan' }
        if ($settings.parallelProbes) { $params += @('--parallel-probes', [string]$settings.parallelProbes) }
    }
    foreach ($arg in $params) {
        if ($arg.Contains('"') -or $arg.Contains([char]0)) { throw 'Invalid launcher argument.' }
    }
    $quoted = $params | ForEach-Object { '"' + $_ + '"' }
    Start-Process -FilePath $python -ArgumentList $quoted -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardError (Join-Path $state 'client.stderr') -RedirectStandardOutput (Join-Path $state 'client.stdout')
    $deadline = (Get-Date).AddSeconds(30)
    while (-not (Test-Client)) {
        if ((Get-Date) -gt $deadline) { throw "AltNet did not start. See $state/client.stderr" }
        Start-Sleep -Milliseconds 300
    }
}
if (-not $NoBrowser) { Start-Process $url }

