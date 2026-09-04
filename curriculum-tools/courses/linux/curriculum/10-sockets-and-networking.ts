import { code, type Module } from "../../../src/types.ts";

export const SOCKETS: Module = {
  category: "sockets-and-basic-networking",
  title: "Follow loopback sockets from bind to backlog",
  lessons: [
    {
      slug: "create-listening-socket",
      title: "Create and observe a loopback listening socket",
      difficulty: "beginner",
      tags: ["sockets", "tcp", "processes"],
      prerequisites: ["cleanup-with-traps"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 12,
      revision: 2,
      overview:
        code`Bind a short-lived Python server to loopback port 0 and let the kernel choose an unused port. The port file and ss output connect the listening endpoint to a real process while keeping all traffic on this machine.`,
      syntaxBreakdown: code`### In plain terms

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
  - What they give us: cleanup=done says the script completed teardown; it does not claim a request was served.`,
      code: code`
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
`,
      expectedResult:
        code`listener_ready=yes, loopback_port is a nonzero ephemeral port, ss_listener_seen=yes, and listening_socket=observed. The PID, port, and path vary; cleanup=done proves the exact listener was removed.`,
      systemsLens:
        code`bind and listen give a process a kernel endpoint plus an admission queue. The same ownership relationship appears in local services, sidecars, and a node's per-namespace port table.`,
      challenge:
        code`**Predict:** Does ss_listener_seen=yes show that the server accepts a client or only that it owns a listening endpoint?

**Inspect and explain:** Use loopback_port and server_pid to explain which two identities make this listener actionable.

**Vary:** Copy the full lesson into a private run and change only **s.listen(4)** to **s.listen(1)**. Keep the same 127.0.0.1 and port-0 bind plus exact-PID cleanup; it is a bounded local variation, not a claim about a final queue size.

**Hint:** A backlog parameter controls admission policy; it does not add request handling code.

**Apply:** A health check sees LISTEN but requests fail. What request/response evidence would you collect before declaring the service recovered?`,
    },
    {
      slug: "map-port-to-process",
      title: "Map a listening port back to its process and descriptor",
      difficulty: "intermediate",
      tags: ["sockets", "tcp", "file-descriptors", "procfs"],
      prerequisites: ["create-listening-socket"],
      safetyLevel: "read-only",
      runIn: "shell",
      estimatedMinutes: 12,
      revision: 2,
      overview:
        code`Start a listener and correlate three views of the same resource: ss names the port and PID, lsof names the process and socket, and /proc exposes the owning descriptor. This turns a port symptom into an actionable owner.`,
      syntaxBreakdown: code`### In plain terms

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
  - What they give us: no unrelated listener is stopped during diagnosis.`,
      code: code`
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
`,
      expectedResult:
        code`ss_owner_seen=yes, proc_socket_fd_seen=yes, and port_owner_correlation=observed for the exact server PID and ephemeral port. lsof_owner_seen is normally yes but can be no on restricted hosts.`,
      systemsLens:
        code`A socket is owned through a process descriptor, while ss indexes the network endpoint. Incident diagnosis joins these two namespaces of identity instead of treating a port as an anonymous number.`,
      challenge:
        '**Predict:** Which observation survives if lsof is blocked by host policy: ss ownership, procfs descriptor links, or neither?\n\n**Inspect and explain:** Explain why map_port alone cannot identify a process unless it is joined to map_pid or a descriptor.\n\n**Vary:** Rerun the complete lesson and insert ls -l "/proc/$server_pid/fd" immediately after fd_line is collected. Inspect the socket links while the recorded server is still alive.\n\n**Hint:** Use the saved server_pid, never pgrep a broad interpreter name.\n\n**Apply:** A loopback bind reports EADDRINUSE. State the endpoint, process, and descriptor evidence you would collect before stopping any process.',
    },
    {
      slug: "tcp-connection-lifecycle",
      title: "Observe a loopback TCP connection transition",
      difficulty: "intermediate",
      tags: ["sockets", "tcp", "processes"],
      prerequisites: ["create-listening-socket"],
      safetyLevel: "writes-data",
      runIn: "shell",
      sessions: 2,
      estimatedMinutes: 15,
      revision: 3,
      overview:
        code`Keep one loopback client connected while a server has accepted it, then inspect ss from the client session. The endpoint tuple and ESTAB state show that TCP state belongs to a connection, not merely to the listening process.`,
      syntaxBreakdown: code`### In plain terms

Two shell sessions create one local TCP connection and observe it while it exists. A listener is only the future admission point; accept creates a connection with its own state and two endpoint tuples.

### What you are learning

- Session A and Session B coordinate through fixed per-user lab paths because they cannot share a shell PID.
- connect and accept create a connection whose ESTAB sample can be timing-sensitive.
- A successful application exchange is stronger evidence than a single socket-state sample.

### Piece by piece

- **# Session A (blocks until Session B connects)** (a harness step label)
  - What it is: the comment tells the tutor that this session intentionally waits.
  - What it does here: the server accepts one connection, then waits briefly for the client payload.
  - What it gives us: server_status and accepted_connection report actual completion after Session B unblocks it.
- **PORT**, **READY**, and **ACCEPTED** (coordination files)
  - What they are: exact paths under LINUX_LAB containing the ephemeral port, readiness token, and accepted address.
  - What they do here: Session B polls PORT rather than relying on a timing guess.
  - What they give us: both sessions use the same endpoint without wildcard cleanup.
- **socket.connect**, **accept**, **sendall**, and **recv** (TCP operations)
  - What they are: connect starts the client side, accept returns the server-side connection, sendall writes the payload, and recv reads it.
  - What they do here: they make one bounded request-like exchange.
  - What they give us: client_connected and accepted_connection are useful-service evidence; they are not replaced by LISTEN.
- **ss -tn** (a connection-state sample)
  - What it is: ss **-t** selects TCP and **-n** prints numeric tuples.
  - What it does here: grep looks for ESTAB containing the generated port while the client sleeps.
  - What it gives us: established_seen is normally yes, but a no sample is timing evidence, not a universal TCP failure.
- **wait** and the exact-PID traps (cleanup)
  - What they do here: they join the saved server or client and remove fixed files.
  - What they give us: the intentional block cannot leave a listener after the experiment.`,
      code: code`
# Session A (blocks until Session B connects)
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
PORT=$LAB/tcp-port-$UID
READY=$LAB/tcp-ready-$UID
ACCEPTED=$LAB/tcp-accepted-$UID
server_pid=
rm -f "$PORT" "$READY" "$ACCEPTED"
trap 'test -n "$server_pid" && kill "$server_pid" 2>/dev/null || true; test -n "$server_pid" && wait "$server_pid" 2>/dev/null || true; rm -f "$PORT" "$READY" "$ACCEPTED"' EXIT
PORT="$PORT" READY="$READY" ACCEPTED="$ACCEPTED" python3 -u -c 'import os,socket,time
s=socket.socket(); s.bind(("127.0.0.1",0)); s.listen(2); open(os.environ["PORT"],"w").write(str(s.getsockname()[1])); open(os.environ["READY"],"w").write("ready\n"); c,a=s.accept(); open(os.environ["ACCEPTED"],"w").write(a[0]); time.sleep(1); c.recv(32); c.close(); s.close()' &
server_pid=$!
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  [ -s "$PORT" ] && break
  sleep 0.05
done
port=$(cat "$PORT" 2>/dev/null || true)
printf 'server_pid=%s\ntcp_port=%s\nserver_ready=yes\n' "$server_pid" "$port"
wait "$server_pid" 2>/dev/null
server_status=$?
printf 'server_status=%s\naccepted_connection=%s\n' "$server_status" "$(test -s "$ACCEPTED" && echo yes || echo no)"
server_pid=
rm -f "$PORT" "$READY" "$ACCEPTED"
trap - EXIT
printf 'session_a_cleanup=done\n'

# Session B
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
PORT=$LAB/tcp-port-$UID
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  [ -s "$PORT" ] && break
  sleep 0.05
done
port=$(cat "$PORT" 2>/dev/null || true)
LOG=$LAB/tcp-client-$UID-$$.log
python3 -u -c 'import socket,time,sys
s=socket.socket(); s.settimeout(2); s.connect(("127.0.0.1",int(sys.argv[1]))); time.sleep(.35); print("client_connected=yes",flush=True); time.sleep(.35); s.sendall(b"done"); s.close()' "$port" >"$LOG" 2>&1 &
client_pid=$!
sleep .15
state=$(ss -tn 2>/dev/null | grep -E ":$port([[:space:]]|$).*ESTAB|ESTAB.*:$port([[:space:]]|$)" || true)
printf 'client_port=%s\nestablished_seen=%s\n' "$port" "$(test -n "$state" && echo yes || echo no)"
wait "$client_pid" 2>/dev/null
cat "$LOG"
rm -f "$LOG"
printf 'session_b_cleanup=done\n'
`,
      expectedResult:
        code`Session A prints server_ready=yes, server_status=0, and accepted_connection=yes. Session B prints client_connected=yes and usually established_seen=yes; timing can make that sample no, but accepted_connection and clean exits must remain.`,
      systemsLens:
        code`TCP maintains a state machine over a four-tuple of local and remote addresses and ports. A listener creates future connections; each accepted connection has its own state and descriptor lifecycle.`,
      caution:
        code`Run Session A first. Its wait is intentional: Session B supplies the client connection that lets the server finish. Both sessions must share LINUX_LAB.`,
      challenge:
        code`**Predict:** Which result can remain successful if established_seen=no because the sample happened after close?

**Inspect and explain:** Explain why accepted_connection=yes is stronger than seeing a listener before Session B runs.

**Vary:** Copy both sessions into a private rerun and change only Session B's **time.sleep(.35)** before sendall to **time.sleep(.10)**. This keeps all traffic on loopback and tests the timing sensitivity of the ESTAB sample.

**Hint:** Start Session A first and keep the fixed LINUX_LAB paths unchanged.

**Apply:** A service port is open but a client handshake times out. Which endpoint-state and request-completion evidence distinguishes admission from useful service?`,
    },
    {
      slug: "unix-domain-socket",
      title: "Exchange bytes through a pathname UNIX socket",
      difficulty: "intermediate",
      tags: ["sockets", "file-descriptors", "filesystem"],
      prerequisites: ["create-listening-socket"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 12,
      revision: 2,
      overview:
        code`Create a UNIX stream socket at a unique path below the lab, exchange one message, and inspect its filesystem type and ss's UNIX view. Local IPC keeps socket semantics without IP routing.`,
      syntaxBreakdown: code`### In plain terms

This experiment uses a pathname UNIX socket for local interprocess communication. The pathname is a filesystem rendezvous entry, while the socket's bytes still travel through kernel socket queues; no IP route or external interface is involved.

### What you are learning

- AF_UNIX selects the local UNIX socket family and SOCK_STREAM gives ordered byte-stream semantics.
- A socket pathname can be inspected as a filesystem object while the listener is alive.
- bind/listen and connect/accept remain separate from proving the payload arrived.

### Piece by piece

- **socket.AF_UNIX** and **socket.SOCK_STREAM** (Python socket constants)
  - What they are: AF_UNIX selects a local address family; SOCK_STREAM requests connection-oriented stream semantics.
  - What they do here: bind attaches the generated SOCK path and listen(1) waits for one peer.
  - What they give us: the socket cannot contact an IP address.
- **test -S** and **stat -c %F** (filesystem checks)
  - What they are: test **-S** succeeds for a socket entry; stat **-c %F** prints a human filesystem type.
  - What they do here: they inspect the exact generated pathname before connection.
  - What they give us: unix_socket_entry=yes and unix_file_type=socket establish the rendezvous object.
- **ss -xl** (UNIX socket listing)
  - What it is: ss **-x** selects UNIX sockets and **-l** selects listeners.
  - What it does here: grep searches the generated path.
  - What it gives us: ss_unix_seen is corroboration; host formatting may truncate a path.
- **connect**, **sendall**, **accept**, and **recv(64)** (the exchange)
  - What they do here: the client sends one short unix-ping and the server records no more than 64 bytes.
  - What they give us: received=unix-ping and unix_exchange=complete prove a useful local exchange beyond a listener.
- **trap**, **kill**, and **wait** (cleanup)
  - What they do here: stop and reap only server_pid and remove exactly SOCK, READY, and RESULT.`,
      code: code`
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
SOCK=$LAB/unix-$UID-$$.sock
READY=$LAB/unix-ready-$UID-$$
RESULT=$LAB/unix-result-$UID-$$
server_pid=
rm -f "$SOCK" "$READY" "$RESULT"
trap 'test -n "$server_pid" && kill "$server_pid" 2>/dev/null || true; test -n "$server_pid" && wait "$server_pid" 2>/dev/null || true; rm -f "$SOCK" "$READY" "$RESULT"' EXIT
SOCK="$SOCK" READY="$READY" RESULT="$RESULT" python3 -u -c 'import os,socket
s=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM); s.bind(os.environ["SOCK"]); s.listen(1); open(os.environ["READY"],"w").write("ready\n"); c,_=s.accept(); open(os.environ["RESULT"],"w").write(c.recv(64).decode()); c.close(); s.close()' &
server_pid=$!
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  [ -e "$READY" ] && break
  sleep 0.05
done
ss_unix=$(ss -xl 2>/dev/null | grep -F "$SOCK" || true)
printf 'unix_path=%s\nunix_file_type=%s\nunix_socket_entry=%s\nss_unix_seen=%s\n' "$SOCK" "$(stat -c %F "$SOCK" 2>/dev/null || echo missing)" "$(test -S "$SOCK" && echo yes || echo no)" "$(test -n "$ss_unix" && echo yes || echo no)"
SOCK="$SOCK" python3 -c 'import os,socket
s=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM); s.connect(os.environ["SOCK"]); s.sendall(b"unix-ping"); s.close()'
wait "$server_pid" 2>/dev/null
printf 'received=%s\n' "$(cat "$RESULT" 2>/dev/null || true)"
if [ "$(cat "$RESULT" 2>/dev/null || true)" = unix-ping ]; then printf 'unix_exchange=complete\n'; else printf 'unix_exchange=incomplete\n'; fi
server_pid=
rm -f "$SOCK" "$READY" "$RESULT"
trap - EXIT
printf 'cleanup=done\n'
`,
      expectedResult:
        code`unix_file_type=socket, unix_socket_entry=yes, received=unix-ping, unix_exchange=complete, and cleanup=done. ss_unix_seen is normally yes but pathname display can be truncated by the host; the unique socket path is always removed.`,
      systemsLens:
        code`UNIX sockets use descriptor and queue machinery without IP routing. A local agent or supervisor can communicate through a filesystem rendezvous while remaining inside one host boundary.`,
      challenge:
        code`**Predict:** Which is a filesystem object: the UNIX socket pathname, the bytes in its queue, or both?

**Inspect and explain:** Explain why unix_socket_entry=yes does not prove received=unix-ping.

**Vary:** Copy the full lesson into a private rerun, change the client payload from **unix-ping** to **unix-pong**, and change the one received comparison to the same token. It remains a single bounded local message with the existing cleanup.

**Hint:** Keep the generated pathname and cleanup trap; do not reuse a global /tmp socket.

**Apply:** Choose a UNIX or loopback TCP endpoint for a local supervisor and service. Defend the choice using rendezvous visibility and endpoint scope.`,
    },
    {
      slug: "socket-is-a-file-descriptor",
      title: "Correlate a socket descriptor with procfs TCP records",
      difficulty: "advanced",
      tags: ["sockets", "tcp", "file-descriptors", "procfs"],
      prerequisites: ["map-port-to-process"],
      safetyLevel: "read-only",
      runIn: "shell",
      estimatedMinutes: 14,
      revision: 2,
      overview:
        code`Have the server publish its socket descriptor and socket inode shown by /proc/self/fd. From the parent, match that inode to /proc/net/tcp and match the descriptor back to the server PID.`,
      syntaxBreakdown: code`### In plain terms

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
  - What they do here: remove only the server and its metadata file.`,
      code: code`
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
`,
      expectedResult:
        code`proc_fd_link matches socket:[inode], proc_tcp_row_seen=yes, and descriptor_inode_correlation=observed. Descriptor, inode, port, and PID values vary per run.`,
      systemsLens:
        code`Sockets enter the same per-process descriptor table as files and pipes. The inode-like handle in procfs is the join key between a task's open reference and the kernel's network table.`,
      challenge:
        "**Predict:** If the server closes its listening socket but stays alive, which value should disappear first: its socket descriptor link or its PID?\n\n**Inspect and explain:** Explain why socket_inode identifies a kernel object but does not identify a useful application protocol.\n\n**Vary:** Rerun the complete lesson and insert printf 'port_hex=%s\\n' \"$port_hex\" immediately after the port_hex assignment. Compare that hexadecimal value with the selected TCP-table row.\n\n**Hint:** The port in /proc/net/tcp is hexadecimal; do not compare it directly to decimal output.\n\n**Apply:** An incident report has only a TCP-table inode. Describe the additional process and request evidence needed before deciding to restart an owner.",
    },
    {
      slug: "saturate-listen-backlog",
      title: "Turn a small listen backlog into bounded admission pressure",
      difficulty: "advanced",
      tags: ["sockets", "tcp", "troubleshooting"],
      prerequisites: ["tcp-connection-lifecycle"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 16,
      revision: 2,
      overview:
        code`Listen with backlog 1, delay accept, and launch at most eight loopback clients with short timeouts. The bounded burst makes queue pressure visible in ss without changing sysctls or contacting another interface.`,
      syntaxBreakdown: code`### In plain terms

The server delays accept after asking for a small backlog, while eight loopback clients make bounded connection attempts. A backlog is an admission mechanism whose observed queue and admitted/refused split depend on kernel policy and timing; the experiment proves the bounded probe completed, not an exact queue length.

### What you are learning

- listen(1) requests a small accept backlog but the kernel may apply policy and caps.
- A client timeout bounds demand and may represent waiting or refusal, not a universal service capacity.
- Recv-Q is a sample of listener state, not a promised count of all pending work.

### Piece by piece

- **s.listen(1)** and **time.sleep(1.2)** (admission pressure setup)
  - What they are: listen requests backlog one; sleep delays the server's accept loop.
  - What they do here: they create a short interval for bounded client pressure.
  - What they give us: a condition to inspect without changing a host sysctl.
- **for n in 1 ... 8** and **&** (bounded clients)
  - What they are: the loop has eight fixed iterations and ampersand records each asynchronous client PID.
  - What they do here: each client uses settimeout(.25), writes one result file, then closes if admitted.
  - What they give us: clients_total is fixed and the result categories must sum to eight.
- **ss -ltn** and **awk ... {print $2}** (a queue sample)
  - What they are: ss lists numeric TCP listeners; awk prints the listener's Recv-Q column for this port.
  - What they do here: they sample while clients run.
  - What they give us: backlog_recvq_sample may vary or be unavailable; it is not asserted as backlog one.
- **grep -h -c** and **awk sum** (result accounting)
  - What they are: grep counts matching lines in each result file and awk totals the counts.
  - What they do here: they account for every bounded attempt as admitted or timeout-or-refused.
  - What they give us: bounded_backlog_probe=complete is the required completeness claim.
- **trap**, **kill**, and **wait** (cleanup)
  - What they do here: stop and reap exactly server_pid and the recorded client_pids, then remove this run's files.`,
      code: code`
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
RUN_ID=$$
PORT=$LAB/backlog-port-$UID-$RUN_ID
READY=$LAB/backlog-ready-$UID-$RUN_ID
RESULTS=$LAB/backlog-results-$UID-$RUN_ID
server_pid=
client_pids=
rm -f "$PORT" "$READY" "$RESULTS"-*
trap 'test -n "$server_pid" && kill "$server_pid" 2>/dev/null || true; test -n "$server_pid" && wait "$server_pid" 2>/dev/null || true; for p in $client_pids; do kill "$p" 2>/dev/null || true; wait "$p" 2>/dev/null || true; done; rm -f "$PORT" "$READY" "$RESULTS"-*' EXIT
PORT="$PORT" READY="$READY" python3 -u -c 'import os,socket,time
s=socket.socket(); s.bind(("127.0.0.1",0)); s.listen(1); open(os.environ["PORT"],"w").write(str(s.getsockname()[1])); open(os.environ["READY"],"w").write("ready\n"); time.sleep(1.2); s.settimeout(.1)
for _ in range(8):
 try: c,_=s.accept(); c.close()
 except Exception: pass
s.close()' &
server_pid=$!
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  [ -s "$PORT" ] && break
  sleep 0.05
done
port=$(cat "$PORT" 2>/dev/null || true)
printf 'backlog_port=%s\nlistener_before_clients=%s\n' "$port" "$(ss -ltn 2>/dev/null | grep -q -E ":$port([[:space:]]|$)" && echo yes || echo no)"
for n in 1 2 3 4 5 6 7 8; do
  RESULT="$RESULTS-$n" python3 -u -c 'import os,socket,sys,time
try:
 s=socket.socket(); s.settimeout(.25); s.connect(("127.0.0.1",int(sys.argv[1]))); open(os.environ["RESULT"],"w").write("admitted\n"); time.sleep(.2); s.close()
except Exception: open(os.environ["RESULT"],"w").write("timeout-or-refused\n")' "$port" &
  client_pids="$client_pids $!"
done
sleep .2
queue=$(ss -ltn 2>/dev/null | awk -v p=":$port" '$0 ~ p {print $2; exit}')
if [ -z "$queue" ]; then queue=unavailable; fi
printf 'backlog_recvq_sample=%s\n' "$queue"
for p in $client_pids; do wait "$p" 2>/dev/null || true; done
admitted=$(grep -h -c '^admitted' "$RESULTS"-* 2>/dev/null | awk '{s+=$1} END{print s+0}')
rejected=$(grep -h -c '^timeout-or-refused' "$RESULTS"-* 2>/dev/null | awk '{s+=$1} END{print s+0}')
printf 'clients_total=8\nclients_admitted=%s\nclients_timeout_or_refused=%s\n' "$admitted" "$rejected"
if [ $((admitted + rejected)) -eq 8 ]; then printf 'bounded_backlog_probe=complete\n'; else printf 'bounded_backlog_probe=incomplete\n'; fi
wait "$server_pid" 2>/dev/null || true
server_pid=
rm -f "$PORT" "$READY" "$RESULTS"-*
trap - EXIT
printf 'cleanup=done\n'
`,
      expectedResult:
        code`clients_total=8 and clients_admitted plus clients_timeout_or_refused equals 8. listener_before_clients=yes and bounded_backlog_probe=complete are required; queue depth and the admitted/refused split vary by kernel.`,
      systemsLens:
        code`A listen backlog is an admission queue with finite capacity. Under a burst, the queue turns excess demand into waiting, timeout, or refusal—the same backpressure shape seen at service boundaries.`,
      challenge:
        "**Predict:** Must a backlog-1 listener show Recv-Q=1 when eight clients arrive? Explain the policy and timing uncertainty.\n\n**Inspect and explain:** Use the two result totals to show completeness without claiming a fixed admitted/refused split.\n\n**Vary:** Rerun the complete lesson with the shell client loop reduced from 1 2 3 4 5 6 7 8 to 1 2 3 4, clients_total=8 changed to clients_total=4, and the admitted-plus-rejected comparison changed from -eq 8 to -eq 4. Keep all timeouts and cleanup.\n\n**Hint:** Do not change sysctls or add external endpoints.\n\n**Apply:** A service sees connection timeouts under a burst. Which listener, queue, accepted-request, and worker evidence would you gather before choosing a backlog change?",
    },
  ],
};
