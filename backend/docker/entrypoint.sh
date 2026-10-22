#!/bin/sh
set -e

case "$1" in
  api)
    if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
      python docker/bootstrap.py
    fi
    exec uvicorn app.main:app \
      --host 0.0.0.0 \
      --port "${PORT:-8001}" \
      --workers "${WEB_CONCURRENCY:-2}" \
      --timeout-keep-alive 75 \
      --no-server-header
    ;;
  scheduler)
    echo "[scheduler] running scheduled tasks every ${SCHEDULER_INTERVAL:-60}s"
    while true; do
      python scheduler.py || echo "[scheduler] run finished with errors"
      sleep "${SCHEDULER_INTERVAL:-60}"
    done
    ;;
  *)
    exec "$@"
    ;;
esac
