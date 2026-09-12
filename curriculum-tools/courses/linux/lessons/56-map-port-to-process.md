# Map a listening port back to its process and descriptor

slug: map-port-to-process
category: sockets-and-basic-networking
difficulty: intermediate
tags: sockets, tcp, file-descriptors, procfs
prerequisites: create-listening-socket
safety: read-only
run-in: shell
sessions: 1
min-version: 5.1
minutes: 12
revision: 2

## Overview
Start a listener and correlate three views of the same resource: ss names the port and PID, lsof names the process and socket, and /proc exposes the owning descriptor. This turns a port symptom into an actionable owner.

## Syntax breakdown
### In plain terms

This lesson joins a generated loopback port to the process that owns it and to that process's descriptor table. The three views may have different permissions and formatting, so the required evidence is the exact PID plus procfs socket descriptor, not a host-wide port guess.

### What you are learning

- A listener's endpoint and its owning process are different identifiers joined through a descriptor.
- procfs exposes a process's open descriptor targets as socket:[inode] links.
- lsof is helpful corroboration, but restricted hosts may hide it.

### Piece by piece

- **ss -ltnp** (a TCP ownership view)
  - What it is: **-l**, **-t**, and **-n** retain listeners, TCP, and numeric output; **-p** requests process information when permitted.
  - What it does here: grep narrows the list to the generated port.
  - What it gives us: ss_owner_seen says the endpoint was visible; inspect its PID text against map_pid when available.
- **lsof -nP -a -p PID -iTCP:PORT -sTCP:LISTEN** (an open-file query)
  - What it is: lsof lists open objects; **-n** and **-P** avoid name lookups, **-a** combines filters, **-p** chooses one process, **-i** chooses TCP port, and **-s** chooses LISTEN state.
  - What it does here: it corroborates the one server PID and port.
  - What it gives us: lsof_owner_seen may be no under policy without invalidating procfs evidence.
- **/proc/PID/fd** and **find -type l -printf** (descriptor inspection)
  - What they are: this procfs directory holds symbolic links for open descriptors; find prints descriptor number and target.
  - What they do here: grep selects a socket link from the recorded server.
  - What they give us: proc_socket_fd_seen is the direct ownership evidence required by this lesson.
- **trap**, **kill**, and **wait** (lifecycle control)
  - What they do here: retain and clean only server_pid.
  - What they give us: no unrelated listener is stopped during diagnosis.

## Run
```sh
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
RUN_ID=$$
PORT=$LAB/map-port-$UID-$RUN_ID
server_pid=
rm -f "$PORT"
trap 'test -n "$server_pid" && kill "$server_pid" 2>/dev/null || true; test -n "$server_pid" && wait "$server_pid" 2>/dev/null || true; rm -f "$PORT"' EXIT
PORT="$PORT" python3 -u -c 'import os,socket,time
s=socket.socket(); s.bind(("127.0.0.1",0)); s.listen(2); open(os.environ["PORT"],"w").write(str(s.getsockname()[1])); time.sleep(4)' &
server_pid=$!
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  [ -s "$PORT" ] && break
  sleep 0.05
done
port=$(cat "$PORT" 2>/dev/null || true)
ss_line=$(ss -ltnp 2>/dev/null | grep -E ":$port([[:space:]]|$)" || true)
lsof_line=$(lsof -nP -a -p "$server_pid" -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | tail -n +2 || true)
fd_line=$(find "/proc/$server_pid/fd" -maxdepth 1 -type l -printf '%f %l\n' 2>/dev/null | grep socket: | head -n 1 || true)
printf 'map_pid=%s\nmap_port=%s\nss_owner_seen=%s\nlsof_owner_seen=%s\nproc_socket_fd_seen=%s\n' "$server_pid" "$port" "$(test -n "$ss_line" && echo yes || echo no)" "$(test -n "$lsof_line" && echo yes || echo no)" "$(test -n "$fd_line" && echo yes || echo no)"
if [ -n "$ss_line" ] && [ -n "$fd_line" ]; then printf 'port_owner_correlation=observed\n'; else printf 'port_owner_correlation=partial\n'; fi
kill "$server_pid" 2>/dev/null || true
wait "$server_pid" 2>/dev/null || true
server_pid=
rm -f "$PORT"
trap - EXIT
printf 'cleanup=done\n'
```

## Expected result
ss_owner_seen=yes, proc_socket_fd_seen=yes, and port_owner_correlation=observed for the exact server PID and ephemeral port. lsof_owner_seen is normally yes but can be no on restricted hosts.

## Systems lens
A socket is owned through a process descriptor, while ss indexes the network endpoint. Incident diagnosis joins these two namespaces of identity instead of treating a port as an anonymous number.

## Optional variation
**Predict:** Which observation survives if lsof is blocked by host policy: ss ownership, procfs descriptor links, or neither?

**Inspect and explain:** Explain why map_port alone cannot identify a process unless it is joined to map_pid or a descriptor.

**Vary:** Rerun the complete lesson and insert ls -l "/proc/$server_pid/fd" immediately after fd_line is collected. Inspect the socket links while the recorded server is still alive.

**Hint:** Use the saved server_pid, never pgrep a broad interpreter name.

**Apply:** A loopback bind reports EADDRINUSE. State the endpoint, process, and descriptor evidence you would collect before stopping any process.
