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
      revision: 2,
      overview:
        code`Compare namespace links of this shell and an exact child, then ask lsns for the same membership. Shared inode identities make namespace membership observable without changing host state.`,
      syntaxBreakdown: code`### In plain terms

A namespace is a kernel-selected view used by processes for objects such as mounts, network interfaces, and process IDs. This read-only experiment compares the namespace handles of one shell and its exact child; matching handles establish shared visibility, but they do not grant authority to change that view.

### What you are learning

- /proc/PID/ns exposes links that identify a task's namespace memberships.
- A shared namespace handle means the two tasks use the same view for that namespace type.
- Visibility and permission are different: seeing a namespace does not give capability to create or enter one.

### Piece by piece

- **READY=... bash -c 'touch ...; sleep 2' &** (a recorded child)
  - What it is: an environment assignment supplies the readiness path, bash **-c** runs the child program, touch signals readiness, sleep keeps it inspectable, and ampersand backgrounds it.
  - What it does here: it creates one exact child PID without creating a namespace.
  - What it gives us: child_pid is the only process inspected and later waited for.
- **stat -Lc '%i' /proc/PID/ns/TYPE** (a namespace identity read)
  - What it is: stat **-L** follows the procfs link and **-c %i** prints its inode-style identity.
  - What it does here: it compares parent and child for cgroup, ipc, mnt, net, pid, time, user, and uts when present.
  - What it gives us: matching namespace_TYPE_parent and child values are concrete shared-view evidence.
- **lsns -p PID -o NS,TYPE,PATH** (a namespace listing)
  - What it is: lsns lists namespaces; **-p** scopes to one process and **-o** selects handle, type, and representative path columns.
  - What it does here: tail and sed remove headings and blank lines before wc counts rows.
  - What it gives us: lsns_rows is host-dependent corroboration, not a required fixed number.
- **trap**, **kill**, and **wait** (exact cleanup)
  - What they do here: the EXIT trap kills and reaps only child_pid and removes READY.
  - What they give us: cleanup=done proves no recorded helper remains.`,
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
      challenge:
        code`**Predict:** Will an ordinary child started by this shell normally share its network namespace? State what handle would prove it.

**Inspect and explain:** Pick one matching namespace line and explain the view it selects; then state why that line does not prove the child has mount or network authority.

**Vary:** Copy the full lesson into a private run and change only the namespace loop list to **mnt net pid user**. It remains read-only and keeps the recorded child and exact cleanup while making four view types easier to compare.

**Hint:** Use stat identities, not an assumption based on parentage.

**Apply:** Before debugging a service from the host shell, which namespace handles would you compare to decide whether your process, mount, and socket observations refer to its view?`,
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
      revision: 3,
      overview:
        code`Ask unshare to create a private PID namespace and proc view, then compare inner PID 1 and the inner pid namespace handle with the outer shell's. If the disposable VM policy disallows it, record the bounded skip instead of weakening host isolation.`,
      syntaxBreakdown: code`### In plain terms

A PID namespace gives processes a different numbering and ancestry view. The command attempts a short-lived private PID view and a proc mount for that view; a host policy denial is an untested mechanism, not proof that PID isolation occurred.

### What you are learning

- PID namespace membership changes process-number visibility, so an inner process can be PID 1 while retaining a distinct outer PID.
- --mount-proc is needed so the inner /proc reports the PID namespace's process view.
- Authority to create a namespace depends on capabilities and host policy, separate from being able to inspect namespace handles.

### Piece by piece

- **as_root** and **sudo -n** (a privilege wrapper)
  - What they are: as_root executes directly as root or invokes sudo **-n**, which refuses a password prompt.
  - What they do here: they attempt only the timeout-bounded unshare command.
  - What they give us: a denied privilege path returns a captured status instead of hanging.
- **timeout 5s unshare --pid --fork --mount-proc bash -c ...** (a private process view)
  - What it is: timeout bounds wall time; unshare creates namespaces; **--pid** selects PID numbering, **--fork** starts a child so it enters the new PID namespace, and **--mount-proc** mounts proc for that view.
  - What it does here: the inner shell prints its PID and pid namespace handle, then sleeps briefly.
  - What it gives us: inner_pid=1 plus a distinct inner_ns and outer_ns is successful isolation evidence.
- **readlink /proc/self/ns/pid** (a membership handle)
  - What it is: readlink displays the PID namespace link for the process reading it.
  - What it does here: both outer and inner shells print their own handle.
  - What it gives us: compare the handles; an inner PID of 1 alone does not explain which view was used.
- **status=0; COMMAND || status=$?** and **grep** (failure classification)
  - What they are: this idiom preserves a nonzero command status; grep checks for the exact inner PID line.
  - What they do here: they separate successful evidence from a policy or setup failure.
  - What they give us: skipped-host-policy records that isolation was not observed and must not be cited as success.`,
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
      challenge:
        "**Predict:** If the command is permitted, which number will the inner shell print for itself and why is the outer shell's PID unrelated?\n\n**Inspect and explain:** Compare outer_ns and inner_ns. Explain why a policy skip cannot support a claim about PID 1 behavior.\n\n**Vary:** Rerun the complete lesson, changing only the inner sleep .2 to sleep .1. Keep --mount-proc, the timeout and the PID/namespace checks; a shorter lifetime does not change the identity mapping.\n\n**Hint:** Keep the timeout and do not target host processes from inside the experiment.\n\n**Apply:** A diagnostic shows PID 1 in a service shell. Which namespace-handle and outer-PID evidence would you request before treating it as the host init process?",
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
      revision: 3,
      overview:
        code`Create a private mount namespace, mount a one-megabyte tmpfs below the lab, and compare findmnt inside and outside. The inner shell unmounts in an EXIT trap, so no mount remains.`,
      syntaxBreakdown: code`### In plain terms

A mount namespace gives a process tree a private mount topology, the map path lookup uses to select filesystems. This experiment mounts a one-MiB tmpfs only inside that view and compares inside and outside; it is a visibility boundary, not a general permission grant.

### What you are learning

- --mount creates a private mount namespace for the child command.
- tmpfs is a memory-backed filesystem, and size=1M bounds this lesson's allocation.
- findmnt -T resolves the mount serving a target path in the calling process's mount view.

### Piece by piece

- **as_root timeout 6s unshare --mount --fork bash -c** (bounded private topology)
  - What it is: as_root handles authority, timeout limits wall time, **--mount** selects a mount namespace, and **--fork** isolates the child lifecycle.
  - What it does here: the child alone executes mount and writes its observation to OUT.
  - What it gives us: unshare_status=0 is necessary before inside evidence is interpreted.
- **mount -t tmpfs -o size=1M tmpfs MOUNTPOINT** (a bounded mount)
  - What it is: mount **-t tmpfs** selects the filesystem type and **-o size=1M** sets its capacity option.
  - What it does here: it attaches the generated lab directory inside the child view.
  - What it gives us: inside_mount=tmpfs shows that inner lookup selected the private mount.
- **findmnt -n -o FSTYPE -T PATH** (a target mount query)
  - What it is: findmnt **-T** resolves a path, **-n** suppresses headings, and **-o FSTYPE** prints the filesystem type.
  - What it does here: it is executed once inside and once outside.
  - What it gives us: outside_mount_type must differ from tmpfs for a successful private-visibility claim.
- **trap 'umount ...' EXIT**, **rm -rf**, and **status=$?** (cleanup and policy branch)
  - What they do here: unmount removes the inner attachment; outer cleanup removes only generated lab paths; the status idiom preserves a denial.
  - What they give us: cleanup=done is required on either branch, while skipped-or-unexpected is not proof of isolation.`,
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
if [ "$status" -ne 0 ]; then
  printf 'mount_namespace_isolated=skipped-host-policy\n'
