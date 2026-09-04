# Proves scripts/lab-setup.sh works end to end on a fresh Ubuntu image.
#
# The build context is the repository's scripts/ directory, so that
# lab-setup.sh (the artefact under test) sits at the context root:
#
#   docker build -f scripts/docker/Dockerfile -t skills-tools-lab-test scripts/
#
# Use scripts/docker/test.sh, which wraps the build and the verification run.

FROM ubuntu:24.04

# apt must never prompt, and dpkg must not try to start the daemons it
# installs (postgresql, docker, containerd): there is no init in an image
# build, so a start attempt would either hang or fail the layer. Exit 101
# is the "policy forbids this action" contract invoke-rc.d expects, and it
# is treated as success by the maintainer scripts.
ENV DEBIAN_FRONTEND=noninteractive
RUN printf '#!/bin/sh\nexit 101\n' > /usr/sbin/policy-rc.d \
    && chmod +x /usr/sbin/policy-rc.d

# ubuntu:24.04 is smaller than a droplet image: lab-setup.sh needs curl and
# CA certificates before it can reach any of the upstream installers. It
# installs both itself too, so this only front-loads them.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/lab

# The script under test runs as root with the image-build marker, so kernel
# package selection does not depend on the build host. A non-zero exit fails.
COPY lab-setup.sh ./
RUN chmod +x ./lab-setup.sh && LAB_IMAGE_BUILD=1 ./lab-setup.sh

# Verification stage: every tool the script promises must be on PATH and
# runnable. verify-toolchain.sh exits non-zero on the first missing tool,
# which fails the build.
#
# It runs under `bash -lic`:
#   -l  login shell, so /etc/profile and ~/.profile are read
#   -i  interactive, because Ubuntu's stock ~/.bashrc returns early for
#       non-interactive shells and the PATH block lab-setup.sh appends
#       (Go, Deno, DuckDB, Claude Code, NVM/Node) sits after that guard
COPY docker/verify.sh /usr/local/bin/verify-toolchain.sh
RUN chmod +x /usr/local/bin/verify-toolchain.sh \
    && bash -lic verify-toolchain.sh

# Re-runnable at container runtime, which is what test.sh does after the build.
CMD ["bash", "-lic", "verify-toolchain.sh"]
