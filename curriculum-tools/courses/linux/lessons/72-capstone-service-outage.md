# Diagnose and recover a multi-symptom lab service

slug: capstone-service-outage
category: troubleshooting-capstones
difficulty: advanced
tags: troubleshooting, sockets, file-descriptors, processes, filesystem
prerequisites: process-states, signal-disposition, triage-cpu-saturation, triage-memory-growth, triage-fd-leak, triage-deleted-file-space, triage-port-collision
safety: writes-data
run-in: shell
sessions: 1
min-version: 5.1
minutes: 30
revision: 2

## Overview
A loopback service still has a listening socket, but a bounded health request receives no answer. Its stopped process also holds a deleted log and several open files. Correlate process state, endpoint ownership and the request result, resume the same process, then verify a correct reply before separate resource teardown.

## Syntax breakdown
### In plain terms

A live process and a listening socket do not guarantee useful work. This incident distinguishes a stalled request path from retained resources, then tests recovery with a real response before shutting the service down.

### What you are learning

- Process state, endpoint ownership and request results describe different layers of availability.
- A stopped process keeps its descriptors and listening socket; the kernel can complete connection setup while userspace cannot answer.
- Open files and a deleted log are ownership evidence, but their presence alone does not explain the request timeout.
- Recovery means the expected reply arrives again; teardown means the exact process and its resources are released.

### Piece by piece

- **Lab paths and shell control.** LINUX_LAB selects the directory; the HOME fallback is used only when it is empty. **mkdir -p** creates it idempotently. UID and the shell PID ($$) distinguish this run's names. Quoted expansions keep paths intact. **printf** prints labeled values; **$(...)** captures output, and **$((...))** performs integer arithmetic.
- **Ownership and cleanup.** **&** starts a child and **$!** records its exact PID. **trap ... EXIT** installs cleanup before the child starts. **kill** requests termination and **wait** reaps that child; **|| true** tolerates an already exited child during cleanup. **rm -f** removes only named lab files, and **trap - EXIT** clears the handler after explicit cleanup. Readiness loops use **test/[ ]**, **break**, and **sleep** to wait for observed state within a fixed bound; an assertion failure exits the experiment's subshell, not your terminal.
- **BASE**, **META** and **LOG** name run-specific resources. **cleanup_service** is a shell function; **kill -CONT** first resumes a stopped helper so **kill -TERM** can run its handler. It then waits and removes the twelve exact file names with **seq 1 12**. The fifteen-second watchdog bounds a stopped service; it too has a recorded PID and cleanup.
- The supplied **python3 -u -c** helper installs a **signal.SIGTERM** handler that sets **stop**. Twelve file objects remain in **handles**; a one-MiB log is flushed and unlinked while its descriptor remains open. **socket.bind** selects an ephemeral loopback port, **listen(4)** enables a small queue, and **settimeout(.1)** lets the accept loop check shutdown. The monotonic twenty-second deadline bounds normal execution.
- **with open(META,"w")** closes the port record before readiness is observed. **test -s** waits for nonempty metadata. Each accepted connection has a **.2-second timeout**; **readline(64)** bounds the request line and handles TCP short reads. **sendall** sends all response bytes. A ping line receives an ok:ping line; other requests receive bad-request. **finally** closes sockets and files and removes the twelve names.
- **probe_service** runs the quoted PROBE here-document using **python3 - "$port"**. **socket.create_connection(...,timeout=.3)** bounds connection and response waiting. It sends ping, reads at most 64 bytes, compares the complete reply, and distinguishes healthy, timeout, wrong-response and socket-error. A connected socket alone is insufficient.
- **kill -STOP** injects a reversible stop; **ps -o stat= -p PID**, **tr -d ' '** and **cut -c1** isolate its state letter. A bounded loop requires **T** before probing. In the investigation view, **ps -o pid=,stat=,pcpu=,time=** shows identity, state, lifetime CPU fraction and accumulated CPU time.
- **ss -ltnp "sport = :$port"** filters the listening TCP endpoint by source port and requests numeric addresses and owner information. **find /proc/PID/fd -mindepth 1 -maxdepth 1 | wc -l** counts that task's descriptors. **lsof -nP -a -p PID +L1** intersects the exact PID and zero-link files, and **grep -F "$LOG"** selects this deleted log.
- **kill -CONT** resumes the stopped service. A second real ping must receive the correct reply from the same endpoint. Only afterward does **kill -TERM** request graceful shutdown; **wait** supplies its exit status. **ss -H -ltn** suppresses headings for the empty-listener check. Exact file absence, an absent process and zero status independently verify teardown.

