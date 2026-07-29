# cmtrace.net shortlinks — announcement posts

## LinkedIn

You're on a machine that's misbehaving, you need CMTrace Open on it, and now you're squinting at a GitHub releases page trying to work out which of nine files you actually want.

That should be one thing you can type from memory. So now it is:

- **win.cmtrace.net** — Windows x64, portable .exe
- **winarm.cmtrace.net** — Windows on ARM
- **lite.cmtrace.net** — the Lite build
- **mac.cmtrace.net** — macOS
- **msi.cmtrace.net** — the MSI, for deployment
- **nightly.cmtrace.net** — latest nightly

Each one resolves the current release at the moment you click it and redirects straight to GitHub. No version number in the URL, so they never go stale — the same link works after every release. Short enough to read over a call, type into a locked-down box, or print in a runbook.

No cookies, no tracking pixels, no IP addresses, no user-agent logging. The redirect records which artifact was chosen and nothing about who chose it.

CMTrace Open remains free and open source: https://cmtraceopen.com/

```#Windows #Intune #SCCM #EndpointManagement #SysAdmin #OpenSource```

## X

**270 characters, fits the free 280 limit with hashtags.**

Hunting the right file on a GitHub releases page, on the machine you're troubleshooting, is its own pain.

CMTrace Open shortlinks:

win.cmtrace.net → x64
winarm.cmtrace.net → ARM
mac.cmtrace.net → macOS
msi.cmtrace.net → MSI

Always the latest build.

#Intune #SysAdmin

### Alternate (272 chars, drop the hashtags to fit)

Squinting at a GitHub releases page on a machine you're actively troubleshooting is its own special pain.

CMTrace Open now has shortlinks:

win.cmtrace.net → x64
winarm.cmtrace.net → ARM
mac.cmtrace.net → macOS
msi.cmtrace.net → MSI

Always the latest build. No tracking.

## Notes

- Also live: `lite.cmtrace.net`, `nightly.cmtrace.net`, and `cmtrace.net` itself (redirects to cmtraceopen.com).
- The privacy claim is accurate and matches `PRIVACY_STATEMENT` in `src/data/site.ts`: the redirect records only release dimensions (channel, platform, architecture, package type, filename, source) plus a count. No IP, cookie, user-agent, referrer, or query parameter is stored.
- "Never go stale" is literal: the worker resolves the latest release per request rather than baking a version into the link.
