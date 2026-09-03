#!/usr/bin/env bash
#
# Verifies that every tool scripts/lab-setup.sh installs is on PATH and
# actually runs. Prints one version line per tool and exits non-zero if any
# of them is missing or fails.
#
# Must be invoked through a login + interactive shell so that the PATH block
# lab-setup.sh appends to ~/.bashrc is in effect:
#
#   bash -lic verify-toolchain.sh
#
# (Ubuntu's stock ~/.bashrc returns early when the shell is not interactive,
# which would skip that block entirely.)

set -uo pipefail

# Each entry is a command line whose success and output are the evidence
# that the tool is installed. Keep in sync with lab-setup.sh.
CHECKS=(
    "psql --version"
    "node --version"
    "npm --version"
    "codex --version"
    "claude --version"
    "deno --version"
    "duckdb --version"
    "go version"
    "sqlite3 --version"
    "tmux -V"
    "mosh --version | head -1"
    "docker --version"
    "rg --version | head -1"
    "jq --version"
    "hyperfine --version"
    "http --version"
    "bpftrace --version"
    "ps --version"
    "pstree --version"
    "pgrep --version"
    "pmap --version"
    "free --version"
    "vmstat --version"
    "findmnt --version"
    "lsblk --version"
    "lsns --version"
    "unshare --version"
    "nsenter --version"
    "taskset --version"
    "ionice --version"
    "ip -Version"
    "ss --version"
    "iostat -V"
    "lsof -v"
)

echo "========================================"
echo " Toolchain verification"
echo "========================================"

failures=()

for check in "${CHECKS[@]}"; do
    tool="${check%% *}"
    if output="$(eval "${check}" 2>&1)"; then
        printf '%-12s %s\n' "${tool}" "$(printf '%s' "${output}" | head -1)"
    else
        printf '%-12s MISSING (%s)\n' "${tool}" "$(printf '%s' "${output}" | head -1)"
        failures+=("${check}")
    fi
done

echo

if (( ${#failures[@]} > 0 )); then
    echo "FAILED: ${#failures[@]} of ${#CHECKS[@]} checks did not pass:"
    printf '  %s\n' "${failures[@]}"
    exit 1
fi

echo "OK: all ${#CHECKS[@]} checks passed."
