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
BUILDKIT_IMAGE="moby/buildkit:buildx-stable-1"

DOCKER_AVAILABLE=0
STARTED_DOCKER=0
BUILDER_CREATED=0
RESOURCE_WORK_STARTED=0
BUILDKIT_IMAGE_WAS_PRESENT=0
BUILDKIT_IMAGES=()
DOCKER_START_METHOD=""
DOCKER_SERVICE_WAS_ACTIVE=0
DOCKER_SOCKET_WAS_ACTIVE=0
CONTAINERD_WAS_ACTIVE=0
RESOURCE_LABEL="com.skills-tools.lab-test=${RUN_ID}"
BUILDER_CONTAINER_PREFIX="buildx_buildkit_${BUILDER}"
BUILDER_VOLUME_PREFIX="buildx_buildkit_${BUILDER}"

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

query_resources() {
    local -n destination="$1"
    local output
    shift
    destination=()
    if ! output="$("$@" 2>/dev/null)"; then
        return 1
    fi
    if [[ -n "${output}" ]]; then
        # shellcheck disable=SC2034 # destination is a nameref to the caller's array.
        mapfile -t destination <<< "${output}"
    fi
}

cleanup() {
    local original_status=$?
    local cleanup_failed=0
    local resource_check=0
    local remaining=""
    local id=""
    local resource=""
    local -a run_containers=()
    local -a run_images=()
    local -a builder_containers=()
    local -a builder_volumes=()

    echo
    echo "==> Cleaning up Docker resources created by this test..."
    if [[ "${DOCKER_AVAILABLE}" -eq 1 ]] && docker info >/dev/null 2>&1; then
        resource_check=1
        # The --rm run normally removes this container; rm is retained for
        # interrupted or failed runs.
        if ! query_resources run_containers docker container ls -aq \
            --filter "label=${RESOURCE_LABEL}"; then
            cleanup_failed=1
            remaining+=" query:labeled-containers"
        fi
        for id in "${run_containers[@]}"; do
            if [[ -n "${id}" ]]; then
                docker container rm -f "${id}" >/dev/null 2>&1 || true
            fi
        done
        docker container rm -f "${CONTAINER}" >/dev/null 2>&1 || true

        if ! query_resources run_images docker image ls -aq \
            --filter "label=${RESOURCE_LABEL}"; then
            cleanup_failed=1
            remaining+=" query:labeled-images"
        fi
        for id in "${run_images[@]}"; do
            if [[ -n "${id}" ]]; then
                docker image rm -f "${id}" >/dev/null 2>&1 || true
            fi
        done
        docker image rm -f "${IMAGE}" >/dev/null 2>&1 || true
        if [[ "${BUILDER_CREATED}" -eq 1 ]]; then
            # Clear the builder's private cache before removing its metadata.
            docker buildx prune --builder "${BUILDER}" --all --force \
                >/dev/null 2>&1 || true
            docker buildx rm --force "${BUILDER}" >/dev/null 2>&1 || true
        fi

        # buildx uses names beginning with buildx_buildkit_<builder> for its
        # container and state volume. Remove only this run's unique prefix;
        # this cannot match a pre-existing builder from another run.
        if ! query_resources builder_containers docker container ls -aq \
            --filter "name=${BUILDER_CONTAINER_PREFIX}"; then
            cleanup_failed=1
            remaining+=" query:builder-containers"
        fi
        for id in "${builder_containers[@]}"; do
            if [[ -n "${id}" ]]; then
                docker container rm -f "${id}" >/dev/null 2>&1 || true
            fi
        done
        if ! query_resources builder_volumes docker volume ls -q \
            --filter "name=${BUILDER_VOLUME_PREFIX}"; then
            cleanup_failed=1
            remaining+=" query:builder-volumes"
        fi
        for resource in "${builder_volumes[@]}"; do
            if [[ -n "${resource}" ]]; then
                docker volume rm -f "${resource}" >/dev/null 2>&1 || true
            fi
        done

        # The builder container uses this image, so remove the image only
        # after the builder and its fallback container/volume cleanup. A
        # pre-existing helper image belongs to the host and is preserved.
        if [[ "${BUILDKIT_IMAGE_WAS_PRESENT}" -eq 0 ]]; then
            docker image rm -f "${BUILDKIT_IMAGE}" >/dev/null 2>&1 || true
        fi

        # Verify every exact name and run label. A cleanup that cannot prove
        # absence is a failure, since BuildKit state can consume disk space.
        if docker container inspect "${CONTAINER}" >/dev/null 2>&1; then
            remaining+=" container:${CONTAINER}"
        fi
        if docker image inspect "${IMAGE}" >/dev/null 2>&1; then
            remaining+=" image:${IMAGE}"
        fi
        if [[ "${BUILDKIT_IMAGE_WAS_PRESENT}" -eq 0 ]] \
            && docker image inspect "${BUILDKIT_IMAGE}" >/dev/null 2>&1; then
            remaining+=" helper-image:${BUILDKIT_IMAGE}"
        fi
        if docker buildx inspect "${BUILDER}" >/dev/null 2>&1; then
            remaining+=" builder:${BUILDER}"
        fi
        if ! query_resources run_containers docker container ls -aq \
            --filter "label=${RESOURCE_LABEL}"; then
            cleanup_failed=1
            remaining+=" query:labeled-containers"
        fi
        for id in "${run_containers[@]}"; do
            if [[ -n "${id}" ]]; then
                remaining+=" labeled-container:${id}"
            fi
        done
        if ! query_resources run_images docker image ls -aq \
            --filter "label=${RESOURCE_LABEL}"; then
            cleanup_failed=1
            remaining+=" query:labeled-images"
        fi
        for id in "${run_images[@]}"; do
            if [[ -n "${id}" ]]; then
                remaining+=" labeled-image:${id}"
            fi
        done
        if ! query_resources builder_containers docker container ls -aq \
            --filter "name=${BUILDER_CONTAINER_PREFIX}"; then
            cleanup_failed=1
            remaining+=" query:builder-containers"
        fi
        for id in "${builder_containers[@]}"; do
            if [[ -n "${id}" ]]; then
                remaining+=" builder-container:${id}"
            fi
        done
        if ! query_resources builder_volumes docker volume ls -q \
            --filter "name=${BUILDER_VOLUME_PREFIX}"; then
            cleanup_failed=1
            remaining+=" query:builder-volumes"
        fi
        for resource in "${builder_volumes[@]}"; do
            if [[ -n "${resource}" ]]; then
                remaining+=" builder-volume:${resource}"
            fi
        done
    else
        if [[ "${RESOURCE_WORK_STARTED}" -eq 1 ]]; then
            cleanup_failed=1
            echo "ERROR: Docker daemon unavailable; run-owned cleanup cannot be verified." >&2
        else
            echo "No run-owned Docker resources were created; cleanup verification not needed."
        fi
    fi

    if [[ "${resource_check}" -eq 1 ]]; then
        if [[ -n "${remaining}" ]]; then
            cleanup_failed=1
            echo "ERROR: run-owned Docker resources remain:${remaining}" >&2
        else
            echo "  test container, image, builder, BuildKit container, and state volume removed"
        fi
    fi

    restore_docker_state
    if [[ "${DOCKER_AVAILABLE}" -eq 1 ]] && docker info >/dev/null 2>&1; then
        echo "Docker final state: running"
    else
        echo "Docker final state: stopped/unavailable"
    fi

    if [[ "${cleanup_failed}" -eq 1 ]]; then
        original_status=1
    fi
    trap - EXIT
    exit "${original_status}"
}

trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 131' QUIT

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
echo "==> Recording BuildKit helper image state..."
if ! query_resources BUILDKIT_IMAGES docker image ls -q "${BUILDKIT_IMAGE}"; then
    echo "ERROR: could not inspect the BuildKit helper image state." >&2
    exit 1
fi
if [[ "${#BUILDKIT_IMAGES[@]}" -gt 0 ]]; then
    BUILDKIT_IMAGE_WAS_PRESENT=1
fi

echo
echo "==> Creating unique Buildx builder ${BUILDER}..."
RESOURCE_WORK_STARTED=1
BUILDER_CREATED=1
docker buildx create \
    --name "${BUILDER}" \
    --driver docker-container \
    --driver-opt "image=${BUILDKIT_IMAGE}" \
    >/dev/null

echo
echo "==> Building ${IMAGE} (runs lab-setup.sh and verifies the toolchain)..."
docker buildx build \
    --builder "${BUILDER}" \
    --load \
    --label "${RESOURCE_LABEL}" \
    -f scripts/docker/Dockerfile \
    -t "${IMAGE}" \
    scripts/

echo
echo "==> Running the verification container ${CONTAINER}..."
docker run --name "${CONTAINER}" --label "${RESOURCE_LABEL}" --rm "${IMAGE}"

echo
echo "PASS: lab-setup.sh completed and every tool verified."
