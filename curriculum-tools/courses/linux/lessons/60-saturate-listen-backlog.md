# Turn a small listen backlog into bounded admission pressure

slug: saturate-listen-backlog
category: sockets-and-basic-networking
difficulty: advanced
tags: sockets, tcp, troubleshooting
prerequisites: tcp-connection-lifecycle
safety: writes-data
run-in: shell
sessions: 1
min-version: 5.1
minutes: 16
revision: 2

## Overview
Listen with backlog 1, delay accept, and launch at most eight loopback clients with short timeouts. The bounded burst makes queue pressure visible in ss without changing sysctls or contacting another interface.

## Syntax breakdown
### In plain terms

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
  - What they do here: stop and reap exactly server_pid and the recorded client_pids, then remove this run's files.

## Run
```sh
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
```

## Expected result
clients_total=8 and clients_admitted plus clients_timeout_or_refused equals 8. listener_before_clients=yes and bounded_backlog_probe=complete are required; queue depth and the admitted/refused split vary by kernel.

## Systems lens
A listen backlog is an admission queue with finite capacity. Under a burst, the queue turns excess demand into waiting, timeout, or refusal—the same backpressure shape seen at service boundaries.

## Optional variation
Rerun the complete lesson with the shell client loop reduced from1 2 3 4 5 6 7 8 to1 2 3 4,
clients_total=8 changed to clients_total=4, and the admitted-plus-rejected comparison changed
from -eq 8 to -eq 4. Keep the server loop, all timeouts, loopback endpoint and cleanup unchanged.

The admitted and timeout-or-refused results must now sum to4. The split and Recv-Q sample remain
dependent on timing and kernel policy; backlog1 does not require a sampled queue of exactly1.
Diagnosing burst timeouts needs listener and queue state together with accepted-request progress
and worker evidence before choosing an admission change.
