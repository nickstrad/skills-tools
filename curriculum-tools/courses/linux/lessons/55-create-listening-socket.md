# Create and observe a loopback listening socket

slug: create-listening-socket
category: sockets-and-basic-networking
difficulty: beginner
tags: sockets, tcp, processes
prerequisites: cleanup-with-traps
safety: writes-data
run-in: shell
sessions: 1
min-version: 5.1
minutes: 12
revision: 2

## Overview
Bind a short-lived Python server to loopback port 0 and let the kernel choose an unused port. The port file and ss output connect the listening endpoint to a real process while keeping all traffic on this machine.

## Syntax breakdown
### In plain terms

The server creates a TCP listener on loopback, the address that reaches only this machine, and asks the kernel for an unused port. A listener proves that a process owns a kernel endpoint; it does not by itself prove that the process can complete a useful request.

### What you are learning

- bind chooses an address and port; port 0 delegates the port choice to the kernel.
- listen creates an admission point for future connections, separate from accepting and serving them.
- A recorded PID and a cleanup trap make endpoint teardown attributable.

### Piece by piece

- **python3 -u -c** (an unbuffered short-lived server)
  - What it is: Python **-u** flushes output and **-c** runs the quoted program.
  - What it does here: socket(), bind((127.0.0.1,0)), and listen(4) create one loopback listener and publish its chosen port.
  - What it gives us: PORT_FILE is the exact endpoint identity to inspect, rather than a guessed port.
- **127.0.0.1** and **0** (the bind address and port)
  - What they are: the loopback IPv4 address stays local; port zero requests ephemeral allocation.
  - What they do here: they avoid external traffic and collision-prone fixed ports.
  - What they give us: loopback_port is nonzero only after bind succeeds.
- **ss -ltn** (a socket-state listing)
  - What it is: ss lists sockets; **-l** limits to listeners, **-t** to TCP, and **-n** preserves numeric addresses and ports.
  - What it does here: grep selects the generated port.
  - What it gives us: ss_listener_seen confirms kernel listener state, while listener_ready confirms the server published its endpoint.
- **trap**, **kill**, and **wait** (exact cleanup)
  - What they are: EXIT trap runs on shell exit, kill targets the saved PID, and wait reaps that exact child.
  - What they do here: they remove the listener even if inspection fails.
  - What they give us: cleanup=done says the script completed teardown; it does not claim a request was served.

## Run
```sh
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
RUN_ID=$$
PORT_FILE=$LAB/socket-port-$UID-$RUN_ID
READY=$LAB/socket-ready-$UID-$RUN_ID
server_pid=
rm -f "$PORT_FILE" "$READY"
trap 'test -n "$server_pid" && kill "$server_pid" 2>/dev/null || true; test -n "$server_pid" && wait "$server_pid" 2>/dev/null || true; rm -f "$PORT_FILE" "$READY"' EXIT
PORT_FILE="$PORT_FILE" READY="$READY" python3 -u -c 'import os,socket,time
s=socket.socket(); s.bind(("127.0.0.1",0)); s.listen(4); open(os.environ["PORT_FILE"],"w").write(str(s.getsockname()[1])); open(os.environ["READY"],"w").write("ready\n"); time.sleep(4); s.close()' &
server_pid=$!
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  [ -s "$PORT_FILE" ] && break
  sleep 0.05
done
port=$(cat "$PORT_FILE" 2>/dev/null || true)
listener=$(ss -ltn 2>/dev/null | grep -E ":$port([[:space:]]|$)" || true)
printf 'server_pid=%s\nloopback_port=%s\nlistener_ready=%s\nss_listener_seen=%s\n' "$server_pid" "$port" "$(test -s "$PORT_FILE" && echo yes || echo no)" "$(test -n "$listener" && echo yes || echo no)"
if [ -n "$port" ] && [ -n "$listener" ]; then printf 'listening_socket=observed\n'; else printf 'listening_socket=not-observed\n'; fi
kill "$server_pid" 2>/dev/null || true
wait "$server_pid" 2>/dev/null || true
server_pid=
rm -f "$PORT_FILE" "$READY"
trap - EXIT
printf 'cleanup=done\n'
```

## Expected result
listener_ready=yes, loopback_port is a nonzero ephemeral port, ss_listener_seen=yes, and listening_socket=observed. The PID, port, and path vary; cleanup=done proves the exact listener was removed.

## Systems lens
bind and listen give a process a kernel endpoint plus an admission queue. The same ownership relationship appears in local services, sidecars, and a node's per-namespace port table.

## Optional variation
**Predict:** Does ss_listener_seen=yes show that the server accepts a client or only that it owns a listening endpoint?

**Inspect and explain:** Use loopback_port and server_pid to explain which two identities make this listener actionable.

**Vary:** Copy the full lesson into a private run and change only **s.listen(4)** to **s.listen(1)**. Keep the same 127.0.0.1 and port-0 bind plus exact-PID cleanup; it is a bounded local variation, not a claim about a final queue size.

**Hint:** A backlog parameter controls admission policy; it does not add request handling code.

**Apply:** A health check sees LISTEN but requests fail. What request/response evidence would you collect before declaring the service recovered?
