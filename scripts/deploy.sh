#!/usr/bin/env bash
# Reelscape — bare-metal install with zero-downtime rolling updates.
#
# Two systemd template instances (reelscape@a, reelscape@b) bind the same
# TCP port via SO_REUSEPORT. `update` starts the idle one, waits for it to
# respond on /healthz with its INSTANCE_ID, then stops the previous one — its
# SIGTERM handler drains in-flight requests before exiting, so users see no
# interruption.
#
# Run through imlazy (see lazy.toml), which escalates the steps that need root:
#   imlazy install     One-time setup: ffmpeg, user, data dir, systemd unit, start instance a
#   imlazy update      Pull latest code, install deps (incl. ffmpeg), swap to the idle instance
#   imlazy rollback    Revert to the SHA recorded by the last `update`
#   imlazy uninstall   Stop both instances and remove the unit
#   imlazy status      Show which instance(s) are active
#   imlazy logs        Tail journalctl for both instances
#   imlazy restart     Restart the currently active instance (NOT zero-downtime)
#
# Configuration comes from the environment (lazy.toml passes its variables):
# RS_USER, RS_DIR, RS_DATA, RS_PORT, BUN.
set -euo pipefail

RS_USER=${RS_USER:-reelscape}
RS_DIR=${RS_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}
RS_DATA=${RS_DATA:-/var/lib/reelscape}
RS_PORT=${RS_PORT:-3000}

UNIT_NAME=reelscape@.service
UNIT_SRC=$RS_DIR/scripts/reelscape@.service.in
UNIT_DEST=/etc/systemd/system/$UNIT_NAME
HEALTH_URL=http://127.0.0.1:$RS_PORT/healthz
PREV_SHA=$RS_DATA/.previous-sha
RESOLVED_BUN=$RS_DATA/.resolved-bun