## Caution
Use only this experiment's exact PID and loopback port. The service holds twelve tiny files and a one-MiB deleted log. The watchdog resumes and terminates its recorded process after fifteen seconds; the normal helper deadline is twenty seconds. Run the supplied sections promptly, or restart the full bounded experiment for more investigation time. Never send signals to a PID selected only by a matching process name.

## Run
```sh
(
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
BASE=$LAB/capstone-$UID-$$
META=$BASE.port
LOG=$BASE.log
service_pid=
cleanup_service() {
  if [ -n "$service_pid" ]; then
    kill -CONT "$service_pid" 2>/dev/null || true
    kill -TERM "$service_pid" 2>/dev/null || true
    wait "$service_pid" 2>/dev/null || true
  fi
  for n in $(seq 1 12); do rm -f "$BASE.fd-$n"; done
  rm -f "$META" "$LOG"
}
trap cleanup_service EXIT
rm -f "$META" "$LOG"
BASE="$BASE" META="$META" LOG="$LOG" python3 -u -c 'import os,signal,socket,time
stop=False
def halt(sig,frame):
 global stop
 stop=True
signal.signal(signal.SIGTERM,halt)
handles=[open(os.environ["BASE"]+".fd-%d"%n,"w") for n in range(1,13)]
log=open(os.environ["LOG"],"w+")
log.write("x"*1048576); log.flush(); os.unlink(os.environ["LOG"])
s=socket.socket(); s.bind(("127.0.0.1",0)); s.listen(4); s.settimeout(.1)
with open(os.environ["META"],"w") as meta: meta.write(str(s.getsockname()[1]))
deadline=time.monotonic()+20
try:
 while not stop and time.monotonic()<deadline:
  try: c,_=s.accept()
  except socket.timeout: continue
  with c:
   c.settimeout(.2)
   try:
    request=c.makefile("rb").readline(64)
    c.sendall(b"ok:ping\n" if request==b"ping\n" else b"bad-request\n")
   except OSError: pass
finally:
 s.close(); log.close()
 for f in handles: f.close(); os.unlink(f.name)' &
service_pid=$!
# A watchdog also resumes a stopped task before requesting shutdown.
# The EXIT trap terminates only PIDs started by this experiment.
watchdog_pid=
python3 - "$service_pid" <<'WATCHDOG' &
import os,signal,sys,time
time.sleep(15)
try:
    os.kill(int(sys.argv[1]),signal.SIGCONT)
    os.kill(int(sys.argv[1]),signal.SIGTERM)
except ProcessLookupError:
    pass
WATCHDOG
watchdog_pid=$!
trap 'kill "$watchdog_pid" 2>/dev/null || true; wait "$watchdog_pid" 2>/dev/null || true; cleanup_service' EXIT
for attempt in $(seq 1 100); do [ -s "$META" ] && break; sleep .02; done
[ -s "$META" ] || exit 1
port=$(cat "$META")
probe_service() {
  python3 - "$port" <<'PROBE'
import socket,sys
try:
    with socket.create_connection(('127.0.0.1',int(sys.argv[1])),timeout=.3) as c:
        c.sendall(b'ping\n')
        reply=c.makefile('rb').readline(64)
        print('healthy' if reply==b'ok:ping\n' else 'wrong-response')
except TimeoutError:
    print('timeout')
except OSError as e:
    print('socket-error:%s'%e.errno)
PROBE
}
baseline=$(probe_service)
printf 'baseline_response=%s\n' "$baseline"
[ "$baseline" = healthy ] || exit 1
# Stop the service to suspend its request handling while retaining kernel resources.
kill -STOP "$service_pid"
for attempt in $(seq 1 100); do
  state=$(ps -o stat= -p "$service_pid" | tr -d ' ' | cut -c1)
  [ "$state" = T ] && break
  sleep .01
done
[ "$state" = T ] || exit 1
failed=$(probe_service)
printf 'incident_response=%s\nservice_pid=%s\nport=%s\n' "$failed" "$service_pid" "$port"
# Correlate the stopped process with its listener, descriptors and deleted log.
ps -o pid=,stat=,pcpu=,time= -p "$service_pid"
listener=$(ss -ltnp "sport = :$port")
printf '%s\n' "$listener"
fd_count=$(find "/proc/$service_pid/fd" -mindepth 1 -maxdepth 1 | wc -l)
deleted=$(lsof -nP -a -p "$service_pid" +L1 | grep -F "$LOG" || true)
printf 'service_state=%s\nretained_fd_count=%s\ndeleted_log_seen=%s\n' "$state" "$fd_count" "$(test -n "$deleted" && echo yes || echo no)"
[ "$failed" = timeout ] && [ "$fd_count" -ge 16 ] && [ -n "$deleted" ] || exit 1
printf '%s\n' "$listener" | grep -q LISTEN || exit 1
# Intervention and availability proof, without destroying the process or endpoint.
kill -CONT "$service_pid"
recovered=$(probe_service)
printf 'recovered_response=%s\n' "$recovered"
[ "$recovered" = healthy ] || exit 1
printf 'service_available_again=yes\n'
# Teardown is a separate postcondition from availability.
kill -TERM "$service_pid"
service_status=0
wait "$service_pid" || service_status=$?
[ "$service_status" -eq 0 ] && [ ! -d "/proc/$service_pid" ] || exit 1
service_pid=
kill "$watchdog_pid" 2>/dev/null || true
wait "$watchdog_pid" 2>/dev/null || true
remaining_files=0
for n in $(seq 1 12); do [ ! -e "$BASE.fd-$n" ] || remaining_files=$((remaining_files+1)); done
remaining_listener=$(ss -H -ltn "sport = :$port")
printf 'graceful_exit_status=%s\nremaining_service_files=%s\nremaining_listener=%s\n' "$service_status" "$remaining_files" "$(test -n "$remaining_listener" && echo yes || echo no)"
[ "$remaining_files" -eq 0 ] && [ -z "$remaining_listener" ] || exit 1
cleanup_service
trap - EXIT
printf 'cleanup=verified\n'
)
```

