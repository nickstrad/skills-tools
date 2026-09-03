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
- **Systems tools**: strace, lsof, htop, perf, bpftrace, tcpdump, socat,
  netcat, sysstat, ripgrep, fzf, fd, bat, jq, tree, hyperfine, HTTPie,
  build-essential, bubblewrap, curl, wget, zip/unzip, DNS and networking
  utilities.
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
| `PG_VERSION`   | unset     | Install a specific PostgreSQL major from PGDG (for example `16`) instead of the meta-package. |
| `NODE_VERSION` | `22`      | Node.js major installed through NVM.                                   |
| `NVM_VERSION`  | `v0.40.6` | NVM release tag to install.                                            |

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
