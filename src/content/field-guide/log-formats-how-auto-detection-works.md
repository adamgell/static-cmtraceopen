---
title: "Log Formats: How Auto-Detection Works"
description: "CMTrace Open reads 15+ log formats out of the box. Here's what it detects, how detection works, and what to expect from each format."
date: 2026-03-31
draft: false
type: post
keywords:
  - log formats
  - auto-detection
  - ccm
  - cbs
  - dism
  - panther
  - msi verbose
  - psadt
  - wix burn
  - dhcp
  - windows registry
  - parser
  - sccm logs
  - intune logs
---

One of the first things people ask is "what log files can this open?" The short answer: if Windows wrote it, CMTrace Open can probably read it. And not just read it. It parses the structure, extracts the fields, and gives you columns that match the format.

You never have to tell it what kind of log you're opening. It figures it out.

## How Detection Works

When you open a file, CMTrace Open reads the first 20 or so lines and tests them against its detection patterns in priority order. The most structured formats get checked first (CCM, CBS, DISM) and the least structured ones (plain text) are the fallback.

The whole thing takes milliseconds. By the time the log renders on screen, the format is already detected, the columns are set, and severity levels are assigned.

The status bar at the bottom shows what format was detected and the parse quality level: Structured (full field extraction), SemiStructured (partial fields), or Unstructured (plain text, line by line).

## Format Reference

Here's every format CMTrace Open handles, what it is, where you'll find it, and what columns you get.

### CCM (ConfigMgr/SCCM/Intune IME)

The most common format in enterprise Windows management. Used by the ConfigMgr client, the Intune Management Extension, and related components.

**Example file:** `IntuneManagementExtension.log`

**Example line:**
```
<![LOG[Successfully installed application]LOG]!><time="14:30:45.123+000" date="01-15-2024" component="Install" context="" type="1" thread="2048" file="installer.cpp">
```

**Columns:** Date/Time, Log Text, Component, Thread, Source File, Severity

`[Screenshot: CCM format log loaded showing all columns]`

### Simple (Legacy SCCM)

An older SCCM format that uses the `$$<` delimiter. You'll run into these with legacy ConfigMgr setups.

**Columns:** Date/Time, Log Text, Component, Thread

### CBS (Component-Based Servicing)

Windows uses CBS for servicing operations. When updates install, components get added or removed, or the servicing stack does its thing, it all goes here.

**Example file:** `C:\Windows\Logs\CBS\CBS.log`

**Example line:**
```
2024-01-15 08:00:00, Info                  CBS    Exec: Processing package KB5034123
```

**Columns:** Date/Time, Log Text, Severity

### DISM (Deployment Image Servicing)

Same structure as CBS but written by DISM operations. Image servicing, driver injection, feature installation.

**Example file:** `C:\Windows\Logs\DISM\dism.log`

**Columns:** Date/Time, Log Text, Severity

### Panther (Windows Setup and Autopilot)

This is where Windows Setup and Autopilot write what they're doing. If you're troubleshooting Autopilot enrollment, ESP hangs, or upgrade failures, this is the first log to check.

**Example file:** `C:\Windows\Panther\setupact.log`

**Example line:**
```
2024-01-15 08:00:00, Info [0x080489] MIG    Gather started for user profile
```

**Columns:** Date/Time, Log Text, Result Code, GLE Code, Setup Phase, Operation Name, Severity

CMTrace Open extracts extra fields from Panther logs that you don't get anywhere else. Result codes, GLE (GetLastError) values, setup phases, and operation names are pulled out of the message text and put into their own columns.

### MSI (Windows Installer Verbose)

MSI verbose logs are messy. They have about 12 different line patterns: engine messages, action start/end, property dumps, PID:TID pairs, and return values. CMTrace Open handles all of them.

**Example file:** `C:\Windows\Temp\MSI*.LOG`

**Example line:**
```
MSI (c) (8C:98) [07:42:28:452]: Starting installation of product {GUID}
```

**Columns:** Date/Time, Log Text, Severity

The parser also embeds MSI exit code descriptions (1000 through 3002) so when you see `Return value 3`, you know what it means without looking it up.

`[Screenshot: MSI verbose log loaded]`

### PSADT (PowerShell App Deployment Toolkit)

PSADT v4 logs use a bracketed format with section, function, and severity. If your org uses PSADT for app packaging (and many do), these logs are how you find out what went wrong.

**Example line:**
```
[2024-12-24 14:44:13.658][] [Install][] [Start-ADTMsiProcess][] [Error] :: Failed to install
```

**Columns:** Date/Time, Log Text, Section, Function, Severity

The parser also knows PSADT exit codes (60001 through 70001): general failure, missing file, requires admin, user deferred, user declined, and more.

### Burn (WiX Bootstrapper)

WiX Burn bootstrapper logs show up when installing things like Visual C++ Redistributables, .NET runtimes, and other chained installers.

**Example line:**
```
[07A4:0CBC][2025-11-25T01:55:42]e000: Error 0x80070005: Access denied
```

**Columns:** Date/Time, Log Text, PID, TID, Severity

### ReportingEvents (Windows Update History)

This is the tab-delimited transaction history for Windows Update. Every update attempt, success, and failure ends up here.

**Example file:** `C:\Windows\SoftwareDistribution\ReportingEvents.log`

**Columns:** Date/Time, Log Text, GUID, Status, HRESULT

### DHCP (DHCP Server Logs)

Dedicated parser for `DhcpSrvLog-*.log` and `DhcpV6SrvLog-*.log` files. Detected by the header signature at the top of the file.

**Columns:** Date/Time, Log Text, IP Address, Host Name, MAC Address

### Timestamped (Generic)

A catch-all for logs that have recognizable timestamps but don't match any of the structured formats above. Handles ISO-8601, US date, EU date, and syslog-style timestamps.

**Columns:** Date/Time, Log Text

### Plain Text

The fallback. No structure detected. Each line is a row. Severity is assigned by keyword detection (lines containing "error", "fail", "warning", etc.).

**Columns:** Log Text, Severity

### Windows Registry Exports (.reg)

Not technically a log format, but admins export registry keys all the time for troubleshooting. CMTrace Open detects `.reg` files by the `Windows Registry Editor Version 5.00` header and opens them in a dedicated two-pane viewer.

The viewer handles REG_SZ, REG_DWORD, REG_QWORD, REG_BINARY, REG_EXPAND_SZ, REG_MULTI_SZ, REG_NONE, and delete markers. Hex continuations and UTF-16LE values are decoded automatically. It handles files over 20 MB without issues.

### macOS Intune MDM Daemon

For macOS admins. Parses the pipe-delimited logs at `/Library/Logs/Microsoft/Intune/IntuneMDMDaemon*.log`. Extracts process, severity, thread, and sub-component.

## Encoding

CMTrace Open handles UTF-8, UTF-16 LE, UTF-16 BE (with BOM detection), and falls back to Windows-1252. If Windows wrote the file, it'll read it correctly.

## What's Next

Now that you know what kinds of logs CMTrace Open can handle, the next field note covers [Known Log Sources](/field-guide/known-log-sources/), which means you don't have to remember where any of these files live on disk.
