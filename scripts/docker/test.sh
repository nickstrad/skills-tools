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
# Every Docker resource created by this script has a unique per-run name.
# Cleanup removes only those resources; it never runs a host-wide prune.

set -euo pipefail

# Repository root, so the script works from any working directory.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${REPO_ROOT}"

if [[ "${EUID}" -eq 0 ]]; then
    SUDO=""
else
    SUDO="sudo"
fi

RUN_ID="$(date -u +%Y%m%d%H%M%S)-$$"
IMAGE="${IMAGE:-skills-tools-lab-test}-${RUN_ID}"
CONTAINER="skills-tools-lab-container-${RUN_ID}"
BUILDER="skills-tools-lab-builder-${RUN_ID}"

DOCKER_AVAILABLE=0
STARTED_DOCKER=0
BUILDER_CREATED=0
DOCKER_START_METHOD=""
DOCKER_SERVICE_WAS_ACTIVE=0
DOCKER_SOCKET_WAS_ACTIVE=0
CONTAINERD_WAS_ACTIVE=0

systemd_unit_was_active() {
    local unit="$1"
    if command -v systemctl >/dev/null 2>&1 \
        && systemctl is-active --quiet "${unit}" 2>/dev/null; then
        return 0
    fi
    return 1
}

save_docker_unit_state() {
    if systemd_unit_was_active docker.service; then
        DOCKER_SERVICE_WAS_ACTIVE=1
    fi
    if systemd_unit_was_active docker.socket; then
        DOCKER_SOCKET_WAS_ACTIVE=1
    fi
    if systemd_unit_was_active containerd.service; then
        CONTAINERD_WAS_ACTIVE=1
    fi
}

wait_for_docker() {
    local attempt
    for ((attempt = 1; attempt <= 30; attempt++)); do
        if docker info >/dev/null 2>&1; then
            DOCKER_AVAILABLE=1
            return 0
        fi
        sleep 1
    done
    return 1
}

restore_docker_state() {
    [[ "${STARTED_DOCKER}" -eq 1 ]] || return 0

    echo
    echo "==> Restoring Docker state (the test started the daemon)..."
    if [[ "${DOCKER_START_METHOD}" == "systemctl" ]]; then
        # Only stop units that were inactive before this test. This preserves
        # unrelated services that happened to be active already.
        if [[ "${DOCKER_SERVICE_WAS_ACTIVE}" -eq 0 ]]; then
            $SUDO systemctl stop docker.service >/dev/null 2>&1 || true
        fi
        if [[ "${DOCKER_SOCKET_WAS_ACTIVE}" -eq 0 ]]; then
            $SUDO systemctl stop docker.socket >/dev/null 2>&1 || true
        fi
        if [[ "${CONTAINERD_WAS_ACTIVE}" -eq 0 ]]; then
            $SUDO systemctl stop containerd.service >/dev/null 2>&1 || true
        fi
    elif [[ "${DOCKER_START_METHOD}" == "service" ]]; then
        $SUDO service docker stop >/dev/null 2>&1 || true
    fi
}

cleanup() {
    local original_status=$?
    local container_remaining=0
    local image_remaining=0
    local builder_remaining=0
    local resource_check=0

    echo
    echo "==> Cleaning up Docker resources created by this test..."
    if [[ "${DOCKER_AVAILABLE}" -eq 1 ]] && docker info >/dev/null 2>&1; then
        resource_check=1
        # The --rm run normally removes this container; rm is retained for
        # interrupted or failed runs.
        docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true
        docker image rm -f "${IMAGE}" >/dev/null 2>&1 || true
        if [[ "${BUILDER_CREATED}" -eq 1 ]]; then
            docker buildx rm --force "${BUILDER}" >/dev/null 2>&1 || true
        fi

        if docker ps -a --format '{{.Names}}' | grep -Fxq "${CONTAINER}"; then
            container_remaining=1
        fi
        if docker image inspect "${IMAGE}" >/dev/null 2>&1; then
            image_remaining=1
        fi
        if [[ "${BUILDER_CREATED}" -eq 1 ]] \
            && docker buildx inspect "${BUILDER}" >/dev/null 2>&1; then
            builder_remaining=1
        fi
    else
        echo "Docker daemon unavailable during cleanup; resource verification skipped."
    fi

    if [[ "${resource_check}" -eq 0 ]]; then
        echo "  test resources: not checked (Docker daemon unavailable)"
    elif [[ "${container_remaining}" -eq 0 ]]; then
        echo "  test container removed: ${CONTAINER}"
    else
        echo "  WARNING: test container remains: ${CONTAINER}"
    fi
    if [[ "${resource_check}" -eq 0 ]]; then
        echo "  test image: not checked (Docker daemon unavailable)"
    elif [[ "${image_remaining}" -eq 0 ]]; then
        echo "  test image removed: ${IMAGE}"
    else
        echo "  WARNING: test image remains: ${IMAGE}"
    fi
    if [[ "${resource_check}" -eq 0 ]]; then
        echo "  test builder: not checked (Docker daemon unavailable)"
    elif [[ "${BUILDER_CREATED}" -eq 0 || "${builder_remaining}" -eq 0 ]]; then
        echo "  test builder removed: ${BUILDER}"
    else
        echo "  WARNING: test builder remains: ${BUILDER}"
    fi

    restore_docker_state
    if [[ "${DOCKER_AVAILABLE}" -eq 1 ]] && docker info >/dev/null 2>&1; then
        echo "Docker final state: running"
    else
        echo "Docker final state: stopped/unavailable"
    fi

    if [[ "${container_remaining}" -ne 0 || "${image_remaining}" -ne 0 \
        || "${builder_remaining}" -ne 0 ]]; then
        echo "ERROR: one or more test-owned Docker resources remain." >&2
        exit 1
    fi
    exit "${original_status}"
}

trap cleanup EXIT

if ! command -v docker >/dev/null 2>&1; then
    echo "ERROR: Docker CLI is not installed." >&2
    exit 1
fi

if docker info >/dev/null 2>&1; then
    DOCKER_AVAILABLE=1
    echo "Docker initial state: running"
else
    echo "Docker initial state: stopped/unavailable"
    save_docker_unit_state

    started=0
    if command -v systemctl >/dev/null 2>&1 \
        && $SUDO systemctl start docker >/dev/null 2>&1; then
        DOCKER_START_METHOD="systemctl"
        started=1
    elif command -v service >/dev/null 2>&1 \
        && $SUDO service docker start >/dev/null 2>&1; then
        DOCKER_START_METHOD="service"
        started=1
    fi

    if [[ "${started}" -eq 1 ]]; then
        STARTED_DOCKER=1
        echo "Docker start requested; waiting for the daemon..."
        if ! wait_for_docker; then
            echo "ERROR: Docker did not become ready after startup." >&2
            exit 1
        fi
        echo "Docker started for this test."
    else
        echo "ERROR: Docker is unavailable and could not be started here." >&2
        exit 1
    fi
fi

echo
echo "==> Creating unique Buildx builder ${BUILDER}..."
docker buildx create \
    --name "${BUILDER}" \
    --driver docker-container \
    >/dev/null
BUILDER_CREATED=1

echo
echo "==> Building ${IMAGE} (runs lab-setup.sh and verifies the toolchain)..."
docker buildx build \
    --builder "${BUILDER}" \
    --load \
    -f scripts/docker/Dockerfile \
    -t "${IMAGE}" \
    scripts/

echo
echo "==> Running the verification container ${CONTAINER}..."
docker run --name "${CONTAINER}" --rm "${IMAGE}"

echo
echo "PASS: lab-setup.sh completed and every tool verified."
