# Observe a loopback TCP connection transition

slug: tcp-connection-lifecycle
category: sockets-and-basic-networking
difficulty: intermediate
tags: sockets, tcp, processes
prerequisites: create-listening-socket
safety: writes-data
run-in: shell
sessions: 2
min-version: 5.1
minutes: 15
revision: 3

## Overview
Keep one loopback client connected while a server has accepted it, then inspect ss from the client session. The endpoint tuple and ESTAB state show that TCP state belongs to a connection, not merely to the listening process.

## Syntax breakdown
### In plain terms

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
  - What they give us: the intentional block cannot leave a listener after the experiment.

## Caution
Run Session A first. Its wait is intentional: Session B supplies the client connection that lets the server finish. Both sessions must share LINUX_LAB.

## Run
```sh
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
```

## Expected result
Session A prints server_ready=yes, server_status=0, and accepted_connection=yes. Session B prints client_connected=yes and usually established_seen=yes; timing can make that sample no, but accepted_connection and clean exits must remain.

## Systems lens
TCP maintains a state machine over a four-tuple of local and remote addresses and ports. A listener creates future connections; each accepted connection has its own state and descriptor lifecycle.

## Optional variation
**Predict:** Which result can remain successful if established_seen=no because the sample happened after close?

**Inspect and explain:** Explain why accepted_connection=yes is stronger than seeing a listener before Session B runs.

**Vary:** Copy both sessions into a private rerun and change only Session B's **time.sleep(.35)** before sendall to **time.sleep(.10)**. This keeps all traffic on loopback and tests the timing sensitivity of the ESTAB sample.

**Hint:** Start Session A first and keep the fixed LINUX_LAB paths unchanged.

**Apply:** A service port is open but a client handshake times out. Which endpoint-state and request-completion evidence distinguishes admission from useful service?
