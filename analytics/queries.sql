-- Aggregate verified link selections by allowlisted project source over 30 days.
SELECT blob9 AS source, SUM(_sample_interval * double1) AS selections
FROM cmtraceopen_download_events
WHERE timestamp >= NOW() - INTERVAL '30' DAY
GROUP BY source
ORDER BY selections DESC;

-- Aggregate verified link selections by release-delivery dimensions over 30 days.
SELECT blob3 AS channel, blob5 AS platform, blob7 AS package_type, blob8 AS delivery_role,
       SUM(_sample_interval * double1) AS selections
FROM cmtraceopen_download_events
WHERE timestamp >= NOW() - INTERVAL '30' DAY
GROUP BY channel, platform, package_type, delivery_role
ORDER BY selections DESC;

-- Public 30-day selection totals served by the scoped Analytics Engine reader.
SELECT
  blob3 AS channel,
  blob5 AS platform,
  blob9 AS source,
  SUM(_sample_interval * double1) AS selections
FROM cmtraceopen_download_events
WHERE timestamp >= NOW() - INTERVAL '30' DAY
  AND blob9 != 'unknown'
GROUP BY channel, platform, source
ORDER BY selections DESC
FORMAT JSON;
