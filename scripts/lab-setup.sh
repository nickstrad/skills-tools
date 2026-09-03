#!/usr/bin/env bash

set -euo pipefail

# ============================================================
# Ubuntu development droplet bootstrap
#
# Turns a fresh Ubuntu (22.04/24.04) DigitalOcean droplet into a
# compact systems/database development environment: persistent
# remote-terminal stack, database engines, language runtimes, coding
# agents, container tooling, and Linux observability utilities.
#
# Environment overrides (all optional):
#   PG_VERSION    PostgreSQL major to install from PGDG, e.g. 16.
#                 Unset (default) installs the "postgresql" meta-package,
#                 i.e. the current stable major in PGDG.
#   NODE_VERSION  Node.js major installed through NVM (default 22).
#   NVM_VERSION   NVM release tag (default v0.40.6).
# ============================================================

PG_VERSION="${PG_VERSION:-}"
NODE_VERSION="${NODE_VERSION:-22}"
NVM_VERSION="${NVM_VERSION:-v0.40.6}"

echo "========================================"
echo " Ubuntu development environment setup"
echo "========================================"

if [[ "${EUID}" -eq 0 ]]; then
    SUDO=""
else
    SUDO="sudo"
fi

export DEBIAN_FRONTEND=noninteractive

echo
echo "==> Updating apt..."
$SUDO apt-get update

echo
echo "==> Installing base and systems tools..."
$SUDO apt-get install -y \
    ca-certificates \
    curl \
    wget \
    gnupg \
    git \
    tmux \
    mosh \
    sqlite3 \
    build-essential \
    bubblewrap \
    jq \
    ripgrep \
    fzf \
    tree \
    htop \
    strace \
    lsof \
    less \
    unzip \
    zip \
    dnsutils \
    iproute2 \
    bpftrace \
    tcpdump \
    socat \
    netcat-openbsd \
    hyperfine \
    fd-find \
    bat \
    httpie \
    sysstat \
    linux-tools-common

# perf is a thin wrapper in linux-tools-common; the real binary ships in a
# kernel-specific package that may not exist for every droplet kernel.
echo
echo "==> Installing perf for kernel $(uname -r) (best effort)..."
$SUDO apt-get install -y "linux-tools-$(uname -r)" \
    || $SUDO apt-get install -y linux-tools-generic \
    || echo "perf binary not available for this kernel; skipping."

# shellcheck disable=SC1091
. /etc/os-release
ARCH="$(dpkg --print-architecture)"

# ------------------------------------------------------------
# Docker - official Docker Apt repository
# ------------------------------------------------------------

echo
echo "==> Installing Docker..."

$SUDO install -m 0755 -d /etc/apt/keyrings

curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | $SUDO tee /etc/apt/keyrings/docker.asc >/dev/null

$SUDO chmod a+r /etc/apt/keyrings/docker.asc

$SUDO tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${VERSION_CODENAME}
Components: stable
Architectures: ${ARCH}
Signed-By: /etc/apt/keyrings/docker.asc
EOF

$SUDO apt-get update

$SUDO apt-get install -y \
    docker-ce \
    docker-ce-cli \
    containerd.io \
    docker-buildx-plugin \
    docker-compose-plugin

$SUDO systemctl enable --now docker

# ------------------------------------------------------------
# PostgreSQL - official PGDG Apt repository
# ------------------------------------------------------------

echo
echo "==> Configuring PostgreSQL official Apt repository..."

$SUDO apt-get install -y postgresql-common
$SUDO install -d /usr/share/postgresql-common/pgdg

$SUDO curl \
    --fail \
    --silent \
    --show-error \
    -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
    https://www.postgresql.org/media/keys/ACCC4CF8.asc

$SUDO tee /etc/apt/sources.list.d/pgdg.sources >/dev/null <<EOF
Types: deb
URIs: https://apt.postgresql.org/pub/repos/apt
Suites: ${VERSION_CODENAME}-pgdg
Architectures: ${ARCH}
Components: main
Signed-By: /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
EOF

$SUDO apt-get update

echo
if [[ -n "${PG_VERSION}" ]]; then
    echo "==> Installing PostgreSQL ${PG_VERSION}..."
    $SUDO apt-get install -y \
        "postgresql-${PG_VERSION}" \
        "postgresql-contrib-${PG_VERSION}" \
        libpq-dev
else
    echo "==> Installing PostgreSQL (current stable major in PGDG)..."
    $SUDO apt-get install -y \
        postgresql \
        postgresql-contrib \
        libpq-dev
fi

$SUDO systemctl enable postgresql
$SUDO systemctl start postgresql

# ------------------------------------------------------------
# NVM + Node.js
# ------------------------------------------------------------

echo
echo "==> Installing NVM ${NVM_VERSION}..."

export NVM_DIR="${HOME}/.nvm"

if [[ ! -s "${NVM_DIR}/nvm.sh" ]]; then
    curl -fsSL \
        "https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_VERSION}/install.sh" \
        | bash
else
    echo "NVM already installed."
fi

# nvm.sh is not clean under `set -u`; relax it while nvm runs.
set +u
# shellcheck disable=SC1091
source "${NVM_DIR}/nvm.sh"

echo
echo "==> Installing Node.js ${NODE_VERSION}..."
nvm install "${NODE_VERSION}"
nvm alias default "${NODE_VERSION}"
nvm use "${NODE_VERSION}"
set -u
npm install -g npm@latest

# ------------------------------------------------------------
# OpenAI Codex
# ------------------------------------------------------------

