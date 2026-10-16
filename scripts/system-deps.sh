#!/usr/bin/env bash
# Make sure everything Reelscape needs from the system is installed, and
# install whatever is missing with rvn. A no-op when all is there.
#
#   scripts/system-deps.sh           install what is missing
#   scripts/system-deps.sh --check   only report; exit 1 if anything is missing
set -euo pipefail

check_only=false
[[ ${1:-} == --check ]] && check_only=true

# package | command that proves it is there
requirements=(
    "bun|bun"
    "ffmpeg|ffprobe"
    "curl|curl"
)

missing=()
for requirement in "${requirements[@]}"; do
    command -v "${requirement#*|}" >/dev/null 2>&1 || missing+=("${requirement%%|*}")
done

if ((${#missing[@]} == 0)); then
    exit 0
fi

echo "Reelscape needs: ${missing[*]}"
if $check_only; then
    exit 1
fi

if ! command -v rvn >/dev/null 2>&1; then
    echo "rvn is not available; install these packages with your package manager." >&2
    exit 1
fi

if ((EUID == 0)); then
    rvn install --repo-only --yes "${missing[@]}"
else
    sudo rvn install --repo-only --yes "${missing[@]}"
fi

still=()
for requirement in "${requirements[@]}"; do
    command -v "${requirement#*|}" >/dev/null 2>&1 || still+=("${requirement%%|*}")
done
if ((${#still[@]} > 0)); then
    echo "Still missing after install: ${still[*]}" >&2
    exit 1
fi
echo "System dependencies installed."
