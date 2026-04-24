#!/bin/bash
# Usage: get-time.sh [offset]
# Examples:
#   get-time.sh              # current time in ISO format
#   get-time.sh "+10 minutes" # 10 minutes from now
#   get-time.sh "+2 hours"    # 2 hours from now
#   get-time.sh "+1 day"      # 1 day from now
#   get-time.sh "now"         # current time (same as no args)
#
# Returns ISO 8601 UTC timestamp suitable for NexoPRM API

date -u -d "${1:-now}" '+%Y-%m-%dT%H:%M:%SZ'
