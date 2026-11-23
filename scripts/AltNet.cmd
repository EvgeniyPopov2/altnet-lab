@echo off
powershell.exe -NoProfile -File "%~dp0Start-AltNet.ps1" %*
if errorlevel 1 pause

