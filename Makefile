# Reelscape — bare-metal install with zero-downtime rolling updates.
#
# Two systemd template instances (reelscape@a, reelscape@b) bind the same
# TCP port via SO_REUSEPORT. `make update` starts the idle one, waits for
# it to respond on /healthz with its INSTANCE_ID, then stops the previous
# one — its SIGTERM handler drains in-flight requests before exiting, so
# users see no interruption.
#
# Common targets:
#   sudo make install      One-time setup: user, data dir, systemd unit, start instance a
#   sudo make update       Pull latest code, install deps, swap to the idle instance
#   sudo make uninstall    Stop both instances and remove the unit
#   make status            Show which instance(s) are active
#   make logs              Tail journalctl for both instances
#   make restart           Restart the currently active instance (NOT zero-downtime)

# ── Configuration (override via `make VAR=value`) ────────────────────────────
RS_USER  ?= reelscape
RS_DIR   ?= $(CURDIR)
RS_DATA  ?= /var/lib/reelscape
RS_PORT  ?= 3000
BUN      ?= $(shell command -v bun 2>/dev/null)

UNIT_NAME  := reelscape@.service
UNIT_SRC   := scripts/reelscape@.service.in
UNIT_DEST  := /etc/systemd/system/$(UNIT_NAME)
HEALTH_URL := http://127.0.0.1:$(RS_PORT)/healthz
PREV_SHA   := $(RS_DATA)/.previous-sha

# ── Sanity checks ────────────────────────────────────────────────────────────
define need_root
	@if [ "$$(id -u)" -ne 0 ]; then \
		echo "✗ this target needs root — re-run with sudo"; exit 1; \
	fi
endef

define need_bun
	@if [ -z "$(BUN)" ]; then \
		echo "✗ bun not found on PATH. Install it: https://bun.sh"; exit 1; \
	fi
endef

.PHONY: help install update rollback uninstall status logs restart deps build _emit_unit _swap _record_sha

help:
	@echo "Reelscape make targets:"
	@echo "  sudo make install     install systemd unit and start instance a"
	@echo "  sudo make update      pull + zero-downtime rollout"
	@echo "  sudo make rollback    revert to the SHA recorded by the last 'update'"
	@echo "  sudo make uninstall   stop and remove the systemd unit"
	@echo "  make status           show instance state and last-deployed SHA"
	@echo "  make logs             tail journal for both instances"
	@echo "  make restart          restart active instance (downtime ~1s)"
	@echo ""
	@echo "Config (override with VAR=val):"
	@echo "  RS_USER=$(RS_USER)  RS_DIR=$(RS_DIR)  RS_DATA=$(RS_DATA)  RS_PORT=$(RS_PORT)"
	@echo "  BUN=$(BUN)"

# ── Install ──────────────────────────────────────────────────────────────────
install: _emit_unit
	$(call need_root)
	$(call need_bun)
	@echo "→ ensuring user $(RS_USER) exists"
	@id -u $(RS_USER) >/dev/null 2>&1 || useradd --system --home-dir $(RS_DATA) --shell /usr/sbin/nologin $(RS_USER)
	@echo "→ preparing data dir $(RS_DATA)"
	@install -d -o $(RS_USER) -g $(RS_USER) -m 0750 $(RS_DATA)
	@echo "→ giving $(RS_USER) read access to $(RS_DIR)"
	@chown -R $(RS_USER):$(RS_USER) $(RS_DIR)/node_modules 2>/dev/null || true
	@chmod o+rx $(RS_DIR)
	@echo "→ installing dependencies as $(RS_USER)"
	@sudo -u $(RS_USER) -H sh -c 'cd $(RS_DIR) && $(BUN) install --frozen-lockfile'
	@echo "→ reloading systemd"
	@systemctl daemon-reload
	@echo "→ enabling reelscape@a.service"
	@systemctl enable reelscape@a.service
	@systemctl start reelscape@a.service
	@$(MAKE) --no-print-directory _wait_healthz INSTANCE=a
	@echo "✓ reelscape@a is up on port $(RS_PORT)"

