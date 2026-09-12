# Exchange bytes through a pathname UNIX socket

slug: unix-domain-socket
category: sockets-and-basic-networking
difficulty: intermediate
tags: sockets, file-descriptors, filesystem
prerequisites: create-listening-socket
safety: writes-data
run-in: shell
sessions: 1
min-version: 5.1
minutes: 12
revision: 2

## Overview
Create a UNIX stream socket at a unique path below the lab, exchange one message, and inspect its filesystem type and ss's UNIX view. Local IPC keeps socket semantics without IP routing.

## Syntax breakdown
### In plain terms

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
  - What they do here: stop and reap only server_pid and remove exactly SOCK, READY, and RESULT.

## Run
```sh
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
```

## Expected result
unix_file_type=socket, unix_socket_entry=yes, received=unix-ping, unix_exchange=complete, and cleanup=done. ss_unix_seen is normally yes but pathname display can be truncated by the host; the unique socket path is always removed.

## Systems lens
UNIX sockets use descriptor and queue machinery without IP routing. A local agent or supervisor can communicate through a filesystem rendezvous while remaining inside one host boundary.

## Optional variation
Copy the full lesson into a private rerun, change the client payload from **unix-ping** to
**unix-pong**, and change the one received comparison to the same token. Keep the generated
pathname and cleanup trap, using one bounded local message.

received becomes unix-pong and unix_exchange remains complete. The socket entry identifies the
filesystem rendezvous, while the received token proves bytes crossed the socket queue; existence
alone cannot establish delivery. Both this pathname socket and loopback TCP support local peers,
with different address and rendezvous identities.
