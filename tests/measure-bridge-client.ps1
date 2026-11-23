[CmdletBinding()]
param([ValidateRange(10,1800)][int]$Seconds=90, [ValidateRange(1,65535)][int]$Port=17860)

$ErrorActionPreference = 'Stop'
$url = "http://127.0.0.1:$Port"
$html = (Invoke-WebRequest -UseBasicParsing $url -TimeoutSec 5).Content
$key = [regex]::Match($html, 'name="altnet-session" content="([^"]+)"').Groups[1].Value
if (-not $key) { throw 'Expected a running local AltNet client' }
$headers = @{'X-AltNet-Session'=$key}
$owner = (Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort $Port -State Listen).OwningProcess
$cores = (Get-CimInstance Win32_ComputerSystem).NumberOfLogicalProcessors
$watch = [Diagnostics.Stopwatch]::StartNew()
$prevCpu = @{}
$summary = @{}
$lastGroup = ''
$lastTime = 0.0
do {
    $status = Invoke-RestMethod "$url/api/bridges/status" -Headers $headers -TimeoutSec 10
    $group = if ($status.probes -gt 0) { "search-$($status.probes)" } elseif ($status.connected) { 'connected' } else { 'waiting' }
    $rows = Get-CimInstance Win32_Process -Filter "Name='tor.exe' OR Name='lyrebird.exe' OR Name='gpgv.exe' OR Name='transport.exe'"
    $ids = @([int]$owner)
    foreach ($depth in 1..2) {
        $ids += @($rows | Where-Object { $ids -contains [int]$_.ParentProcessId -and $ids -notcontains [int]$_.ProcessId } | ForEach-Object { [int]$_.ProcessId })
    }
    $cpu = @{}
    $diff = 0.0
    $privateBytes = 0
    foreach ($process in Get-Process -Id $ids -ErrorAction SilentlyContinue) {
        $idKey = "$($process.Id)-$($process.StartTime.Ticks)"
        $cpu[$idKey] = [double]$process.CPU
        if ($prevCpu.ContainsKey($idKey)) { $diff += [Math]::Max(0.0, $cpu[$idKey] - $prevCpu[$idKey]) }
        elseif ($lastGroup) { $diff += $cpu[$idKey] }
        $privateBytes += $process.PrivateMemorySize64
    }
    $now = $watch.Elapsed.TotalSeconds
    if ($lastGroup -eq $group) {
        if (-not $summary.ContainsKey($group)) { $summary[$group] = @{seconds=0.0; cpu=0.0; peak=0L} }
        $r = $summary[$group]
        $r.seconds += $now - $lastTime
        $r.cpu += $diff
        $r.peak = [Math]::Max([long]$r.peak,[long]$privateBytes)
    }
    $prevCpu = $cpu
    $lastGroup = $group
    $lastTime = $now
    Start-Sleep -Milliseconds 900
} while ($watch.Elapsed.TotalSeconds -lt $Seconds)
foreach ($group in ($summary.Keys | Sort-Object)) {
    $r = $summary[$group]
    [pscustomobject]@{mode=$group; seconds=[Math]::Round($r.seconds,1); logicalCPUs=$cores;
        cpuSeconds=[Math]::Round($r.cpu,2); percentOneLogicalCPU=[Math]::Round(100*$r.cpu/$r.seconds,2);
        percentMachine=[Math]::Round(100*$r.cpu/$r.seconds/$cores,3);
        peakPrivateMiB=[Math]::Round($r.peak/1MB,1)}
}