## Expected result
baseline_response=healthy establishes useful service. During the incident, incident_response=timeout, service_state=T, a LISTEN row, retained_fd_count at least 16, and deleted_log_seen=yes coexist. These distinguish a stopped request handler from missing endpoint ownership; the descriptor count is a fixed working set, not evidence of a growing leak. After the intervention, recovered_response=healthy and service_available_again=yes prove a correct response at the same endpoint. After separate teardown, graceful_exit_status=0, remaining_service_files=0, remaining_listener=no and cleanup=verified prove release. This is a reversible process-stop incident, not a crash-durability or sustained-load benchmark.

## Systems lens
Availability is an end-to-end property: retained kernel objects and connection setup are weaker evidence than a correct application response. Separate causal diagnosis, service recovery and resource teardown so one success cannot stand in for the others.

## Optional variation
Rerun with **range(1,13)** changed to **range(1,7)** in the helper and the minimum descriptor
assertion changed from16 to10. Keep the cleanup loops, watchdog, request probes and signal
sequence unchanged. During investigation, before CONT, the existing views can also be read with
**ps -o pid,stat,time -p "$service_pid"**, **ss -ltnp "sport = :$port"**, and
**lsof -nP -a -p "$service_pid" +L1**, using the exact saved PID and port.

Six retained files reduce the fixed descriptor set but do not restore responses while the process
is stopped. The incident still has stateT, LISTEN and a timed-out health request. CONT restores
the correct reply from the same endpoint; TERM and the final checks then verify separate teardown.
The deleted log and open files establish ownership, while the controlled stop/continue comparison
explains this outage. Sustained-load and crash-recovery tests would be separate experiments before
making capacity or durability claims.
