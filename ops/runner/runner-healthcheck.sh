#!/bin/sh
# Healthcheck for the dysflow self-hosted GitHub Actions runner on Oracle VPS.
#
# Used by Coolify docker-compose as the runner container's healthcheck.test.
# Two checks, BOTH must pass:
#   1. The Runner.Listener process is running
#      (ps -ef | grep -v grep | grep -q '[R]unner.Listener' — the [R] trick
#      avoids the grep matching itself)
#   2. GitHub API is reachable (https://api.github.com/zen is the minimal endpoint)
#
# Exit codes follow Docker convention: 0 = healthy, 1 = unhealthy.
# If either check fails, the exit propagates through the && chain.

ps -ef | grep -v grep | grep -q '[R]unner.Listener' || exit 1
curl -sf --max-time 10 https://api.github.com/zen >/dev/null || exit 1
exit 0