elif [ "$inside" = tmpfs ] && [ "$outside" != tmpfs ]; then
  printf 'mount_namespace_isolated=yes\n'
else
  printf 'mount_namespace_isolated=unexpected-evidence\n'
fi
rm -rf "$MOUNTPOINT" "$OUT"
trap - EXIT
printf 'cleanup=done\n'
`,
      expectedResult:
        code`On a permitted VM, unshare_status=0, inside_mount=tmpfs, outside_mount_type is not tmpfs, and mount_namespace_isolated=yes. A nonzero unshare_status produces skipped-host-policy, which says the mechanism was not tested. unexpected-evidence is a permitted command whose inside/outside evidence did not establish isolation. cleanup=done and an empty mountpoint are mandatory.`,
      systemsLens:
        code`Mount namespaces isolate the VFS topology consulted by path lookup. A mount can be usable to one process tree while absent from another, a core filesystem isolation primitive.`,
      caution:
        code`Privileged: run only in the disposable VM. The private tmpfs is size-bounded, mounted below LINUX_LAB, and explicitly unmounted before exit.`,
      challenge:
        code`**Predict:** If the private mount succeeds, which findmnt call should return tmpfs: inner, outer, or both?

**Inspect and explain:** Explain why inside_mount=tmpfs plus outside_mount_type!=tmpfs demonstrates topology visibility, while neither value proves a host permission policy.

