# Download event schema

`cmtraceopen_download_events` records one aggregate event when a person uses a verified download link, whether that link was chosen on the download site or followed through a `cmtrace.net` shortlink hostname. The event contains only the ordered, allowlisted release dimensions below.

| Analytics Engine column | Meaning |
| --- | --- |
| `index1` | `asset_id` |
| `blob1` | `asset_id` |
| `blob2` | `release_tag` |
| `blob3` | `channel` |
| `blob4` | `filename` |
| `blob5` | `platform` |
| `blob6` | `architecture` |
| `blob7` | `package_type` |
| `blob8` | `delivery_role` |
| `blob9` | `source` |
| `double1` | `count` |

Analytics Engine supplies `timestamp` automatically. Events are retained for three months, so these events are a short-lived aggregate view of verified link selections. GitHub snapshot history is the long-lived aggregate source for release-asset delivery counts.

The event deliberately has no columns for IP addresses, user-agent strings, cookies, referrers, query parameters, fingerprints, or persistent user or device identifiers.

Public stats query the 30-day aggregate through the Analytics Engine SQL API. The production API token is limited to `Account | Account Analytics | Read`. The Worker secrets are `CLOUDFLARE_ACCOUNT_ID` and `ANALYTICS_READ_TOKEN`; neither value is exposed to browser code.