# Render the systemd unit from the template, substituting paths.
_emit_unit:
	$(call need_root)
	@echo "→ writing $(UNIT_DEST)"
	@sed \
		-e 's|__USER__|$(RS_USER)|g' \
		-e 's|__DIR__|$(RS_DIR)|g' \
		-e 's|__DATA__|$(RS_DATA)|g' \
		-e 's|__PORT__|$(RS_PORT)|g' \
		-e 's|__BUN__|$(BUN)|g' \
		$(UNIT_SRC) > $(UNIT_DEST)
	@chmod 0644 $(UNIT_DEST)

# ── Zero-downtime rollout ────────────────────────────────────────────────────
# Picks the inactive instance, starts it, waits for /healthz to report its
# INSTANCE_ID (proving it's listening), then stops the previously active one.
update:
	$(call need_root)
	$(call need_bun)
	@$(MAKE) --no-print-directory _record_sha
	@echo "→ git pull"
	@sudo -u $(RS_USER) -H sh -c 'cd $(RS_DIR) && git pull --ff-only'
	@echo "→ bun install"
	@sudo -u $(RS_USER) -H sh -c 'cd $(RS_DIR) && $(BUN) install --frozen-lockfile'
	@$(MAKE) --no-print-directory _swap

# Capture the SHA we're about to leave so `rollback` knows where to return.
_record_sha:
	@cur=$$(sudo -u $(RS_USER) -H sh -c 'cd $(RS_DIR) && git rev-parse HEAD'); \
	echo "→ recording previous SHA $$cur → $(PREV_SHA)"; \
	echo "$$cur" > $(PREV_SHA); \
	chown $(RS_USER):$(RS_USER) $(PREV_SHA); \
	chmod 0640 $(PREV_SHA)

# ── Rollback ─────────────────────────────────────────────────────────────────
# Resets the working tree to the SHA recorded by the last `update`, reinstalls
# deps, and rolling-swaps to the previous code. The SHA file is rewritten to
# point at what we just rolled back FROM, so a second `rollback` un-does it.
#
# Note: after a rollback the local branch is *behind* origin. Don't run
# `make update` until you've reverted/fixed the bad commit on origin — a
# fast-forward pull would just reapply it.
rollback:
	$(call need_root)
	$(call need_bun)
	@if [ ! -s $(PREV_SHA) ]; then \
		echo "✗ no recorded previous SHA at $(PREV_SHA)"; \
		echo "  rollback only works after at least one 'make update'"; exit 1; \
	fi
	@target=$$(cat $(PREV_SHA)); \
	current=$$(sudo -u $(RS_USER) -H sh -c 'cd $(RS_DIR) && git rev-parse HEAD'); \
	if [ "$$target" = "$$current" ]; then \
		echo "✗ recorded SHA $$target is already checked out — nothing to roll back to"; exit 1; \
	fi; \
	echo "→ rolling back: $$current → $$target"; \
	if ! sudo -u $(RS_USER) -H sh -c "cd $(RS_DIR) && git cat-file -e $$target^{commit}" 2>/dev/null; then \
		echo "✗ commit $$target not present locally — was the branch reset?"; exit 1; \
	fi; \
	sudo -u $(RS_USER) -H sh -c "cd $(RS_DIR) && git reset --hard $$target"; \
	echo "→ bun install"; \
	sudo -u $(RS_USER) -H sh -c 'cd $(RS_DIR) && $(BUN) install --frozen-lockfile'; \
	echo "$$current" > $(PREV_SHA); \
	chown $(RS_USER):$(RS_USER) $(PREV_SHA); \
	chmod 0640 $(PREV_SHA); \
	echo "→ swapping instances"; \
	$(MAKE) --no-print-directory _swap; \
	echo "✓ rolled back to $$target  (next 'make rollback' would restore $$current)"

