#!/usr/bin/env bash
#
# Runs ON the live server, after the code is uploaded (rsync, git pull or CI).
# Safe to run by hand too:
#     cd ~/chatdesk/backend && bash deploy/remote.sh
#
# Env knobs (all optional):
#   VENV_PATH     explicit virtualenv root, if auto-detection picks wrong
#   MIGRATIONS    apply (default) | dry-run | skip
#   SEED_ARGS     seeders to run after migrating, e.g. "rbac settings" (demo seeders are refused)
#   SERVICE_NAME  systemd unit to restart, if this box uses systemd
#   HEALTH_URL    URL to curl after the reload, e.g. https://api.example.com/health
#   FORCE_PIP     1 to reinstall requirements even when unchanged

set -euo pipefail

APP_ROOT="${REMOTE_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$APP_ROOT"

MIGRATIONS="${MIGRATIONS:-apply}"
SERVICE_NAME="${SERVICE_NAME:-}"
HEALTH_URL="${HEALTH_URL:-}"
FORCE_PIP="${FORCE_PIP:-0}"
STAMP_DIR="$APP_ROOT/.deploy"

log()  { printf '\n==> %s\n' "$*"; }
warn() { printf '\n!!  %s\n' "$*" >&2; }

# ------------------------------------------------------------------ virtualenv
activate_venv() {
  local cand rel

  if [ -n "${VENV_PATH:-}" ] && [ -f "$VENV_PATH/bin/activate" ]; then
    . "$VENV_PATH/bin/activate"; return
  fi

  for cand in "$APP_ROOT/venv/bin/activate" "$APP_ROOT/.venv/bin/activate"; do
    [ -f "$cand" ] && { . "$cand"; return; }
  done

  # cPanel / CloudLinux "Setup Python App" keeps the venv outside the app root:
  #   ~/virtualenv/<app-root-relative-to-home>/<python-version>/bin/activate
  rel="${APP_ROOT#"$HOME"/}"
  for cand in "$HOME/virtualenv/$rel"/*/bin/activate; do
    [ -f "$cand" ] && { . "$cand"; return; }
  done

  warn "No virtualenv found for $APP_ROOT. Set VENV_PATH."
  exit 1
}

activate_venv
log "Python $(python -V 2>&1 | cut -d' ' -f2) - $(command -v python)"

# ---------------------------------------------------------------- dependencies
mkdir -p "$STAMP_DIR"
REQ_STAMP="$STAMP_DIR/requirements.sha256"
REQ_HASH="$(sha256sum requirements.txt | cut -d' ' -f1)"

if [ "$FORCE_PIP" = "1" ] || [ ! -f "$REQ_STAMP" ] || [ "$(cat "$REQ_STAMP")" != "$REQ_HASH" ]; then
  log "requirements.txt changed - installing"
  # Deliberately no 'pip install --upgrade pip': an unpinned pip upgrade during
  # an unattended deploy is a good way to break the environment at 2am.
  python -m pip install -r requirements.txt
  echo "$REQ_HASH" > "$REQ_STAMP"
else
  log "requirements.txt unchanged - skipping pip install"
fi

# ------------------------------------------------------------------ migrations
case "$MIGRATIONS" in
  apply)
    log "Applying migrations (python migrate.py)"
    python migrate.py
    ;;
  dry-run)
    log "Migration preview only (python migrate.py --dry-run)"
    python migrate.py --dry-run
    ;;
  skip)
    log "Migrations skipped"
    ;;
  *)
    warn "Unknown MIGRATIONS value '$MIGRATIONS' - expected apply|dry-run|skip"
    exit 1
    ;;
esac

# --------------------------------------------------------------------- seeders
# Opt-in only. rbac and settings are additive and safe to re-run. `users` and
# `content` create demo logins with known passwords and demo posts, so they are
# refused here - run those by hand, deliberately, if you ever need them.
if [ -n "${SEED_ARGS:-}" ]; then
  for arg in $SEED_ARGS; do
    case "$arg" in
      all|users|content)
        warn "SEED_ARGS contains '$arg', which adds demo users / demo content to the live site. Refusing."
        exit 1
        ;;
    esac
  done
  log "Running seeders: python seed.py $SEED_ARGS"
  python seed.py $SEED_ARGS
else
  log "No SEED_ARGS set - skipping seeders"
fi

# --------------------------------------------------------------------- restart
restarted=0

if [ -n "$SERVICE_NAME" ]; then
  # An explicit unit name is authoritative. If it does not come back up, the old
  # process keeps serving stale code while the deploy reports success - so this
  # is a hard failure, not a warning.
  if sudo -n systemctl restart "$SERVICE_NAME" 2> /tmp/svcerr; then
    log "systemd: restarted $SERVICE_NAME"
  elif systemctl --user restart "$SERVICE_NAME" 2>> /tmp/svcerr; then
    log "systemd (user): restarted $SERVICE_NAME"
  else
    warn "Could not restart '$SERVICE_NAME' - the server is STILL RUNNING THE OLD CODE."
    sed 's/^/    /' /tmp/svcerr >&2 || true
    warn "If that is a sudo password prompt, add a NOPASSWD sudoers rule for:"
    warn "    systemctl restart $SERVICE_NAME"
    exit 1
  fi

  sleep 2
  state="$(systemctl is-active "$SERVICE_NAME" 2>/dev/null || true)"
  if [ "$state" != "active" ]; then
    warn "$SERVICE_NAME is '$state' after restart, expected 'active'."
    sudo -n systemctl status "$SERVICE_NAME" --no-pager -l 2>/dev/null | sed 's/^/    /' >&2 || true
    exit 1
  fi
  log "$SERVICE_NAME is active"
  restarted=1

elif [ -f "$APP_ROOT/passenger_wsgi.py" ]; then
  # Passenger (cPanel "Setup Python App") reloads when this file's mtime changes.
  mkdir -p "$APP_ROOT/tmp"
  touch "$APP_ROOT/tmp/restart.txt"
  log "Passenger: touched tmp/restart.txt"
  restarted=1
fi

# CloudLinux selector, only if nothing above applied.
if [ "$restarted" = "0" ] && command -v cloudlinux-selector >/dev/null 2>&1; then
  rel="${APP_ROOT#"$HOME"/}"
  if cloudlinux-selector restart --json --interpreter python \
       --user "$(whoami)" --app-root "$rel" >/dev/null 2>&1; then
    log "CloudLinux selector: restarted $rel"
    restarted=1
  fi
fi

[ "$restarted" = "1" ] || warn "Nothing was restarted - the old process may still be serving."

# ---------------------------------------------------------------- health check
if [ -n "$HEALTH_URL" ]; then
  log "Health check: $HEALTH_URL"
  for attempt in 1 2 3 4 5; do
    if curl -fsS --max-time 20 "$HEALTH_URL" >/dev/null; then
      log "Healthy after ${attempt} attempt(s)"
      exit 0
    fi
    sleep 3
  done
  warn "Health check failed after 5 attempts"
  exit 1
fi

log "Deploy complete"