echo
echo "==> Installing/updating Codex..."
npm install -g @openai/codex@latest

# ------------------------------------------------------------
# Claude Code - native installer
# ------------------------------------------------------------

echo
echo "==> Installing/updating Claude Code..."
curl -fsSL https://claude.ai/install.sh | bash

# ------------------------------------------------------------
# Deno
# ------------------------------------------------------------

echo
echo "==> Installing/updating Deno..."

export DENO_INSTALL="${HOME}/.deno"

if [[ -x "${DENO_INSTALL}/bin/deno" ]]; then
    "${DENO_INSTALL}/bin/deno" upgrade
else
    curl -fsSL https://deno.land/install.sh | sh -s -- --no-modify-path
fi

# ------------------------------------------------------------
# DuckDB
# ------------------------------------------------------------

echo
echo "==> Installing/updating DuckDB..."
curl -fsSL https://install.duckdb.org | bash

# ------------------------------------------------------------
# Go - discover current stable release from go.dev
# ------------------------------------------------------------

echo
echo "==> Installing latest stable Go..."

GO_VERSION="$(
    curl -fsSL 'https://go.dev/dl/?mode=json' |
    jq -r '.[0].version'
)"

case "$(uname -m)" in
    x86_64)
        GO_ARCH="amd64"
        ;;
    aarch64|arm64)
        GO_ARCH="arm64"
        ;;
    *)
        echo "Unsupported Go architecture: $(uname -m)"
        exit 1
        ;;
esac

GO_TARBALL="${GO_VERSION}.linux-${GO_ARCH}.tar.gz"

echo "Installing ${GO_VERSION} (${GO_ARCH})"

curl -fsSL \
    "https://go.dev/dl/${GO_TARBALL}" \
    -o "/tmp/${GO_TARBALL}"

$SUDO rm -rf /usr/local/go
$SUDO tar -C /usr/local -xzf "/tmp/${GO_TARBALL}"
rm -f "/tmp/${GO_TARBALL}"

# ------------------------------------------------------------
# Shell configuration
# ------------------------------------------------------------

echo
echo "==> Configuring ~/.bashrc..."

MARKER="# --- droplet-dev-environment ---"

if ! grep -qF "${MARKER}" "${HOME}/.bashrc"; then
    cat >> "${HOME}/.bashrc" <<'EOF'

# --- droplet-dev-environment ---

# Go
export PATH="/usr/local/go/bin:$HOME/go/bin:$PATH"

# Deno
export DENO_INSTALL="$HOME/.deno"
export PATH="$DENO_INSTALL/bin:$PATH"

# DuckDB
export PATH="$HOME/.duckdb/cli/latest:$PATH"

# Claude Code native installer
export PATH="$HOME/.local/bin:$PATH"

# NVM
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Ubuntu package aliases
command -v fdfind >/dev/null 2>&1 && alias fd='fdfind'
command -v batcat >/dev/null 2>&1 && alias bat='batcat'

# Persistent PostgreSQL learning tmux session
alias pgwork='tmux new -A -s postgres'

export EDITOR="${EDITOR:-vim}"

# --- end droplet-dev-environment ---
EOF
fi

# Load useful paths in this script immediately.
export PATH="/usr/local/go/bin:${HOME}/go/bin:${PATH}"
export PATH="${DENO_INSTALL}/bin:${PATH}"
export PATH="${HOME}/.duckdb/cli/latest:${PATH}"
export PATH="${HOME}/.local/bin:${PATH}"

# ------------------------------------------------------------
# Verification
# ------------------------------------------------------------

echo
echo "========================================"
echo " Installed versions"
echo "========================================"

printf "%-16s " "Git:"
git --version || true

printf "%-16s " "tmux:"
tmux -V || true

printf "%-16s " "Mosh:"
mosh --version 2>&1 | head -1 || true

printf "%-16s " "SQLite:"
sqlite3 --version || true

printf "%-16s " "PostgreSQL:"
psql --version || true

printf "%-16s " "Docker:"
docker --version || true

printf "%-16s " "Compose:"
docker compose version || true

printf "%-16s " "containerd:"
containerd --version || true

printf "%-16s " "Node:"
node --version || true

printf "%-16s " "npm:"
npm --version || true

printf "%-16s " "NVM:"
nvm --version || true

printf "%-16s " "Codex:"
codex --version || true

printf "%-16s " "Claude:"
claude --version || true

printf "%-16s " "Deno:"
deno --version | head -1 || true

printf "%-16s " "DuckDB:"
duckdb --version || true

printf "%-16s " "Go:"
go version || true

printf "%-16s " "perf:"
perf --version 2>&1 | head -1 || true

printf "%-16s " "bpftrace:"
bpftrace --version || true

printf "%-16s " "tcpdump:"
tcpdump --version 2>&1 | head -1 || true

printf "%-16s " "hyperfine:"
hyperfine --version || true

printf "%-16s " "HTTPie:"
http --version || true

echo
echo "========================================"
echo " Setup complete"
echo "========================================"

echo
echo "Reload your shell:"
echo "    source ~/.bashrc"
echo
echo "Start/rejoin the tmux environment:"
echo "    pgwork"
echo
echo "Open PostgreSQL:"
echo "    sudo -u postgres psql"
echo
echo "Test Docker:"
echo "    docker run --rm hello-world"
echo
echo "Mosh normally needs inbound UDP ports 60000-61000."
echo "If you use a DigitalOcean Cloud Firewall, allow that UDP range."
