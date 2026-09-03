import { code, type Module } from "../../../src/types.ts";

export const NAMESPACES: Module = {
  category: "namespaces-and-isolation",
  title: "Observe and enter Linux namespace views",
  lessons: [
    {
      slug: "inspect-namespace-membership",
      title: "Compare namespace memberships of related processes",
      difficulty: "intermediate",
      tags: ["namespaces", "isolation", "procfs"],
      prerequisites: ["proc-process-identity"],
      safetyLevel: "read-only",
      runIn: "shell",
      estimatedMinutes: 12,
      overview:
        code`Compare namespace links of this shell and an exact child, then ask lsns for the same membership. Shared inode identities make namespace membership observable without changing host state.`,
      syntaxBreakdown:
        code`readlink /proc/PID/ns resolves namespace handles; stat -Lc extracts inode identities; lsns -p scopes the listing to one PID; wait bounds the child.`,
      code: code`
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
READY=$LAB/ns-membership-ready-$UID-$$
child_pid=
rm -f "$READY"
trap 'test -n "$child_pid" && kill "$child_pid" 2>/dev/null || true; test -n "$child_pid" && wait "$child_pid" 2>/dev/null || true; rm -f "$READY"' EXIT
READY="$READY" bash -c 'touch "$READY"; sleep 2' &
child_pid=$!
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  [ -e "$READY" ] && break
  sleep .05
done
same_count=0
for ns in cgroup ipc mnt net pid time user uts; do
  parent_id=$(stat -Lc '%i' "/proc/$$/ns/$ns" 2>/dev/null || echo missing)
  child_id=$(stat -Lc '%i' "/proc/$child_pid/ns/$ns" 2>/dev/null || echo missing)
  printf 'namespace_%s_parent=%s child=%s\n' "$ns" "$parent_id" "$child_id"
  [ "$parent_id" = "$child_id" ] && same_count=$((same_count + 1))
done
lsns_rows=$(lsns -p "$child_pid" -o NS,TYPE,PATH 2>/dev/null | tail -n +2 | sed '/^$/d' | wc -l)
printf 'shared_namespace_types=%s\nlsns_rows=%s\n' "$same_count" "$lsns_rows"
if [ "$same_count" -ge 1 ]; then printf 'namespace_membership_observed=yes\n'; else printf 'namespace_membership_observed=no\n'; fi
wait "$child_pid" 2>/dev/null || true
child_pid=
rm -f "$READY"
trap - EXIT
printf 'cleanup=done\n'
`,
      expectedResult:
        code`At least one namespace_* parent and child identity matches, shared_namespace_types is at least 1, and namespace_membership_observed=yes. lsns_rows is host-dependent; no namespace is created or modified.`,
      systemsLens:
        code`A namespace is a kernel-selected view used by syscalls. Inode-like handles provide a join key for deciding whether tasks see the same processes, mounts, users, or interfaces.`,
    },
    {
      slug: "isolate-pid-namespace",
      title: "Virtualize process identity with a PID namespace",
      difficulty: "advanced",
      tags: ["namespaces", "isolation", "processes"],
      prerequisites: ["inspect-namespace-membership"],
      safetyLevel: "privileged",
      runIn: "shell",
      estimatedMinutes: 14,
      revision: 2,
      overview:
        code`Ask unshare to create a private PID namespace and proc view, then compare inner PID 1 and the inner pid namespace handle with the outer shell's. If the disposable VM policy disallows it, record the bounded skip instead of weakening host isolation.`,
      syntaxBreakdown:
        code`as_root runs a command directly as root or through sudo -n; unshare --pid --fork --mount-proc creates a child PID view; timeout bounds it; the || status=$? idiom records a nonzero status without set -e; /proc/self/ns/pid names the namespace each side lives in; the if branch labels policy denial.`,
      code: code`
as_root() { if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo -n "$@"; fi; }
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
OUT=$LAB/pid-namespace-$UID-$$.out
trap 'rm -f "$OUT"' EXIT
outer_pid=$$
status=0
as_root timeout 5s unshare --pid --fork --mount-proc bash -c 'printf "inner_pid=%s\n" "$$"; printf "inner_ns=%s\n" "$(readlink /proc/self/ns/pid)"; sleep .2' >"$OUT" 2>&1 || status=$?
printf 'outer_pid=%s\nouter_ns=%s\nunshare_status=%s\n' "$outer_pid" "$(readlink /proc/self/ns/pid)" "$status"
if [ "$status" -eq 0 ] && grep -q '^inner_pid=1$' "$OUT"; then
  printf 'inner_pid=1\n'
  printf 'inner_ns=%s\n' "$(sed -n 's/^inner_ns=//p' "$OUT")"
  printf 'pid_namespace_isolated=yes\n'
else
  printf 'pid_namespace_isolated=skipped-host-policy\nskip_reason=%s\n' "$(head -n 1 "$OUT" | cut -c1-120)"
fi
rm -f "$OUT"
trap - EXIT
printf 'cleanup=done\n'
`,
      expectedResult:
        code`On a permitted VM, unshare_status=0, inner_pid=1, inner_ns is a pid:[...] handle different from outer_ns, and pid_namespace_isolated=yes while outer_pid differs. On a restricted host, pid_namespace_isolated=skipped-host-policy is valid and cleanup=done must appear.`,
      systemsLens:
        code`PID namespaces virtualize task identity and ancestry. A process can be PID 1 inside while having an unrelated outer PID, the basis for process isolation and container init behavior.`,
      caution:
        code`Run only on the dedicated disposable VM. The command is bounded and creates no persistent process; never replace it with a host-wide process kill.`,
    },
    {
      slug: "isolate-mount-namespace",
      title: "Mount a private tmpfs visible only inside a namespace",
      difficulty: "advanced",
      tags: ["namespaces", "isolation", "mounts"],
      prerequisites: ["inspect-namespace-membership"],
      safetyLevel: "privileged",
      runIn: "shell",
      estimatedMinutes: 16,
      revision: 2,
      overview:
        code`Create a private mount namespace, mount a one-megabyte tmpfs below the lab, and compare findmnt inside and outside. The inner shell unmounts in an EXIT trap, so no mount remains.`,
      syntaxBreakdown:
        code`as_root runs a command directly as root or through sudo -n; unshare --mount makes a private VFS topology; mount -t tmpfs allocates bounded storage; findmnt -T resolves a filesystem; umount in a trap removes it; || status=$? records failure without set -e.`,
      code: code`
as_root() { if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo -n "$@"; fi; }
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
MOUNTPOINT=$LAB/ns-mount-$UID-$$
OUT=$LAB/ns-mount-result-$UID-$$
rm -rf "$MOUNTPOINT" "$OUT"
mkdir -p "$MOUNTPOINT"
trap 'rm -rf "$MOUNTPOINT" "$OUT"' EXIT
status=0
as_root timeout 6s unshare --mount --fork bash -c "mount -t tmpfs -o size=1M tmpfs '$MOUNTPOINT'; trap \"umount '$MOUNTPOINT' 2>/dev/null || true\" EXIT; printf 'inside_mount=%s\\n' \"\$(findmnt -n -o FSTYPE -T '$MOUNTPOINT')\" > '$OUT'; umount '$MOUNTPOINT'" || status=$?
inside=$(cut -d= -f2 "$OUT" 2>/dev/null)
outside=$(findmnt -n -o FSTYPE -T "$MOUNTPOINT" 2>/dev/null || true)
if [ -z "$outside" ]; then outside=none; fi
printf 'unshare_status=%s\ninside_mount=%s\noutside_mount_type=%s\n' "$status" "$inside" "$outside"
if [ "$status" -eq 0 ] && [ "$inside" = tmpfs ] && [ "$outside" != tmpfs ]; then printf 'mount_namespace_isolated=yes\n'; else printf 'mount_namespace_isolated=skipped-or-unexpected\n'; fi
rm -rf "$MOUNTPOINT" "$OUT"
trap - EXIT
printf 'cleanup=done\n'
`,
      expectedResult:
        code`On a permitted VM, unshare_status=0, inside_mount=tmpfs, outside_mount_type is not tmpfs, and mount_namespace_isolated=yes. Denial is recorded as skipped-or-unexpected; cleanup=done and an empty mountpoint are mandatory.`,
      systemsLens:
        code`Mount namespaces isolate the VFS topology consulted by path lookup. A mount can be usable to one process tree while absent from another, a core filesystem isolation primitive.`,
      caution:
        code`Privileged: run only in the disposable VM. The private tmpfs is size-bounded, mounted below LINUX_LAB, and explicitly unmounted before exit.`,
    },
    {
      slug: "map-user-namespace",
      title: "Observe credential remapping in a user namespace",
      difficulty: "advanced",
      tags: ["namespaces", "isolation", "processes"],
      prerequisites: ["inspect-namespace-membership"],
      safetyLevel: "privileged",
      runIn: "shell",
      estimatedMinutes: 13,
      revision: 2,
      overview:
        code`Use map-root-user mode to compare outer and inner UIDs and uid_map. The experiment demonstrates credential translation rather than changing the host account, with a clear skip if disabled. This is the one namespace lesson that deliberately runs without sudo: user namespaces exist so that unprivileged processes can do this.`,
      syntaxBreakdown:
        code`unshare --user --map-root-user creates a mapped root; id -u reports active credentials; /proc/self/uid_map shows mapping; timeout bounds the child; || status=$? records failure without set -e.`,
      code: code`
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
OUT=$LAB/user-namespace-$UID-$$.out
trap 'rm -f "$OUT"' EXIT
outer_uid=$(id -u)
status=0
timeout 5s unshare --user --map-root-user bash -c 'printf "inner_uid=%s\n" "$(id -u)"; printf "uid_map="; tr "\\n" ";" < /proc/self/uid_map' >"$OUT" 2>&1 || status=$?
printf 'outer_uid=%s\nunshare_status=%s\n' "$outer_uid" "$status"
if [ "$status" -eq 0 ] && grep -q 'inner_uid=0' "$OUT"; then
  printf 'inner_uid=0\nuid_map_seen=%s\nuser_namespace_remapped=yes\n' "$(grep -o 'uid_map=.*' "$OUT" | head -n 1)"
else
  printf 'user_namespace_remapped=skipped-host-policy\nskip_reason=%s\n' "$(head -n 1 "$OUT" | cut -c1-120)"
fi
rm -f "$OUT"
trap - EXIT
printf 'cleanup=done\n'
`,
      expectedResult:
        code`On a VM allowing user namespaces, unshare_status=0, inner_uid=0, uid_map_seen contains a mapping beginning at outer_uid, and user_namespace_remapped=yes. A policy denial is a valid skipped-host-policy result; no host UID changes.`,
      systemsLens:
        code`User namespaces give a process a translated credential view. Namespace root is not automatically host root; capability checks use the mapped user namespace context.`,
      caution:
        code`Use only the disposable VM and retain the skip branch. Do not grant extra host capabilities or write outside the lab.`,
    },
    {
      slug: "isolate-network-namespace",
      title: "Create a loopback-only network namespace",
      difficulty: "advanced",
      tags: ["namespaces", "isolation", "sockets"],
      prerequisites: ["inspect-namespace-membership"],
      safetyLevel: "privileged",
      runIn: "shell",
      estimatedMinutes: 15,
      revision: 2,
      overview:
        code`Create a private network namespace without veth pairs or external traffic, bring up only loopback, and compare interface counts with the host. Teardown removes the view when the exact child exits.`,
      syntaxBreakdown:
        code`as_root runs a command directly as root or through sudo -n; unshare --net --fork creates a private network view; ip -o link show inventories interfaces; ip link set lo up enables loopback; timeout bounds teardown; || status=$? records failure without set -e.`,
      code: code`
as_root() { if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo -n "$@"; fi; }
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
OUT=$LAB/net-namespace-$UID-$$.out
trap 'rm -f "$OUT"' EXIT
host_ifaces=$(ip -o link show 2>/dev/null | wc -l)
status=0
as_root timeout 5s unshare --net --fork bash -c 'ip link set lo up 2>/dev/null; printf "inner_ifaces=%s\n" "$(ip -o link show 2>/dev/null | wc -l)"; printf "inner_links="; ip -o link show 2>/dev/null | cut -d: -f2 | tr -d " " | tr "\n" ","' >"$OUT" 2>&1 || status=$?
printf 'host_ifaces=%s\nunshare_status=%s\n' "$host_ifaces" "$status"
if [ "$status" -eq 0 ] && grep -q '^inner_ifaces=' "$OUT"; then
  inner=$(awk -F= '$1=="inner_ifaces"{print $2}' "$OUT")
  only_loopback=$(grep -q '^inner_links=lo,$' "$OUT" && echo yes || echo no)
  printf 'inner_ifaces=%s\ninner_only_loopback=%s\n' "$inner" "$only_loopback"
  if [ "$only_loopback" = yes ]; then printf 'network_namespace_isolated=yes\n'; else printf 'network_namespace_isolated=partial\n'; fi
else
  printf 'network_namespace_isolated=skipped-host-policy\nskip_reason=%s\n' "$(head -n 1 "$OUT" | cut -c1-120)"
fi
rm -f "$OUT"
trap - EXIT
printf 'cleanup=done\n'
`,
      expectedResult:
        code`On a permitted VM, network_namespace_isolated=yes, inner_only_loopback=yes, and inner_ifaces is no greater than host_ifaces. Denied unshare is skipped-host-policy; no veth, route, or external packet is created.`,
      systemsLens:
        code`Network namespaces isolate interfaces, routes, sockets, and port spaces. Keeping only loopback makes the boundary visible while preserving zero external traffic.`,
      caution:
        code`Run only in the disposable VM. This lesson avoids veth creation and external traffic; do not add either.`,
    },
    {
      slug: "enter-existing-namespace",
      title: "Enter an existing private mount namespace by exact PID",
      difficulty: "advanced",
      tags: ["namespaces", "isolation", "mounts", "troubleshooting"],
      prerequisites: ["isolate-mount-namespace"],
      safetyLevel: "privileged",
      runIn: "shell",
      estimatedMinutes: 17,
      revision: 2,
      overview:
        code`Hold a private mount namespace with a uniquely recorded PID, use nsenter to inspect its tmpfs, and prove the host shell cannot see its private file. The holder waits for a release file and has an EXIT trap that unmounts before exit.`,
      syntaxBreakdown:
        code`as_root runs a command directly as root or through sudo -n; unshare --mount creates the private view and records its own PID; nsenter -t PID -m joins that view for one command; findmnt and test compare inside and outside; a readiness file, a release file, and timeout bound the holder so no signal is needed to stop it.`,
      code: code`
as_root() { if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo -n "$@"; fi; }
LAB=$LINUX_LAB
if [ -z "$LAB" ]; then LAB=$HOME/linux-systems-lab; fi
mkdir -p "$LAB"
RUN_ID=$$
MOUNTPOINT=$LAB/enter-mount-$UID-$RUN_ID
READY=$LAB/enter-ready-$UID-$RUN_ID
DONE=$LAB/enter-done-$UID-$RUN_ID
PIDFILE=$LAB/enter-pid-$UID-$RUN_ID
PRIVATE=$MOUNTPOINT/private-token
holder_pid=
target_pid=
rm -rf "$MOUNTPOINT" "$READY" "$DONE" "$PIDFILE"
mkdir -p "$MOUNTPOINT"
trap 'touch "$DONE"; test -n "$holder_pid" && wait "$holder_pid" 2>/dev/null || true; rm -rf "$MOUNTPOINT" "$READY" "$DONE" "$PIDFILE"' EXIT
as_root timeout 6s unshare --mount --fork bash -c "printf '%s' \"\$\$\" > '$PIDFILE'; mount -t tmpfs -o size=1M tmpfs '$MOUNTPOINT'; printf private-token > '$PRIVATE'; : > '$READY'; trap \"umount '$MOUNTPOINT' 2>/dev/null || true\" EXIT; while [ ! -e '$DONE' ]; do sleep .05; done" &
holder_pid=$!
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do
  [ -e "$READY" ] && [ -s "$PIDFILE" ] && break
  sleep .05
done
target_pid=$(cat "$PIDFILE" 2>/dev/null || true)
if [ -e "$READY" ] && [ -n "$target_pid" ]; then
  private_fs=$(as_root nsenter -t "$target_pid" -m -- findmnt -n -o FSTYPE -T "$MOUNTPOINT" 2>/dev/null || true)
  private_file=$(as_root nsenter -t "$target_pid" -m -- test -f "$PRIVATE" && echo yes || echo no)
  host_file=$(test -f "$PRIVATE" && echo yes || echo no)
  printf 'holder_pid=%s\ntarget_pid=%s\nnsenter_mount_type=%s\nprivate_file_inside=%s\nprivate_file_outside=%s\n' "$holder_pid" "$target_pid" "$private_fs" "$private_file" "$host_file"
  if [ "$private_fs" = tmpfs ] && [ "$private_file" = yes ] && [ "$host_file" = no ]; then printf 'namespace_entry_observed=yes\n'; else printf 'namespace_entry_observed=partial\n'; fi
else
  printf 'namespace_entry_observed=skipped-host-policy\n'
fi
touch "$DONE"
wait "$holder_pid" 2>/dev/null || true
holder_pid=
printf 'mount_after_release=%s\n' "$(findmnt -n -o FSTYPE -T "$MOUNTPOINT" 2>/dev/null | grep -c tmpfs)"
rm -rf "$MOUNTPOINT" "$READY" "$DONE" "$PIDFILE"
trap - EXIT
printf 'cleanup=done\n'
`,
      expectedResult:
        code`On a permitted VM, nsenter_mount_type=tmpfs, private_file_inside=yes, private_file_outside=no, namespace_entry_observed=yes, and mount_after_release=0 once the release file lets the holder exit and its trap unmounts. Denied creation is skipped-host-policy; cleanup=done and no mountpoint remain.`,
      systemsLens:
        code`Namespace handles let diagnostics join another process's view. This is how an operator inspects an isolated service while retaining exact ownership and cleanup boundaries.`,
      caution:
        code`Privileged. The holder PID is recorded and released through a file rather than a signal; tmpfs is one megabyte below LINUX_LAB and removed by both traps.`,
    },
  ],
};