_swap:
	@set -e; \
	if systemctl is-active --quiet reelscape@a.service; then ACTIVE=a; IDLE=b; \
	elif systemctl is-active --quiet reelscape@b.service; then ACTIVE=b; IDLE=a; \
	else echo "✗ no active instance — run 'sudo make install' first"; exit 1; \
	fi; \
	echo "→ active=$$ACTIVE  starting $$IDLE"; \
	systemctl start reelscape@$$IDLE.service; \
	$(MAKE) --no-print-directory _wait_healthz INSTANCE=$$IDLE; \
	echo "→ stopping previous instance $$ACTIVE (draining…)"; \
	systemctl stop reelscape@$$ACTIVE.service; \
	echo "✓ rollout complete — active instance is now $$IDLE"

# Poll /healthz until the named instance ID appears in the response. With
# SO_REUSEPORT the kernel may route polls to either instance, so we keep
# polling — seeing the target's ID even once confirms it's listening.
_wait_healthz:
	@set -e; \
	echo "→ waiting for instance $(INSTANCE) to respond on $(HEALTH_URL)"; \
	for i in $$(seq 1 120); do \
		body=$$(curl -fsS --max-time 1 $(HEALTH_URL) 2>/dev/null || true); \
		case "$$body" in \
			*'"instance":"$(INSTANCE)"'*) \
				echo "  ✓ instance $(INSTANCE) responded (pid in body)"; \
				exit 0 ;; \
		esac; \
		sleep 0.25; \
	done; \
	echo "✗ instance $(INSTANCE) failed to respond within 30s"; \
	echo "  journalctl -u reelscape@$(INSTANCE).service -n 50 --no-pager"; \
	journalctl -u reelscape@$(INSTANCE).service -n 50 --no-pager || true; \
	systemctl stop reelscape@$(INSTANCE).service || true; \
	exit 1

# ── Uninstall / utilities ────────────────────────────────────────────────────
uninstall:
	$(call need_root)
	@echo "→ stopping instances"
	-@systemctl stop reelscape@a.service reelscape@b.service 2>/dev/null
	-@systemctl disable reelscape@a.service reelscape@b.service 2>/dev/null
	@echo "→ removing $(UNIT_DEST)"
	-@rm -f $(UNIT_DEST)
	@systemctl daemon-reload
	@echo "✓ uninstalled (data dir $(RS_DATA) left in place)"

status:
	@for i in a b; do \
		state=$$(systemctl is-active reelscape@$$i.service 2>/dev/null || echo inactive); \
		printf "  reelscape@%s : %s\n" "$$i" "$$state"; \
	done
	@echo ""
	@printf "  port $(RS_PORT) healthz: "
	@curl -fsS --max-time 1 $(HEALTH_URL) 2>/dev/null || echo "(no response)"
	@echo ""
	@cur=$$(cd $(RS_DIR) && git rev-parse --short HEAD 2>/dev/null || echo "?"); \
	printf "  current HEAD     : %s\n" "$$cur"
	@if [ -s $(PREV_SHA) ]; then \
		prev=$$(cut -c1-7 $(PREV_SHA)); \
		printf "  rollback target  : %s\n" "$$prev"; \
	else \
		printf "  rollback target  : (none recorded yet)\n"; \
	fi

logs:
	@journalctl -u 'reelscape@*.service' -f --no-pager

# Non-zero-downtime restart of whichever instance is active (brief drop).
# Use `make update` for true rolling restart.
restart:
	$(call need_root)
	@if systemctl is-active --quiet reelscape@a.service; then \
		systemctl restart reelscape@a.service; \
	elif systemctl is-active --quiet reelscape@b.service; then \
		systemctl restart reelscape@b.service; \
	else echo "✗ no active instance"; exit 1; fi
