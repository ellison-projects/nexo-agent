#!/bin/bash
# Usage: get-time.sh [offset] [timezone]
# Examples:
#   get-time.sh                           # current time in ISO format (UTC)
#   get-time.sh "+10 minutes"             # 10 minutes from now (UTC)
#   get-time.sh "+2 hours"                # 2 hours from now (UTC)
#   get-time.sh "+1 day"                  # 1 day from now (UTC)
#   get-time.sh "now"                     # current time (UTC)
#   get-time.sh "next Friday 1pm" "CST"   # next Friday at 1 PM CST, converted to UTC
#   get-time.sh "+10 minutes" "CST"       # 10 minutes from now in CST, converted to UTC
#
# Returns ISO 8601 UTC timestamp suitable for NexoPRM API
# If timezone is provided, the offset is interpreted in that timezone and converted to UTC

OFFSET="${1:-now}"
TIMEZONE="${2:-UTC}"

# Parse the time in the specified timezone, then convert to UTC
if [ "$TIMEZONE" = "UTC" ]; then
  # No conversion needed
  date -u -d "$OFFSET" '+%Y-%m-%dT%H:%M:%SZ'
else
  # Parse time in the specified timezone, convert to unix timestamp, then to UTC
  # This properly handles timezone conversion
  TIMESTAMP=$(TZ="$TIMEZONE" date -d "$OFFSET" '+%s')
  date -u -d "@$TIMESTAMP" '+%Y-%m-%dT%H:%M:%SZ'
fi