**Vary:** Copy the full lesson into a private disposable-VM run and change only **size=1M** to **size=512K**. It keeps the same generated mountpoint and explicit unmount, and changes the allocation ceiling only.

**Hint:** A successful unshare is prerequisite evidence; do not treat skipped-or-unexpected as success.

**Apply:** A service sees a different configuration file than the host shell. Which mount-namespace and path-resolution evidence would you gather before changing the host file?`,
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
      revision: 3,
      overview:
        code`Use map-root-user mode to compare outer and inner UIDs and uid_map. The experiment demonstrates credential translation rather than changing the host account, with a clear skip if disabled. This is the one namespace lesson that deliberately runs without sudo: user namespaces exist so that unprivileged processes can do this.`,
      syntaxBreakdown: code`### In plain terms

A user namespace translates credentials between an inner and outer view. Inner UID 0 means root in that namespace's mapping; it does not make the process host root or automatically authorize host operations.

### What you are learning

- --user selects a user namespace and --map-root-user maps the caller to inner UID 0 when policy permits.
- uid_map is the evidence for translation; an inner UID label alone is incomplete.
- Unprivileged namespace creation can be disabled by host policy, which leaves the mechanism untested.

### Piece by piece

- **timeout 5s unshare --user --map-root-user bash -c** (a bounded credential view)
  - What it is: timeout bounds elapsed time; **--user** creates a user namespace; **--map-root-user** asks unshare to map the calling user to inner zero; bash **-c** prints inner evidence.
  - What it does here: it runs without sudo specifically to test permitted unprivileged user namespaces.
  - What it gives us: unshare_status distinguishes an actual mapping from policy denial.
- **id -u** (a UID query)
  - What it is: id **-u** prints the effective numeric user ID in the calling namespace.
  - What it does here: outer_uid is collected before unshare and inner_uid inside it.
  - What it gives us: inner_uid=0 is expected only with uid_map evidence.
- **/proc/self/uid_map** and **tr '\\n' ';'** (mapping evidence)
  - What they are: uid_map contains inner-ID, outer-ID, and length ranges; tr makes its rows printable on one label.
  - What they do here: the inner command exports uid_map_seen to the parent result.
  - What they give us: the mapping beginning at outer_uid shows translation rather than a host account change.
- **status=0; COMMAND || status=$?** and **skip_reason** (policy classification)
  - What they do here: preserve an unshare error and print only its first bounded line.
  - What they give us: skipped-host-policy names missing authority; it does not prove either security or successful isolation.`,
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
      challenge:
        "**Predict:** If inner_uid=0 appears, is the outer account now host root? Explain using uid_map.\n\n**Inspect and explain:** Read uid_map_seen as inner range, outer range, and length. Explain what mapping evidence is absent on a policy skip.\n\n**Vary:** In a complete rerun, replace every id -u with id -g, outer_uid with outer_gid, inner_uid with inner_gid, and uid_map with gid_map. Keep --map-root-user. Compare the resulting group mapping with the original user mapping.\n\n**Hint:** id -g reports the effective group ID; gid_map describes its mapping. User and group numbers have meaning only with the namespace mapping that interprets them.\n\n**Apply:** A process reports UID 0 inside a sandbox. What mapping and capability-context evidence would you need before authorizing a host-level action?",
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
      revision: 3,
      overview:
        code`Create a private network namespace without veth pairs or external traffic, bring up only loopback, and compare interface counts with the host. Teardown removes the view when the exact child exits.`,
      syntaxBreakdown: code`### In plain terms

A network namespace gives a process a different view of interfaces, sockets, routes, and port numbers. This experiment creates only a short-lived view with loopback enabled; it intentionally creates no veth pair, route, or external packet.

### What you are learning

- --net changes the network objects visible to the child command.
- lo is the loopback interface and must be brought up before local use in a fresh network namespace.
- A separate view does not by itself provide routing, connectivity, or permission to configure host networking.

### Piece by piece

- **as_root timeout 5s unshare --net --fork bash -c** (a bounded network view)
  - What it is: as_root supplies authority when available; timeout limits wall time; **--net** selects a network namespace; **--fork** contains the child lifecycle.
  - What it does here: only the child runs ip commands and prints its link inventory.
  - What it gives us: unshare_status=0 is required before interpreting inner_ifaces.
