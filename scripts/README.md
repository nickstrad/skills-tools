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
  Apt repository, enabled as a service.
- **Systems tools**: procps (`ps`, `pgrep`, `pmap`, `free`, `vmstat`), psmisc
  (`pstree`), util-linux (`findmnt`, `lsblk`, `lsns`, `unshare`, `nsenter`,
  `taskset`, `ionice`), coreutils, findutils, strace, lsof, htop, perf,
  bpftrace, tcpdump, socat, netcat, sysstat (`iostat`), iproute2 (`ip`, `ss`),
  ripgrep, fzf, fd, bat, jq, tree, hyperfine, HTTPie, build-essential,
  bubblewrap, curl, wget, zip/unzip, DNS and networking utilities.
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

Optional environment variables:

| Variable       | Default   | Effect                                                                 |
| -------------- | --------- | ---------------------------------------------------------------------- |
| `NODE_VERSION` | `22`      | Node.js major installed through NVM.                                   |
| `NVM_VERSION`  | `v0.40.6` | NVM release tag to install.                                            |

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

Two conveniences, both handled by an `EXIT` trap so they also run when the
build fails:

- **Docker on demand.** The test first checks the daemon with `docker info`.
  If it is unavailable, the test starts Docker through `systemctl` or
  `service` when possible, then restores the prior unit state on exit. A
  daemon that was already running is left running.
- **No unrelated cleanup.** Each run gets a unique image tag, container name,
  and Buildx builder. On exit, only those resources are removed; the test
  never runs a host-wide `docker system prune`, and pre-existing images,
  containers, volumes, networks, and build cache remain untouched. A run
  still takes roughly 15-25 minutes on a cold cache.

Inside a container there is no systemd and the kernel belongs to the host, so
`lab-setup.sh` installs the Docker and PostgreSQL packages without starting
their services and skips the kernel-specific `perf` package. On a droplet, all
three run as before.

Notes:

- `perf` needs a kernel-specific package; the script tries
  `linux-tools-$(uname -r)`, then `linux-tools-generic`, and continues without
  it if neither exists for the droplet's kernel.
- Mosh needs inbound UDP 60000-61000. Allow that range in the DigitalOcean
  Cloud Firewall if one is attached.
- The PostgreSQL package starts a system cluster on port 5432. The PostgreSQL
  course in `curriculum-tools/` builds its own disposable cluster on port 5440
  in its first lesson and never touches the system one.
- After setup, clone this repository and symlink the skills as described in the
  top-level README.