# Find bun even when sudo strips PATH (Debian-style secure_path). Looks in
# common system locations and per-user .bun installs (root or any /home user).
find_bun() {
    if [ -n "${BUN:-}" ]; then
        echo "$BUN"
        return
    fi
    local candidate
    if candidate=$(command -v bun 2>/dev/null); then
        echo "$candidate"
        return
    fi
    for candidate in /usr/local/bin/bun /usr/bin/bun /opt/bun/bin/bun /root/.bun/bin/bun \
        ${SUDO_USER:+/home/$SUDO_USER/.bun/bin/bun} /home/*/.bun/bin/bun; do
        if [ -x "$candidate" ]; then
            echo "$candidate"
            return
        fi
    done
}
BUN=$(find_bun)

# ── Sanity checks ────────────────────────────────────────────────────────────
need_root() {
    if [ "$(id -u)" -ne 0 ]; then
        echo "✗ this needs root — run it through imlazy, which escalates with sudo"
        exit 1
    fi
}

need_bun() {
    if [ -z "$BUN" ]; then
        echo "✗ bun not found on PATH. Install it (imlazy setup), or pass bun=/path/to/bun"
        exit 1
    fi
}

# ffmpeg/ffprobe are only used at playback time (transcoding MKV, AVI, etc.),
# so without them the service starts and serves MP4s fine but every other
# format fails. Install them with whichever package manager the host has.
need_ffmpeg() {
    if command -v ffmpeg >/dev/null 2>&1 && command -v ffprobe >/dev/null 2>&1; then
        echo "→ ffmpeg found at $(command -v ffmpeg)"
        return
    fi
    echo "→ ffmpeg not found — installing"
    if command -v rvn >/dev/null 2>&1; then rvn install --repo-only --yes ffmpeg
    elif command -v apt-get >/dev/null 2>&1; then apt-get update && apt-get install -y --no-install-recommends ffmpeg
    elif command -v dnf >/dev/null 2>&1; then dnf install -y ffmpeg || dnf install -y ffmpeg-free
    elif command -v pacman >/dev/null 2>&1; then pacman -S --needed --noconfirm ffmpeg
    elif command -v apk >/dev/null 2>&1; then apk add ffmpeg
    else
        echo "✗ no supported package manager found — install ffmpeg manually"
        exit 1
    fi
    if ! command -v ffmpeg >/dev/null 2>&1 || ! command -v ffprobe >/dev/null 2>&1; then
        echo "✗ ffmpeg install failed — install ffmpeg manually and re-run"
        exit 1
    fi
    echo "✓ ffmpeg installed at $(command -v ffmpeg)"
}

as_user() {
    sudo -u "$RS_USER" -H sh -c "cd '$RS_DIR' && $1"
}

# ── Install ──────────────────────────────────────────────────────────────────
# Order matters: create user first, then sanity-check that the user can
# actually reach the repo and bun, THEN emit the unit (which bakes paths in)
# and install deps. Bailing early gives a clear error before we leave half-
# finished state on disk.
cmd_install() {
    need_root
    need_bun
    need_ffmpeg
    echo "→ ensuring user $RS_USER exists"
    id -u "$RS_USER" >/dev/null 2>&1 || useradd --system --home-dir "$RS_DATA" --shell /usr/sbin/nologin "$RS_USER"
    echo "→ preparing data dir $RS_DATA"
    install -d -o "$RS_USER" -g "$RS_USER" -m 0750 "$RS_DATA"
    preflight
    BUN=$(cat "$RESOLVED_BUN")
    emit_unit
    echo "→ installing dependencies as $RS_USER"
    as_user "$BUN install --frozen-lockfile"
    echo "→ reloading systemd"
    systemctl daemon-reload
    echo "→ enabling reelscape@a.service"
    systemctl enable reelscape@a.service
    systemctl start reelscape@a.service
    wait_healthz a
    echo "✓ reelscape@a is up on port $RS_PORT"
}

# Verify reelscape can reach both the repo and the bun binary. If bun lives
# under a home dir (mode 0700, not traversable by system users), copy it to
# /usr/local/bin so the systemd unit can exec it. Resolved path is written
# to $RS_DATA/.resolved-bun for the install recipe to pick up.
preflight() {
    echo "→ verifying $RS_USER can reach $RS_DIR"
    if ! sudo -u "$RS_USER" test -r "$RS_DIR/package.json" 2>/dev/null; then
        echo ""
        echo "✗ user '$RS_USER' cannot read $RS_DIR/package.json"
        echo ""
        echo "  This usually means the repo lives under a home dir like /root"
        echo "  or /home/<user> — those are mode 0700 and system users can't"
        echo "  traverse them. The chmod-leaf fix doesn't work; the parent dirs"
        echo "  also have to be traversable."
        echo ""
        echo "  Move the repo to /opt and reinstall:"
        echo "    sudo mv $RS_DIR /opt/reelscape"
        echo "    cd /opt/reelscape"
        echo "    imlazy install"
        echo ""
        exit 1
    fi
    chmod o+rx "$RS_DIR"
    echo "→ giving $RS_USER ownership of $RS_DIR (needed to write node_modules and pull updates)"
    chown -R "$RS_USER:$RS_USER" "$RS_DIR"
    echo "→ marking $RS_DIR safe for root git operations"
    git config --global --get-all safe.directory | grep -qx "$RS_DIR" || git config --global --add safe.directory "$RS_DIR"
    echo "→ verifying $RS_USER can execute $BUN"
    local resolved=$BUN
    if ! sudo -u "$RS_USER" test -x "$BUN" 2>/dev/null; then
        echo "  bun at $BUN isn't accessible to $RS_USER — copying to /usr/local/bin/bun"
        install -m 0755 "$BUN" /usr/local/bin/bun
        resolved=/usr/local/bin/bun
    fi
    echo "$resolved" >"$RESOLVED_BUN"
    chown "$RS_USER:$RS_USER" "$RESOLVED_BUN"
    chmod 0640 "$RESOLVED_BUN"
    echo "→ resolved bun: $resolved"
}

# Render the systemd unit from the template, substituting paths.
emit_unit() {
    echo "→ writing $UNIT_DEST"
    sed \
        -e "s|__USER__|$RS_USER|g" \
        -e "s|__DIR__|$RS_DIR|g" \
        -e "s|__DATA__|$RS_DATA|g" \
        -e "s|__PORT__|$RS_PORT|g" \
        -e "s|__BUN__|$BUN|g" \
        "$UNIT_SRC" >"$UNIT_DEST"
    chmod 0644 "$UNIT_DEST"
}

# ── Zero-downtime rollout ────────────────────────────────────────────────────
# Picks the inactive instance, starts it, waits for /healthz to report its
# INSTANCE_ID (proving it's listening), then stops the previously active one.
cmd_update() {
    need_root
    need_bun
    need_ffmpeg
    record_sha
    echo "→ git pull"
    as_user "git pull --ff-only"
    echo "→ bun install"
    as_user "$BUN install --frozen-lockfile"
    swap
}

# Capture the SHA we're about to leave so `rollback` knows where to return.
record_sha() {
    local cur
    cur=$(as_user "git rev-parse HEAD")
    echo "→ recording previous SHA $cur → $PREV_SHA"
    echo "$cur" >"$PREV_SHA"
    chown "$RS_USER:$RS_USER" "$PREV_SHA"
    chmod 0640 "$PREV_SHA"
}

# ── Rollback ─────────────────────────────────────────────────────────────────
# Resets the working tree to the SHA recorded by the last `update`, reinstalls
# deps, and rolling-swaps to the previous code. The SHA file is rewritten to
# point at what we just rolled back FROM, so a second `rollback` un-does it.
#
# Note: after a rollback the local branch is *behind* origin. Don't run
# `imlazy update` until you've reverted/fixed the bad commit on origin — a
# fast-forward pull would just reapply it.
cmd_rollback() {
    need_root
    need_bun
    if [ ! -s "$PREV_SHA" ]; then
        echo "✗ no recorded previous SHA at $PREV_SHA"
        echo "  rollback only works after at least one 'imlazy update'"
        exit 1
    fi
    local target current
    target=$(cat "$PREV_SHA")
    current=$(as_user "git rev-parse HEAD")
    if [ "$target" = "$current" ]; then
        echo "✗ recorded SHA $target is already checked out — nothing to roll back to"
        exit 1
    fi
    echo "→ rolling back: $current → $target"
    if ! as_user "git cat-file -e $target^{commit}" 2>/dev/null; then
        echo "✗ commit $target not present locally — was the branch reset?"
        exit 1
    fi
    as_user "git reset --hard $target"
    echo "→ bun install"
    as_user "$BUN install --frozen-lockfile"
    echo "$current" >"$PREV_SHA"
    chown "$RS_USER:$RS_USER" "$PREV_SHA"
    chmod 0640 "$PREV_SHA"
    echo "→ swapping instances"
    swap
    echo "✓ rolled back to $target  (next 'imlazy rollback' would restore $current)"
}

swap() {
    local active idle
    if systemctl is-active --quiet reelscape@a.service; then active=a idle=b
    elif systemctl is-active --quiet reelscape@b.service; then active=b idle=a
    else
        echo "✗ no active instance — run 'imlazy install' first"
        exit 1
    fi
    echo "→ active=$active  starting $idle"
    systemctl start "reelscape@$idle.service"
    wait_healthz "$idle"
    echo "→ stopping previous instance $active (draining…)"
    systemctl stop "reelscape@$active.service"
    echo "✓ rollout complete — active instance is now $idle"
}

# Poll /healthz until the named instance ID appears in the response. With
# SO_REUSEPORT the kernel may route polls to either instance, so we keep
# polling — seeing the target's ID even once confirms it's listening.
wait_healthz() {
    local instance=$1 body
    echo "→ waiting for instance $instance to respond on $HEALTH_URL"
    for _ in $(seq 1 120); do
        body=$(curl -fsS --max-time 1 "$HEALTH_URL" 2>/dev/null || true)
        case "$body" in
            *"\"instance\":\"$instance\""*)
                echo "  ✓ instance $instance responded (pid in body)"
                return 0
                ;;
        esac
        sleep 0.25
    done
    echo "✗ instance $instance failed to respond within 30s"
    echo "  journalctl -u reelscape@$instance.service -n 50 --no-pager"
    journalctl -u "reelscape@$instance.service" -n 50 --no-pager || true
    systemctl stop "reelscape@$instance.service" || true
    exit 1
}

# ── Uninstall / utilities ────────────────────────────────────────────────────
cmd_uninstall() {
    need_root
    echo "→ stopping instances"
    systemctl stop reelscape@a.service reelscape@b.service 2>/dev/null || true
    systemctl disable reelscape@a.service reelscape@b.service 2>/dev/null || true
    echo "→ removing $UNIT_DEST"
    rm -f "$UNIT_DEST" || true
    systemctl daemon-reload
    echo "✓ uninstalled (data dir $RS_DATA left in place)"
}

cmd_status() {
    local i state cur prev
    for i in a b; do
        state=$(systemctl is-active "reelscape@$i.service" 2>/dev/null) || state=${state:-inactive}
        printf "  reelscape@%s : %s\n" "$i" "$state"
    done
    echo ""
    printf "  port %s healthz: " "$RS_PORT"
    curl -fsS --max-time 1 "$HEALTH_URL" 2>/dev/null || echo "(no response)"
    echo ""
    cur=$(cd "$RS_DIR" && git rev-parse --short HEAD 2>/dev/null || echo "?")
    printf "  current HEAD     : %s\n" "$cur"
    if [ -s "$PREV_SHA" ]; then
        prev=$(cut -c1-7 "$PREV_SHA")
        printf "  rollback target  : %s\n" "$prev"
    else
        printf "  rollback target  : (none recorded yet)\n"
    fi
}

cmd_logs() {
    exec journalctl -u 'reelscape@*.service' -f --no-pager
}

# Non-zero-downtime restart of whichever instance is active (brief drop).
# Use `imlazy update` for true rolling restart.
cmd_restart() {
    need_root
    if systemctl is-active --quiet reelscape@a.service; then
        systemctl restart reelscape@a.service
    elif systemctl is-active --quiet reelscape@b.service; then
        systemctl restart reelscape@b.service
    else
        echo "✗ no active instance"
        exit 1
    fi
}

case ${1:-} in
    install | update | rollback | uninstall | status | logs | restart) "cmd_$1" ;;
    *)
        echo "usage: $0 {install|update|rollback|uninstall|status|logs|restart}" >&2
        exit 2
        ;;
esac
