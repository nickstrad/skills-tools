import { code, type Module } from "../../../src/types.ts";

export const CAPSTONES: Module = {
  category: "troubleshooting-capstones",
  title: "Correlate kernel evidence during bounded incidents",
  lessons: [
    {
      slug: "triage-cpu-saturation",
      title: "Triage bounded CPU saturation",
      difficulty: "advanced",
      tags: ["troubleshooting", "scheduling", "processes"],
      prerequisites: ["change-scheduling-priority", "pin-cpu-affinity"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 16,
      overview:
        code`Launch two exact, bounded CPU workers and correlate process CPU time, runnable counts, and load evidence before stopping them. The incident is local to this shell and lasts only long enough to make demand visible.`,
      syntaxBreakdown:
        code`ps -o pid,pcpu,time reports task consumption; /proc/loadavg supplies runnable/total counts; vmstat samples run-queue evidence; kill and wait stop only recorded workers.`,
      code: code`
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
PIDS=$LAB/cpu-pids-$UID-$$
worker_pids=
rm -f "$PIDS"
trap 'for p in $worker_pids; do kill "$p" 2>/dev/null || true; wait "$p" 2>/dev/null || true; done; rm -f "$PIDS"' EXIT
for n in 1 2; do
  (while :; do :; done) &
  worker_pids="$worker_pids $!"
  printf '%s\n' "$!" >> "$PIDS"
done
sleep .6
printf 'workers_started=2\nworker_pids=%s\n' "$(tr '\n' ' ' < "$PIDS")"
ps -o pid=,pcpu=,time=,comm= -p $(tr '\n' ',' < "$PIDS" | sed 's/,$//') 2>/dev/null | sed 's/^/ps_worker=/'
runnable=$(awk '{print $4}' /proc/loadavg | cut -d/ -f1)
printf 'runnable_count=%s\nloadavg_1m=%s\n' "$runnable" "$(awk '{print $1}' /proc/loadavg)"
printf 'vmstat_sample=%s\n' "$(vmstat 1 2 2>/dev/null | tail -n 1 || true)"
cpu_time_sample=$(ps -o time= -p $(head -n 1 "$PIDS") 2>/dev/null | tr -d ' ')
printf 'cpu_time_sample=%s\n' "$cpu_time_sample"
if [ -n "$cpu_time_sample" ] && [ -n "$runnable" ]; then printf 'cpu_saturation_evidence=correlated\n'; else printf 'cpu_saturation_evidence=partial\n'; fi
for p in $worker_pids; do kill "$p" 2>/dev/null || true; done
for p in $worker_pids; do wait "$p" 2>/dev/null || true; done
worker_pids=
printf 'workers_after_stop=%s\n' "$(for p in $(cat "$PIDS"); do test -d "/proc/$p" && echo surviving || true; done | wc -l)"
rm -f "$PIDS"
trap - EXIT
printf 'cleanup=done\n'
`,
      expectedResult:
        code`workers_started=2, worker_pids lists two exact PIDs, ps_worker lines and runnable_count are present, and cpu_saturation_evidence=correlated. workers_after_stop=0 and cleanup=done prove recovery; load and CPU time vary.`,
      systemsLens:
        code`CPU incidents require correlating demand, per-task service time, and queueing. Identify owners before changing scheduling or capacity.`,
    },
    {
      slug: "triage-memory-growth",
      title: "Triage bounded anonymous memory growth",
      difficulty: "advanced",
      tags: ["troubleshooting", "virtual-memory", "resource-limits"],
      prerequisites: ["observe-page-faults", "enforce-cgroup-budget"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 17,
      overview:
        code`Grow one helper's anonymous memory to 64 MiB in page-touching steps, then compare free memory, pmap, procfs RSS, and the cgroup current counter. Bounded growth demonstrates how to localize ownership before remediation.`,
      syntaxBreakdown:
        code`Python bytearray and page writes allocate anonymous pages; free -b reports memory; pmap -x summarizes mappings; /proc/PID/status and memory.current expose process and cgroup views.`,
      code: code`
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
RUN_ID=$$
READY=$LAB/memory-ready-$UID-$RUN_ID
STATUS=$LAB/memory-status-$UID-$RUN_ID
memory_pid=
rm -f "$READY" "$STATUS"
trap 'test -n "$memory_pid" && kill "$memory_pid" 2>/dev/null || true; test -n "$memory_pid" && wait "$memory_pid" 2>/dev/null || true; rm -f "$READY" "$STATUS"' EXIT
READY="$READY" STATUS="$STATUS" python3 -u -c 'import os,time
buf=[]; open(os.environ["READY"],"w").write("ready\n")
for step in range(1,5):
 b=bytearray(16*1024*1024)
 for i in range(0,len(b),4096): b[i]=1
 buf.append(b); open(os.environ["STATUS"],"w").write("allocated_mib=%d\n"%(step*16)); time.sleep(.12)
time.sleep(4)' &
memory_pid=$!
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do
  [ -s "$STATUS" ] && grep -q 'allocated_mib=64' "$STATUS" && break
  sleep .1
done
rss=$(awk '/VmRSS:/{print $2" "$3}' "/proc/$memory_pid/status" 2>/dev/null || true)
vsz=$(awk '/VmSize:/{print $2" "$3}' "/proc/$memory_pid/status" 2>/dev/null || true)
pmap_total=$(pmap -x "$memory_pid" 2>/dev/null | grep '^total' || true)
printf 'memory_pid=%s\nallocation=%s\nproc_rss=%s\nproc_vsz=%s\nfree_available=%s\npmap_total_seen=%s\n' "$memory_pid" "$(cat "$STATUS" 2>/dev/null || echo unavailable)" "$rss" "$vsz" "$(free -b | awk '/Mem:/{print $7}' 2>/dev/null || echo unavailable)" "$(test -n "$pmap_total" && echo yes || echo no)"
cgroup_mount=$(findmnt -n -t cgroup2 -o TARGET 2>/dev/null | head -n 1)
cgroup_rel=$(awk -F: '$1=="0"{print $3}' "/proc/$memory_pid/cgroup" 2>/dev/null)
cgroup_current=$cgroup_mount$cgroup_rel/memory.current
if [ -r "$cgroup_current" ]; then printf 'cgroup_memory_current=%s\n' "$(cat "$cgroup_current")"; else printf 'cgroup_memory_current=unavailable\n'; fi
if grep -q 'allocated_mib=64' "$STATUS" && [ -n "$rss" ] && [ -n "$vsz" ]; then printf 'memory_growth_correlated=yes\n'; else printf 'memory_growth_correlated=partial\n'; fi
kill "$memory_pid" 2>/dev/null || true
wait "$memory_pid" 2>/dev/null || true
memory_pid=
rm -f "$READY" "$STATUS"
trap - EXIT
printf 'cleanup=done\n'
`,
      expectedResult:
        code`allocation=allocated_mib=64, proc_rss and proc_vsz are present, pmap_total_seen=yes on normal procfs, and memory_growth_correlated=yes. free and cgroup values vary; cleanup=done proves the helper stopped.`,
      systemsLens:
        code`Memory diagnosis needs multiple accounting layers: a process owns RSS and mappings, while host and cgroup account availability and charges. Correlation separates local growth from global pressure.`,
    },
    {
      slug: "triage-fd-leak",
      title: "Triage a bounded file-descriptor leak",
      difficulty: "advanced",
      tags: ["troubleshooting", "file-descriptors", "procfs"],
      prerequisites: ["inherited-open-files", "limit-open-files"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 15,
      overview:
        code`Have one helper open 48 lab files and hold them, then compare the /proc descriptor count with lsof output. Exact PID and file naming expose ownership without approaching the host limit.`,
      syntaxBreakdown:
        code`Python open keeps descriptors live; find /proc/PID/fd counts them; lsof -p lists ownership; a bounded loop creates only 48 files and an exact-PID trap reaps the helper.`,
      code: code`
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
RUN_ID=$$
PREFIX=$LAB/fd-leak-$UID-$RUN_ID
READY=$LAB/fd-leak-ready-$UID-$RUN_ID
COUNT=$LAB/fd-leak-count-$UID-$RUN_ID
leak_pid=
rm -f "$READY" "$COUNT"
trap 'test -n "$leak_pid" && kill "$leak_pid" 2>/dev/null || true; test -n "$leak_pid" && wait "$leak_pid" 2>/dev/null || true; for n in $(seq 1 48); do rm -f "$PREFIX-$n"; done; rm -f "$READY" "$COUNT"' EXIT
PREFIX="$PREFIX" READY="$READY" COUNT="$COUNT" python3 -u -c 'import os,time
files=[]; open(os.environ["READY"],"w").write("ready\n")
for n in range(1,49):
 f=open(os.environ["PREFIX"]+"-%d"%n,"w"); f.write("fd-%d\n"%n); f.flush(); files.append(f)
open(os.environ["COUNT"],"w").write("open_count=48\n"); time.sleep(4)' &
leak_pid=$!
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  [ -s "$COUNT" ] && break
  sleep .05
done
proc_count=$(find "/proc/$leak_pid/fd" -mindepth 1 -maxdepth 1 2>/dev/null | wc -l)
lsof_count=$(lsof -nP -p "$leak_pid" 2>/dev/null | tail -n +2 | wc -l)
printf 'leak_pid=%s\ndeclared_open_count=%s\nproc_fd_count=%s\nlsof_fd_rows=%s\n' "$leak_pid" "$(cat "$COUNT" 2>/dev/null || echo unavailable)" "$proc_count" "$lsof_count"
if [ "$proc_count" -ge 48 ] && [ "$lsof_count" -ge 48 ]; then printf 'fd_leak_correlated=yes\n'; else printf 'fd_leak_correlated=partial\n'; fi
kill "$leak_pid" 2>/dev/null || true
wait "$leak_pid" 2>/dev/null || true
leak_pid=
for n in $(seq 1 48); do rm -f "$PREFIX-$n"; done
rm -f "$READY" "$COUNT"
trap - EXIT
printf 'cleanup=done\n'
`,
      expectedResult:
        code`declared_open_count=open_count=48, proc_fd_count and lsof_fd_rows are at least 48, and fd_leak_correlated=yes. Standard descriptors add a small offset; no fd-leak files remain after cleanup=done.`,
      systemsLens:
        code`A descriptor leak is resource ownership with a measurable slope. Joining procfs cardinality to lsof path names identifies the leaking task before a per-process limit is reached.`,
    },
    {
      slug: "triage-deleted-file-space",
      title: "Reconcile hidden disk space held by a deleted file",
      difficulty: "advanced",
      tags: ["troubleshooting", "filesystem", "storage"],
      prerequisites: ["compare-df-and-du", "deleted-open-file"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 16,
      overview:
        code`Create a 16 MiB lab log, hold it open in a helper, unlink its pathname, and reconcile du with lsof +L1. Stopping the exact holder closes the invisible reference and makes the space reclaimable.`,
      syntaxBreakdown:
        code`dd creates bounded bytes; rm unlinks a directory entry; lsof +L1 finds open files with link count below one; df and du expose different accounting layers.`,
      code: code`
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
RUN_ID=$$
FILE=$LAB/deleted-log-$UID-$RUN_ID.log
READY=$LAB/deleted-ready-$UID-$RUN_ID
holder_pid=
rm -f "$FILE" "$READY"
trap 'test -n "$holder_pid" && kill "$holder_pid" 2>/dev/null || true; test -n "$holder_pid" && wait "$holder_pid" 2>/dev/null || true; rm -f "$FILE" "$READY"' EXIT
dd if=/dev/zero of="$FILE" bs=1M count=16 status=none
df_before=$(df -k "$LAB" | awk 'NR==2{print $4}')
du_before=$(du -sk "$LAB" | awk '{print $1}')
FILE="$FILE" READY="$READY" python3 -u -c 'import os,time
f=open(os.environ["FILE"],"rb"); open(os.environ["READY"],"w").write("ready\n"); time.sleep(4)' &
holder_pid=$!
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  [ -e "$READY" ] && break
  sleep .05
done
rm "$FILE"
du_after=$(du -sk "$LAB" | awk '{print $1}')
deleted_line=$(lsof -nP +L1 2>/dev/null | grep -F "$FILE" | grep -F '(deleted)' || true)
printf 'holder_pid=%s\nallocated_kib_before=%s\ndf_available_kib_before=%s\ndu_visible_after_unlink_kib=%s\ndeleted_open_seen=%s\n' "$holder_pid" "$((du_before - du_after))" "$df_before" "$du_after" "$(test -n "$deleted_line" && echo yes || echo no)"
if [ -n "$deleted_line" ]; then printf 'hidden_space_incident=observed\n'; else printf 'hidden_space_incident=partial\n'; fi
kill "$holder_pid" 2>/dev/null || true
wait "$holder_pid" 2>/dev/null || true
holder_pid=
rm -f "$FILE" "$READY"
trap - EXIT
printf 'cleanup=done\n'
`,
      expectedResult:
        code`allocated_kib_before is positive, du_visible_after_unlink_kib omits the open file, deleted_open_seen=yes on a normal host, and hidden_space_incident=observed. Free-space deltas vary; cleanup=done follows exact holder termination.`,
      systemsLens:
        code`Unlink removes a name, not an open file description. Disk tools walk different namespaces—directory trees versus blocks held by live descriptors—so cross-layer evidence is needed during log rotation incidents.`,
    },
    {
      slug: "triage-port-collision",
      title: "Diagnose and clear a loopback port collision",
      difficulty: "advanced",
      tags: ["troubleshooting", "sockets", "tcp"],
      prerequisites: ["map-port-to-process"],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 15,
      revision: 2,
      overview:
        code`Occupy an ephemeral loopback port, capture the second bind's EADDRINUSE, map the owner with ss and lsof, then stop that exact owner and prove rebind. No other interface is contacted.`,
      syntaxBreakdown:
        code`socket.bind reserves a port; errno EADDRINUSE identifies collision; ss and lsof map endpoint ownership; a second bind after exact cleanup proves remediation.`,
      code: code`
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
RUN_ID=$$
META=$LAB/collision-meta-$UID-$RUN_ID
owner_pid=
rm -f "$META"
trap 'test -n "$owner_pid" && kill "$owner_pid" 2>/dev/null || true; test -n "$owner_pid" && wait "$owner_pid" 2>/dev/null || true; rm -f "$META"' EXIT
META="$META" python3 -u -c 'import os,socket,time
s=socket.socket(); s.bind(("127.0.0.1",0)); s.listen(1); open(os.environ["META"],"w").write(str(s.getsockname()[1])); time.sleep(4)' &
owner_pid=$!
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  [ -s "$META" ] && break
  sleep .05
done
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
rm -f "$META"
trap - EXIT
printf 'cleanup=done\n'
`,
      expectedResult:
        code`second_bind_result reports error=98 or Address already in use, eaddrinuse_seen=yes, rebind=success after the exact owner stops, and port_collision_remediated=yes. ss_owner_seen should be yes; lsof permissions vary.`,
      systemsLens:
        code`A resource error becomes actionable when identity maps to an owner. Port collision response follows the same observe, join, remediate, and verify pattern as leaked files or mounts.`,
    },
    {
      slug: "capstone-service-outage",
      title: "Diagnose and recover a multi-symptom lab service",
      difficulty: "advanced",
      tags: ["troubleshooting", "sockets", "file-descriptors", "processes", "filesystem"],
      prerequisites: [
        "triage-cpu-saturation",
        "triage-memory-growth",
        "triage-fd-leak",
        "triage-deleted-file-space",
        "triage-port-collision",
      ],
      safetyLevel: "writes-data",
      runIn: "shell",
      estimatedMinutes: 22,
      overview:
        code`Start one bounded lab service that burns CPU, holds growing file descriptors, keeps a deleted log open, and listens on loopback. Correlate each symptom to the exact PID, send SIGTERM, and verify every resource is clean.`,
      syntaxBreakdown:
        code`ps identifies CPU ownership; ss maps the listener; find /proc/PID/fd and lsof expose descriptors and deleted files; kill -TERM requests graceful shutdown; wait and post-checks verify recovery.`,
      code: code`
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
RUN_ID=$$
META=$LAB/capstone-meta-$UID-$RUN_ID
LOG=$LAB/capstone-log-$UID-$RUN_ID.log
READY=$LAB/capstone-ready-$UID-$RUN_ID
service_pid=
rm -f "$META" "$LOG" "$READY"
trap 'test -n "$service_pid" && kill "$service_pid" 2>/dev/null || true; test -n "$service_pid" && wait "$service_pid" 2>/dev/null || true; rm -f "$META" "$LOG" "$READY" "$LAB"/capstone-fd-$UID-$RUN_ID-*' EXIT
META="$META" LOG="$LOG" READY="$READY" LAB="$LAB" RUN_ID="$RUN_ID" python3 -u -c 'import os,socket,signal,time,threading
stop=[False]
def halt(_sig,_frame): stop[0]=True
signal.signal(signal.SIGTERM,halt); handles=[]
for n in range(1,13): handles.append(open(os.path.join(os.environ["LAB"],"capstone-fd-%s-%s-%d"%(os.getuid(),os.environ["RUN_ID"],n)),"w"))
log=open(os.environ["LOG"],"w"); log.write("service-log\n"); log.flush(); os.unlink(os.environ["LOG"]); s=socket.socket(); s.bind(("127.0.0.1",0)); s.listen(2); s.settimeout(.1); open(os.environ["META"],"w").write("port=%d\nfd=%d\n"%(s.getsockname()[1],s.fileno())); open(os.environ["READY"],"w").write("ready\n")
def burn():
 x=0
 while not stop[0]: x=(x+1)%1000003
t=threading.Thread(target=burn); t.start()
try:
 while not stop[0]:
  try: c,_=s.accept(); c.close()
  except socket.timeout: pass
finally:
 stop[0]=True; t.join(timeout=1); s.close(); log.close()
 for f in handles: f.close()
 for f in handles:
  try: os.unlink(f.name)
  except FileNotFoundError: pass' &
service_pid=$!
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do
  [ -e "$READY" ] && break
  sleep .1
done
port=$(awk -F= '$1=="port"{print $2}' "$META" 2>/dev/null || true)
printf 'service_pid=%s\ncheck_cpu_owner=%s\ncheck_listening_socket=%s\n' "$service_pid" "$(ps -o pid=,pcpu=,comm= -p "$service_pid" 2>/dev/null | sed 's/^/ps=/')" "$(ss -ltnp 2>/dev/null | grep -E ":$port([[:space:]]|$)" | head -n 1 || echo absent)"
fd_count=$(find "/proc/$service_pid/fd" -mindepth 1 -maxdepth 1 2>/dev/null | wc -l)
deleted=$(lsof -nP +L1 -p "$service_pid" 2>/dev/null | grep -F '(deleted)' || true)
printf 'check_fd_count=%s\ncheck_deleted_log=%s\ncheck_lsof_rows=%s\n' "$fd_count" "$(test -n "$deleted" && echo yes || echo no)" "$(lsof -nP -p "$service_pid" 2>/dev/null | tail -n +2 | wc -l)"
if [ -n "$port" ] && [ "$fd_count" -ge 12 ] && [ -n "$deleted" ]; then printf 'incident_checklist=all-symptoms-found\n'; else printf 'incident_checklist=partial\n'; fi
kill -TERM "$service_pid" 2>/dev/null || true
wait "$service_pid" 2>/dev/null
service_status=$?
printf 'graceful_exit_status=%s\n' "$service_status"
service_pid=
remaining_files=$(find "$LAB" -maxdepth 1 -name "capstone-fd-$UID-$RUN_ID-*" -type f 2>/dev/null | wc -l)
remaining_socket=$(ss -ltn 2>/dev/null | grep -E ":$port([[:space:]]|$)" || true)
printf 'remaining_service_files=%s\nremaining_listener=%s\n' "$remaining_files" "$(test -n "$remaining_socket" && echo yes || echo no)"
if [ "$remaining_files" -eq 0 ] && [ -z "$remaining_socket" ] && [ "$service_status" -eq 0 ]; then printf 'service_recovered=clean\n'; else printf 'service_recovered=partial\n'; fi
rm -f "$META" "$LOG" "$READY" "$LAB"/capstone-fd-$UID-$RUN_ID-*
trap - EXIT
printf 'cleanup=done\n'
`,
      expectedResult:
        code`The checklist prints a service PID, a CPU owner, a loopback listener, fd_count at least 12, check_deleted_log=yes, and incident_checklist=all-symptoms-found. After SIGTERM, graceful_exit_status=0, remaining_service_files=0, remaining_listener=no, service_recovered=clean, and cleanup=done.`,
      systemsLens:
        code`Incident response correlates scheduling demand, descriptor ownership, filesystem link counts, and socket endpoints through one task identity. Recovery is incomplete until every observed resource is released.`,
      caution:
        code`The service uses only loopback, 12 tiny lab files, and one deleted log. Its CPU thread and descriptors stop via exact SIGTERM and an EXIT trap; never generalize cleanup to unrelated PIDs.`,
    },
  ],
};
