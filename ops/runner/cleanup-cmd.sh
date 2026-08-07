#!/bin/sh
# Cron-driven log/dir cleanup for the dysflow self-hosted runner.
#
# Mounted into the cleanup sidecar at /tmp/cleanup-cmd.sh and used as the
# container's entrypoint. Writes the crontab and execs crond in foreground
# so Docker sees it as the main process (PID 1).
#
# Cron jobs (run every 30 minutes):
#   - Delete _diag/*.log files older than 60 minutes
#   - Delete _work/<job>/_temp directories older than 60 minutes
#   - Delete empty _work/<job> directories older than 24 hours
#   - Print du -sh of the runner data dirs for monitoring

printf '*/30 * * * * find /home/runner/_diag -type f -mmin +60 -delete 2>/dev/null && find /home/runner/_work -maxdepth 4 -type d -name _temp -mmin +60 -exec rm -rf {} + 2>/dev/null && find /home/runner/_work -maxdepth 4 -type d -mmin +1440 -empty -delete 2>/dev/null && du -sh /home/runner/_work /home/runner/_diag 2>/dev/null\n' > /etc/crontabs/root
crond -f -L /dev/null