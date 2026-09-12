# Diagnose and clear a loopback port collision

slug: triage-port-collision
category: troubleshooting-capstones
difficulty: advanced
tags: troubleshooting, sockets, tcp
prerequisites: map-port-to-process
safety: writes-data
run-in: shell
sessions: 1
min-version: 5.1
minutes: 15
revision: 3

## Overview
A replacement listener cannot bind its requested loopback endpoint. Identify the current owner through the endpoint and process views, then stop that exact owner and verify the endpoint becomes reusable. A successful bind proves endpoint availability; the final capstone will also test useful service.

## Syntax breakdown
### In plain terms

An address-in-use error describes a resource conflict, not which process should be stopped. Join the endpoint to its exact owner and validate the intended remedy before treating the error as resolved.

### What you are learning

- A listening socket owns a local address/port combination in its network namespace.
- Intersecting PID and endpoint selectors avoids mistaking another process for the owner.
- Rebinding proves that the original conflict cleared; it does not prove an application accepts and answers requests.

### Piece by piece

- **Lab paths and shell control.** LINUX_LAB selects the directory; the HOME fallback is used only when it is empty. **mkdir -p** creates it idempotently. UID and the shell PID ($$) distinguish this run's names. Quoted expansions keep paths intact. **printf** prints labeled values; **$(...)** captures output, and **$((...))** performs integer arithmetic.
- **Ownership and cleanup.** **&** starts a child and **$!** records its exact PID. **trap ... EXIT** installs cleanup before the child starts. **kill** requests termination and **wait** reaps that child; **|| true** tolerates an already exited child during cleanup. **rm -f** removes only named lab files, and **trap - EXIT** clears the handler after explicit cleanup. Readiness loops use **test/[ ]**, **break**, and **sleep** to wait for observed state within a fixed bound; an assertion failure exits the experiment's subshell, not your terminal.
- **python3 -u -c** launches inline Python with unbuffered output. **socket.socket()** defaults to an IPv4 TCP socket; **bind(("127.0.0.1",0))** asks for a loopback ephemeral port. **listen(1)** starts listening, **getsockname()[1]** retrieves the assigned port, and the helper publishes it to META before a bounded twenty-second sleep.
- **test -s "$META"** requires a nonempty port file; ten **sleep .05** retries wait for readiness. **cat** reads the published port; the shell assertion prevents an empty value from reaching the probe.
- The second Python **bind** attempts the same endpoint. **except OSError** records the numeric errno and text; **finally: s.close()** closes the attempt's socket. On Linux, EADDRINUSE is errno 98. **head -n 1** selects the first result line. **grep -q** tests the result without printing it, and the escaped alternative matches either errno or message.
- **ss -ltnp** asks for listening (**-l**) TCP (**-t**) sockets, numeric addresses (**-n**) and process information (**-p**). **grep -E** matches the exact port followed by whitespace or end of line, avoiding a port-prefix match.
- **lsof -nP -a -p "$owner_pid" -iTCP:"$port" -sTCP:LISTEN** intersects (**-a**) the PID, TCP port and LISTEN filters. **-nP** disables host and port name lookup. **tail -n +2** drops the heading. Permissions can restrict process attribution.
- **ss -ltnp "sport = :$port"** in the variation uses ss’s own source-port filter to select the same listener.
- **kill** and **wait** terminate only the recorded owner. A fresh Python socket then attempts the original endpoint; **rebind=success** is printed only after bind succeeds. A final assertion requires both the original collision and the successful rebind.

## Run
```sh
(
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
RUN_ID=$$
META=$LAB/collision-meta-$UID-$RUN_ID
owner_pid=
rm -f "$META"
trap 'test -n "$owner_pid" && kill "$owner_pid" 2>/dev/null || true; test -n "$owner_pid" && wait "$owner_pid" 2>/dev/null || true; rm -f "$META"' EXIT
META="$META" python3 -u -c 'import os,socket,time
s=socket.socket(); s.bind(("127.0.0.1",0)); s.listen(1); open(os.environ["META"],"w").write(str(s.getsockname()[1])); time.sleep(20)' &
owner_pid=$!
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  [ -s "$META" ] && break
  sleep .05
done
[ -s "$META" ] || exit 1
port=$(cat "$META" 2>/dev/null || true)
collision=$(python3 -c 'import socket,sys
s=socket.socket()
try: s.bind(("127.0.0.1",int(sys.argv[1]))); print("unexpected-bind")
except OSError as e: print("error="+str(e.errno)); print("text="+str(e))
finally: s.close()' "$port" 2>&1)
printf 'collision_port=%s\nsecond_bind_result=%s\neaddrinuse_seen=%s\n' "$port" "$(printf '%s\n' "$collision" | head -n 1)" "$(printf '%s\n' "$collision" | grep -q 'error=98\|Address already in use' && echo yes || echo no)"
ss_owner=$(ss -ltnp 2>/dev/null | grep -E ":$port([[:space:]]|$)" || true)
lsof_owner=$(lsof -nP -a -p "$owner_pid" -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | tail -n +2 || true)
printf 'ss_owner_seen=%s\nlsof_owner_seen=%s\n' "$(test -n "$ss_owner" && echo yes || echo no)" "$(test -n "$lsof_owner" && echo yes || echo no)"
kill "$owner_pid" 2>/dev/null || true
wait "$owner_pid" 2>/dev/null || true
owner_pid=
rebind=$(python3 -c 'import socket,sys
s=socket.socket(); s.bind(("127.0.0.1",int(sys.argv[1]))); print("rebind=success"); s.close()' "$port" 2>&1 || true)
printf '%s\n' "$rebind"
if printf '%s\n' "$collision" | grep -q 'error=98\|Address already in use' && printf '%s\n' "$rebind" | grep -q 'rebind=success'; then printf 'port_collision_remediated=yes\n'; else printf 'port_collision_remediated=partial\n'; fi
printf '%s\n' "$collision" | grep -q 'error=98' || exit 1
printf '%s\n' "$rebind" | grep -q 'rebind=success' || exit 1
rm -f "$META"
trap - EXIT
printf 'cleanup=done\n'
)
```

## Expected result
The second bind reports error=98 and eaddrinuse_seen=yes. ss_owner_seen=yes and normally lsof_owner_seen=yes identify the listener; permissions may limit those views. After the recorded owner is stopped and reaped, rebind=success and port_collision_remediated=yes prove the conflict cleared. No request/response availability claim is made.

## Systems lens
A resource error becomes actionable when identity maps to an owner. Port collision response follows the same observe, join, remediate, and verify pattern as leaked files or mounts.

## Optional variation
Replace the first **s.listen(1)** with **s.listen(4)** and rerun. Before termination, run
**ss -ltnp "sport = :$port"** to narrow the socket view. Keep the exact-owner shutdown, rebind
probe and cleanup; the lsof command independently intersects that PID and endpoint.

A larger backlog leaves exclusive endpoint ownership unchanged. The second bind still reports
EADDRINUSE, and rebind succeeds after the owner exits. Neither LISTEN nor successful bind proves
application responses. For a deployment conflict, process identity and configuration distinguish
an old instance from an unrelated service before choosing a remedy.
