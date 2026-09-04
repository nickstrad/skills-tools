# scripts

Bootstrap and utility scripts for the machines this repository's tools run on.

## `lab-setup.sh`

Turns a fresh Ubuntu (22.04 or 24.04) DigitalOcean droplet into a compact
systems/database development environment. It is the one script to run on a new
VM before anything else here; it covers most of what any programming session
needs, not only the curricula.

What it installs:

- **Remote terminal stack**: mosh, tmux, git, and a `pgwork` alias that starts
  or reattaches a tmux session named `postgres`.
- **Databases**: PostgreSQL from the official PGDG Apt repository (the
  `postgresql` meta-package, so a new droplet gets the current stable major),
  `postgresql-contrib`, `libpq-dev`, SQLite, and the DuckDB CLI.
- **Runtimes and agents**: Node.js 22 through NVM (set as default), npm,
  OpenAI Codex, Claude Code (native installer), Deno, and the latest stable Go
  discovered from go.dev.
- **Containers**: Docker Engine, Buildx, and Compose from the official Docker
  Apt repository. Connect to a running daemon before starting container labs.
- **Systems tools**: procps (`ps`, `pgrep`, `pmap`, `free`, `vmstat`), psmisc
  (`pstree`), util-linux (`findmnt`, `lsblk`, `lsns`, `unshare`, `nsenter`,
  `taskset`, `ionice`), coreutils, findutils, strace, lsof, htop, perf,
  bpftrace, tcpdump, socat, netcat, sysstat (`iostat`), iproute2 (`ip`, `ss`),
  ripgrep, fzf, fd, bat, jq, tree, hyperfine, HTTPie, build-essential,
  bubblewrap, curl, wget, zip/unzip, DNS and networking utilities, plus the
  Linux course's helpers: `python3`, GNU `time` (`/usr/bin/time`), `e2fsprogs`
  (`mkfs.ext4`), and `sudo`. Droplet images preinstall most of these; the bare
  `ubuntu:24.04` image does not, so the script names them explicitly.
- **Shell config**: a marked block appended once to `~/.bashrc` with the PATH
  entries for Go, Deno, DuckDB, Claude Code, and NVM, plus `fd`/`bat` aliases
  for the Ubuntu package names.

Usage on a fresh droplet, as root or a sudo-capable user:

```sh
curl -fsSLO https://raw.githubusercontent.com/nickstrad/skills-tools/main/scripts/lab-setup.sh
chmod +x lab-setup.sh
./lab-setup.sh
source ~/.bashrc
pgwork
```

The script is idempotent enough to re-run: apt packages upgrade in place, NVM
and the `.bashrc` block are skipped when present, and Deno, DuckDB, Go, Codex,
and Claude Code are upgraded to their current releases. It ends by printing the
installed versions.

Bootstrap installs tools; it does not explicitly enable, start, or stop host daemons.
Package-manager defaults may start services on a host. The image build blocks those starts.
Use a reachable Docker context or `DOCKER_HOST`, and use the PostgreSQL course's own disposable
cluster rather than depending on a host-managed database.

Optional environment variables:

| Variable       | Default   | Effect                                                                 |
| -------------- | --------- | ---------------------------------------------------------------------- |
| `NODE_VERSION` | `22`      | Node.js major installed through NVM.                                   |
| `NVM_VERSION`  | `v0.40.6` | NVM release tag to install.                                            |
| `LAB_IMAGE_BUILD` | `0` | Set to `1` in image builds to skip host-kernel packages; the test Dockerfile supplies it. |

## Testing the script

`scripts/docker/test.sh` proves `lab-setup.sh` works end to end on a fresh
Ubuntu image, without touching the machine you run it from:

```sh
scripts/docker/test.sh
```

It builds `scripts/docker/Dockerfile` (an `ubuntu:24.04` image that runs
`lab-setup.sh` as root during the build), then runs the resulting image so the
toolchain verification happens again at container runtime. The build fails if
`lab-setup.sh` fails, and `scripts/docker/verify.sh` fails the build if any
installed tool or Linux systems command is missing or not runnable. The script
exits non-zero on any failure.

The test requires `docker info` to succeed in the selected context. If the daemon
is unavailable, it exits before creating resources and leaves startup to the
environment. It never starts or stops a host daemon.

Cleanup runs through an `EXIT` trap even when the build fails:

- Each run gets a unique image tag, container name,
  and Buildx builder. The image and run container carry a unique run label;
  BuildKit's generated builder container and state/cache volume are removed by
  exact per-run name/prefix after the builder is pruned and deleted. On exit,
  cleanup verifies that the image, container, builder, BuildKit container,
  state volume, and run-labeled resources are all gone. The pinned BuildKit
  helper image is removed only when it was absent before the run; a
  pre-existing helper image is retained. If cleanup cannot verify this
  (including a daemon disappearing during cleanup), the test exits non-zero.
  It never runs a host-wide `docker system prune`, and pre-existing images,
  containers, volumes, networks, and build cache remain untouched. A run still
  takes roughly 15-25 minutes on a cold cache.

The image build sets `LAB_IMAGE_BUILD=1` and blocks package service startup.
Bootstrap also recognizes common container-runtime markers. These environments
share the host kernel, so it skips the kernel-specific `perf` package there.

Notes:

- `perf` needs a kernel-specific package; the script tries
  `linux-tools-$(uname -r)`, then `linux-tools-generic`, and continues without
  it if neither exists for the droplet's kernel.
- Mosh needs inbound UDP 60000-61000. Allow that range in the DigitalOcean
  Cloud Firewall if one is attached.
- The PostgreSQL package may create/start a system cluster on port 5432. The PostgreSQL
  course in `curriculum-tools/` builds its own disposable cluster on port 5440
  in its first lesson and never touches the system one.
- After setup, clone this repository and symlink the skills as described in the
  top-level README.
