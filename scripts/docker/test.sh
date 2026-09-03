#!/usr/bin/env bash
#
# End-to-end test for scripts/lab-setup.sh.
#
# Builds a fresh ubuntu:24.04 image that runs lab-setup.sh during the build,
# then runs the resulting image so the toolchain verification happens again
# at container runtime. Exits non-zero if either step fails.
#
#   scripts/docker/test.sh
#
# The build downloads a lot (apt, NVM/Node, Go, Deno, DuckDB, agents) and
# takes roughly 15-25 minutes cold; Docker layer caching makes re-runs fast.
#
# The test leaves nothing behind: on exit it removes the test image and every
# other image, container, volume and build-cache entry, and if it had to start
# Docker itself it stops the daemon again so it does not sit in memory.

set -euo pipefail

IMAGE="${IMAGE:-skills-tools-lab-test}"

# Repository root, so the script works from any working directory.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${REPO_ROOT}"

if [[ "${EUID}" -eq 0 ]]; then
    SUDO=""
else
    SUDO="sudo"
fi

STARTED_DOCKER=0

# Runs on every exit path, success or failure, so a broken build still hands
# the machine back the way it was found: no test image, no cached layers, no
# stray daemon.
cleanup() {
    echo
    echo "==> Cleaning up Docker data..."
    docker rmi -f "${IMAGE}" >/dev/null 2>&1 || true
    # -a --volumes: every image (including ubuntu:24.04), container, network,
    # volume and build-cache entry. The build cache alone is several GB.
    docker system prune -a -f --volumes || true

    if [[ "${STARTED_DOCKER}" -eq 1 ]]; then
        echo
        echo "==> Stopping Docker again (it was not running before this test)..."
        $SUDO systemctl stop docker.service docker.socket containerd.service || true
    fi
}

trap cleanup EXIT

if command -v systemctl >/dev/null 2>&1 \
    && ! systemctl is-active --quiet docker; then
    echo "==> Docker is not running; starting it for this test..."
    $SUDO systemctl start docker
    STARTED_DOCKER=1
fi

echo
echo "==> Building ${IMAGE} (runs lab-setup.sh and verifies the toolchain)..."
docker build -f scripts/docker/Dockerfile -t "${IMAGE}" scripts/

echo
echo "==> Running the verification container..."
docker run --rm "${IMAGE}"

echo
echo "PASS: lab-setup.sh completed and every tool verified."
