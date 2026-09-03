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
      overview:
        code`Bind a short-lived Python server to loopback port 0 and let the kernel choose an unused port. The port file and ss output connect the listening endpoint to a real process while keeping all traffic on this machine.`,
      syntaxBreakdown:
        code`Python socket.bind and listen create a TCP endpoint; port 0 requests ephemeral allocation; ss -ltn filters TCP listeners; trap and kill clean up the exact server PID.`,
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
      overview:
        code`Start a listener and correlate three views of the same resource: ss names the port and PID, lsof names the process and socket, and /proc exposes the owning descriptor. This turns a port symptom into an actionable owner.`,
      syntaxBreakdown:
        code`ss -ltnp shows listening TCP ownership; lsof -nP -a -p restricts inspection to one PID; readlink /proc/PID/fd resolves descriptor targets; grep scopes observations to this port.`,
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
      revision: 2,
      overview:
        code`Keep one loopback client connected while a server has accepted it, then inspect ss from the client session. The endpoint tuple and ESTAB state show that TCP state belongs to a connection, not merely to the listening process.`,
      syntaxBreakdown:
        code`Python accept and connect create endpoints; ss -tn lists TCP state; fixed per-user file names let Session B poll an exact path; wait and exact-PID traps bound the server lifetime.`,
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
      overview:
        code`Create a UNIX stream socket at a unique path below the lab, exchange one message, and inspect its filesystem type and ss's UNIX view. Local IPC keeps socket semantics without IP routing.`,
      syntaxBreakdown:
        code`AF_UNIX and bind create a pathname socket; test -S identifies its filesystem entry; ss -xl lists UNIX listeners; connect and accept exchange a bounded payload.`,
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
      overview:
        code`Have the server publish its socket descriptor and socket inode shown by /proc/self/fd. From the parent, match that inode to /proc/net/tcp and match the descriptor back to the server PID.`,
      syntaxBreakdown:
        code`os.readlink resolves a descriptor link; socket.fileno returns its number; printf converts the port to hexadecimal; /proc/net/tcp stores hexadecimal local endpoints.`,
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
      overview:
        code`Listen with backlog 1, delay accept, and launch at most eight loopback clients with short timeouts. The bounded burst makes queue pressure visible in ss without changing sysctls or contacting another interface.`,
      syntaxBreakdown:
        code`listen(1) sets a small admission queue; socket.settimeout bounds each client; ss -ltn exposes Recv-Q; wait joins exact PIDs; trap removes this run's files.`,
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
    },
  ],
};
