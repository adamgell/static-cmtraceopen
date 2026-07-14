---
title: "Known Log Sources: Stop Hunting for File Paths"
description: "CMTrace Open has 24 preset log sources built in. One click to open any of them. Here's the full catalog."
date: 2026-04-01
draft: false
type: post
keywords:
  - known log sources
  - file paths
  - intune ime
  - panther
  - cbs
  - dism
  - windows update
  - psadt
  - msi logs
  - macos intune
  - patchmypc
  - company portal
  - microsoft defender
---

If you've ever Googled "where is the Intune log file" more than once, this feature is for you. CMTrace Open ships with 24 preset log sources across Windows and macOS. Each one knows the exact file path. You click it, the log opens. No typing paths, no digging through folders.

## How to Open a Known Source

Go to File > Known Log Sources. You'll see a menu grouped by family and category.

`[Screenshot: File > Known Log Sources menu expanded showing the full hierarchy]`

Click any source and CMTrace Open opens it. If the source is a folder, all the files inside show up in the sidebar and open as tabs. If it's a single file, it opens directly.

## Windows Sources

### Windows Intune

**Intune IME (5 sources)**

| Source | Path | What It Contains |
|--------|------|-----------------|
| Intune IME Logs Folder | `C:\ProgramData\Microsoft\IntuneManagementExtension\Logs` | All IME logs as a folder. App installs, scripts, health checks. |
| IntuneManagementExtension.log | Same folder, single file | Primary IME log. App lifecycle, policy evaluation, sync events. |
| AppWorkload.log | Same folder, single file | Win32/WinGet download, staging, install details. |
| AgentExecutor.log | Same folder, single file | PowerShell script execution with exit codes. |
| HealthScripts.log | Same folder, single file | Proactive Remediation detection and remediation results. |

`[Screenshot: Known Sources > Windows Intune > Intune IME submenu]`

**MDM and Enrollment (1 source)**

| Source | Path | What It Contains |
|--------|------|-----------------|
| DMClient Local Logs | `C:\Windows\System32\config\systemprofile\AppData\Local\mdm` | MDM sync, enrollment, and policy delivery logs. |

### Windows Setup

**Panther (2 sources)**

| Source | Path | What It Contains |
|--------|------|-----------------|
| setupact.log | `C:\Windows\Panther\setupact.log` | Windows Setup and Autopilot actions. Everything that happened during OOBE, upgrade, or provisioning. |
| setuperr.log | `C:\Windows\Panther\setuperr.log` | Errors only from Windows Setup. Same events as setupact.log but filtered to just failures. |

### Windows Servicing

**CBS and DISM (2 sources)**

| Source | Path | What It Contains |
|--------|------|-----------------|
| CBS.log | `C:\Windows\Logs\CBS\CBS.log` | Component-Based Servicing. Update installs, component adds/removes, servicing stack operations. |
| DISM.log | `C:\Windows\Logs\DISM\dism.log` | DISM operations. Image servicing, driver injection, feature management. |

**Windows Update (1 source)**

| Source | Path | What It Contains |
|--------|------|-----------------|
| ReportingEvents.log | `C:\Windows\SoftwareDistribution\ReportingEvents.log` | Windows Update transaction history. Every update attempt with HRESULT and status. |

### Software Deployment

**Deployment Logs (2 sources)**

| Source | Path | What It Contains |
|--------|------|-----------------|
| Deployment Logs Folder | `C:\Windows\Logs\Software` | All deployment logs. PSADT, SCCM, and custom installer output. |
| ccmcache | `C:\Windows\ccmcache` | ConfigMgr package staging folder. |

**PSADT (1 source)**

| Source | Path | What It Contains |
|--------|------|-----------------|
| PSADT Logs | `C:\Windows\Logs\Software` | PowerShell App Deployment Toolkit logs. |

**MSI Logs (1 source)**

| Source | Path | What It Contains |
|--------|------|-----------------|
| MSI Logs | `C:\Windows\Temp\MSI*.LOG` | MSI verbose install logs. These are the logs you need when an MSI fails with exit code 1603. |

**PatchMyPC (2 sources)**

| Source | Path | What It Contains |
|--------|------|-----------------|
| PatchMyPC Logs Folder | `C:\ProgramData\PatchMyPC\Logs` | PatchMyPC client logs. |
| PatchMyPC Install Logs | `C:\ProgramData\PatchMyPCInstallLogs` | PatchMyPC MSI and Burn installer logs. |

`[Screenshot: folder opened via Known Sources, sidebar showing all files in the folder]`

## macOS Sources

CMTrace Open runs on macOS too, and the Known Log Sources menu adjusts based on your platform.

`[Screenshot: macOS Known Log Sources menu if available]`

### macOS Intune

**Intune Logs (3 sources)**

| Source | Path | What It Contains |
|--------|------|-----------------|
| Intune System Logs | `/Library/Logs/Microsoft/Intune/` | MDM daemon logs. Enrollment, policy sync, compliance. |
| Intune User Logs | `~/Library/Logs/Microsoft/Intune/` | User-context Intune agent logs. |
| Intune Script Logs | `/Library/Logs/Microsoft/Intune/Scripts/` | Shell script execution output. |

**Company Portal (1 source)**

| Source | Path | What It Contains |
|--------|------|-----------------|
| Company Portal | `~/Library/Containers/.../CompanyPortal/` | Enrollment, registration, and app install logs. |

### macOS System

**System Logs (4 sources)**

| Source | Path | What It Contains |
|--------|------|-----------------|
| install.log | `/var/log/install.log` | PKG installs from Intune and Software Update. |
| system.log | `/var/log/system.log` | System events. MDM profile installs, daemon crashes. |
| wifi.log | `/var/log/wifi.log` | Wi-Fi diagnostics. |
| appfirewall.log | `/var/log/appfirewall.log` | App firewall events. |

### macOS Defender

**Defender Logs (1 source)**

| Source | Path | What It Contains |
|--------|------|-----------------|
| Defender Logs | `/Library/Logs/Microsoft/mdatp/` | Microsoft Defender installation and error logs. |

## The Point

Every one of these paths is something you'd otherwise have to remember, Google, or dig through a docs article to find. Now it's one click.

Open the source, find the problem.

## What's Next

The last note in the Getting Started series covers [Real-Time Tailing](/field-guide/real-time-tailing/). Watch logs as they happen, filter on the fly, and catch problems the moment they occur.