- **ip -o link show** (an interface inventory)
  - What it is: ip manages network objects; **-o** produces one-line records, **link** selects link-layer interfaces, and **show** reads them.
  - What it does here: it counts host interfaces outside and prints inner names inside.
  - What it gives us: inner_links should be lo only in the intended fresh view; counts are supporting, host-dependent evidence.
- **ip link set lo up** (a loopback state change)
  - What it is: ip **link set** changes an interface state; lo names loopback and **up** enables it in the child view.
  - What it does here: it permits only local traffic if a later command used it.
  - What it gives us: it never creates a route, peer link, or external traffic path.
- **grep**, **awk**, and **status=$?** (classification)
  - What they do here: parse the generated output and preserve a denied unshare result.
  - What they give us: skipped-host-policy is an honest untested branch; partial means the expected loopback-only evidence was not established.`,
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
      challenge:
        "**Predict:** In a permitted fresh network namespace, which interface name should appear before any peer link is created?\n\n**Inspect and explain:** Explain why inner_only_loopback=yes demonstrates a view difference but does not demonstrate a usable external network.\n\n**Vary:** Rerun the complete lesson, changing ip link set lo up to ip link set lo down. Compare interface inventory: an interface can exist in a namespace while its link is down.\n\n**Hint:** Treat a denied unshare as missing evidence, not as proof that the host is isolated.\n\n**Apply:** A service's port is absent from host ss output. Which network-namespace handle and in-namespace socket evidence would you collect before deciding it is not listening?",
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
      revision: 3,
      overview:
        code`Hold a private mount namespace with a uniquely recorded PID, use nsenter to inspect its tmpfs, and prove the host shell cannot see its private file. The holder waits for a release file and has an EXIT trap that unmounts before exit.`,
      syntaxBreakdown: code`### In plain terms

This lesson holds a private mount namespace long enough for a diagnostic command to enter it by an exact recorded PID. Entering a namespace changes the command's view for that invocation; it does not transfer ownership of the holder or make a policy skip evidence of namespace entry.

### What you are learning

- nsenter joins a selected namespace of a target process for one command.
- A readiness file and release file coordinate a bounded holder without broad process matching.
- Private mount visibility is established by comparing the same path inside and outside, then proving teardown.

### Piece by piece

- **as_root timeout 6s unshare --mount --fork bash -c** (the holder)
  - What it is: as_root handles authority; timeout bounds lifetime; **--mount** selects a mount namespace; **--fork** starts the isolated child.
  - What it does here: the holder writes its own PID, mounts a one-MiB tmpfs, writes private-token, signals READY, and waits for DONE.
  - What it gives us: PIDFILE is the exact namespace owner to inspect, never a name-based process search.
- **trap 'umount ...' EXIT** and **while [ ! -e DONE ]** (lifetime control)
  - What they are: the inner trap unmounts on exit; the loop waits for the release file in short sleeps.
  - What they do here: they keep the private view present only during the inspection interval.
  - What they give us: DONE followed by wait gives the holder a clean release path.
- **nsenter -t PID -m -- COMMAND** (namespace entry)
  - What it is: nsenter targets PID with **-t**, **-m** selects its mount namespace, and **--** ends nsenter options before the inspected command.
  - What it does here: it runs findmnt and test inside the holder's mount view.
  - What it gives us: nsenter_mount_type=tmpfs and private_file_inside=yes are entry evidence for the exact target.
- **findmnt -n -o FSTYPE -T PATH** and **test -f** (inside/outside comparison)
  - What they are: findmnt resolves a target filesystem; test **-f** checks for a regular private token file.
  - What they do here: the commands inspect the same paths inside and from the host shell.
  - What they give us: private_file_outside=no distinguishes mount-view visibility from mere file creation.
- **wait**, **mount_after_release**, and cleanup (teardown proof)
  - What they do here: release and reap the recorded holder, then query the target path from outside.
  - What they give us: mount_after_release=0 and cleanup=done show the temporary view was removed.`,
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
      challenge:
        "**Predict:** Which command sees private-token before release: host test -f or nsenter test -f?\n\n**Inspect and explain:** Explain why target_pid from the holder's PIDFILE is necessary before nsenter, and why private_file_inside=yes alone is not teardown evidence.\n\n**Vary:** Rerun the complete lesson, changing only printf private-token > to printf private-token-vary > in the inner helper. Keep the pathname, namespace checks, release marker and cleanup. The token contents do not determine mount visibility.\n\n**Hint:** Release through DONE and wait for the recorded holder; do not use a broad kill.\n\n**Apply:** An operator needs to inspect a service's private mount. Describe the target-PID, namespace-type, in-view, host-view, and cleanup evidence required for a safe diagnosis.",
    },
  ],
};
