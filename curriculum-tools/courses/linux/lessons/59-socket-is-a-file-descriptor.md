# Correlate a socket descriptor with procfs TCP records

slug: socket-is-a-file-descriptor
category: sockets-and-basic-networking
difficulty: advanced
tags: sockets, tcp, file-descriptors, procfs
prerequisites: map-port-to-process
safety: read-only
run-in: shell
sessions: 1
min-version: 5.1
minutes: 14
revision: 2

## Overview
Have the server publish its socket descriptor and socket inode shown by /proc/self/fd. From the parent, match that inode to /proc/net/tcp and match the descriptor back to the server PID.

## Syntax breakdown
### In plain terms

The server publishes the descriptor number and inode-like socket handle for its listener, then the parent reads procfs to correlate them. This is an identity join: a port alone is not the same as the process reference that keeps the socket alive.

### What you are learning

- fileno returns the process-local descriptor index that refers to the socket.
- /proc/PID/fd exposes that reference as socket:[inode].
- /proc/net/tcp uses hexadecimal endpoints and is a network-namespace view.

### Piece by piece

- **socket.fileno** and **os.readlink** (Python descriptor inspection)
  - What they are: fileno returns an integer descriptor; readlink resolves the procfs symbolic link for it.
  - What they do here: the server writes fd, port, link, and inode to META before sleeping.
  - What they give us: the parent has exact values belonging to this server rather than a scan of all sockets.
- **awk -F=** (metadata parsing)
  - What it is: awk splits the generated KEY=VALUE lines at equals signs.
  - What it does here: it extracts the saved descriptor, port, link, and inode.
  - What it gives us: missing fields signal that the server was not ready, not that a correlation succeeded.
- **printf '%04X'** (a numeric conversion)
  - What it is: printf formats the decimal port as at least four uppercase hexadecimal digits.
  - What it does here: it forms the port representation used by /proc/net/tcp.
  - What it gives us: port_hex makes the table lookup readable.
- **readlink /proc/PID/fd/FD** and **/proc/net/tcp** (kernel views)
  - What they are: the first resolves a process descriptor and the second lists TCP records in the current network namespace.
  - What they do here: the script matches the exact descriptor link and finds a row containing the generated local port.
  - What they give us: descriptor_inode_correlation=observed requires both views; table row formatting is supporting evidence, not a service response.
- **trap**, **kill**, and **wait** (cleanup)
  - What they do here: remove only the server and its metadata file.

## Run
```sh
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
META=$LAB/socket-fd-meta-$UID-$$
server_pid=
rm -f "$META"
trap 'test -n "$server_pid" && kill "$server_pid" 2>/dev/null || true; test -n "$server_pid" && wait "$server_pid" 2>/dev/null || true; rm -f "$META"' EXIT
META="$META" python3 -u -c 'import os,socket,time
s=socket.socket(); s.bind(("127.0.0.1",0)); s.listen(1); fd=s.fileno(); link=os.readlink("/proc/self/fd/%d"%fd); inode=link.split("[")[-1].rstrip("]"); open(os.environ["META"],"w").write("fd=%d\nport=%d\nlink=%s\ninode=%s\n"%(fd,s.getsockname()[1],link,inode)); time.sleep(4)' &
server_pid=$!
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  [ -s "$META" ] && break
  sleep 0.05
done
fd=$(awk -F= '$1=="fd"{print $2}' "$META")
port=$(awk -F= '$1=="port"{print $2}' "$META")
link=$(awk -F= '$1=="link"{print $2}' "$META")
inode=$(awk -F= '$1=="inode"{print $2}' "$META")
port_hex=$(printf '%04X' "$port")
proc_link=$(readlink "/proc/$server_pid/fd/$fd" 2>/dev/null || true)
tcp_row=$(awk -v p=":$port_hex" '$2 ~ p {print; exit}' /proc/net/tcp 2>/dev/null || true)
printf 'socket_pid=%s\nsocket_fd=%s\nsocket_inode=%s\nproc_fd_link=%s\nproc_tcp_row_seen=%s\n' "$server_pid" "$fd" "$inode" "$proc_link" "$(test -n "$tcp_row" && echo yes || echo no)"
if [ "$proc_link" = "$link" ] && [ -n "$inode" ] && [ -n "$tcp_row" ]; then printf 'descriptor_inode_correlation=observed\n'; else printf 'descriptor_inode_correlation=partial\n'; fi
kill "$server_pid" 2>/dev/null || true
wait "$server_pid" 2>/dev/null || true
server_pid=
rm -f "$META"
trap - EXIT
printf 'cleanup=done\n'
```

## Expected result
proc_fd_link matches socket:[inode], proc_tcp_row_seen=yes, and descriptor_inode_correlation=observed. Descriptor, inode, port, and PID values vary per run.

## Systems lens
Sockets enter the same per-process descriptor table as files and pipes. The inode-like handle in procfs is the join key between a task's open reference and the kernel's network table.

## Optional variation
Rerun the complete lesson and insert `printf 'port_hex=%s\n' "$port_hex"` immediately after
the port_hex assignment. After the tcp_row assignment, print it with `printf '%s\n' "$tcp_row"`
and compare its local endpoint with port_hex while the listener is alive. Retain exact-server
cleanup. /proc/net/tcp uses hexadecimal ports,
so convert before comparing with decimal endpoint output.

The descriptor link identifies a kernel socket held by the recorded process. Closing that
descriptor can end its ownership while the process remains alive. Neither the socket handle nor
the port identifies a successful application exchange; an incident investigation also needs
the owner and request outcome.
