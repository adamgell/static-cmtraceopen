---
title: "Real-Time Tailing: Watch Logs as They Happen"
description: "CMTrace Open can tail log files in real time. Here's how to use it for live troubleshooting."
date: 2026-04-02
draft: false
type: post
keywords:
  - real-time tailing
  - live logs
  - log monitoring
  - troubleshooting
  - intune sync
  - autopilot enrollment
  - log rotation
  - filtering
  - windows update
---

Sometimes you need to watch the log while you reproduce the problem. Maybe you're triggering an Intune sync on a device and want to see what happens in real time. Maybe a deployment is running and you want to catch the failure the moment it happens. That's what tailing is for.

CMTrace Open watches the file on disk and shows new entries as they're written. No manual refresh. No re-opening the file. Just open it and watch.

## How It Works

Open any log file the normal way. `Ctrl+O`, Known Log Sources, drag and drop. It doesn't matter how you get there.

Once the file is loaded, CMTrace Open starts watching it automatically. When something writes a new line to the file, it shows up at the bottom of the log view.

The status bar at the bottom shows when new entries arrive. You'll see the entry count go up as lines come in.

## Try It

Here's a simple way to see it in action:

1. Open `IntuneManagementExtension.log` via Known Sources > Windows Intune > Intune IME
2. On the device, go to Settings > Accounts > Access work or school > Info > Sync
3. Switch back to CMTrace Open
4. Watch new entries appear at the bottom

`[Screenshot: new entries appearing in real time at the bottom of the log]`

Every new sync event, policy check, and app evaluation shows up as it happens. You don't have to do anything. Just watch.

## Pause and Resume

Sometimes entries come in faster than you can read them. Press `Ctrl+U` to pause. The status bar shows "Paused" and entries stop scrolling.

While paused, the file is still being watched. New entries get buffered. When you press `Ctrl+U` again to resume, all the buffered entries appear at once.

This is useful when you spot something interesting and need time to read it without the log scrolling away from you.

## Filtering While Tailing

This is where it gets powerful. Open the filter dialog with `Ctrl+L` and set a filter. For example: Severity = Error.

Now only error entries show up as they arrive. Everything else is hidden in real time. You're watching a live feed of only the things that went wrong.

You can combine this with the find bar too. `Ctrl+F` to search, and the search works on the current entries while new ones keep coming in below.

## Log Rotation

Some log files rotate when they hit a size limit. The Intune Management Extension does this. When `IntuneManagementExtension.log` gets too big, it renames to `.log.1` and starts a new file.

CMTrace Open detects this automatically. Tailing continues on the new file. You don't have to re-open anything.

## When to Use Tailing

Tailing is most useful when you can control when the event happens. Some common scenarios:

**Intune app deployment:** Assign an app, trigger a sync, and watch the IME log for the download and install sequence. You'll see it go through detection, content download, and install in real time.

**Autopilot enrollment:** During testing, watch `setupact.log` while a device goes through OOBE. You can see each phase as it happens and catch the exact moment something goes wrong.

**Script execution:** Push a Proactive Remediation or Platform Script, then watch `AgentExecutor.log` for the script output and exit code.

**Windows Update:** Start an update scan or install, then watch `CBS.log` or `ReportingEvents.log` for the outcome.

In every case, the pattern is the same: open the log, trigger the event, watch what happens. Filters let you cut through the noise and see only what matters.

## Quick Reference

| Action | How |
|--------|-----|
| Start tailing | Open any log file. It starts automatically. |
| Pause | `Ctrl+U` |
| Resume | `Ctrl+U` again |
| Filter during tail | `Ctrl+L`, set filter, apply |
| Search during tail | `Ctrl+F`, type search term |
| Refresh | `F5` |

## What's Next

That wraps up the Getting Started series. You now know how to open files, read different formats, use Known Log Sources, and tail logs in real time.

The next series covers real-world troubleshooting scenarios. We'll use everything from this series to solve actual problems: Win32 app failures, Hybrid Join issues, Windows Update errors, Autopilot ESP hangs, and more.
