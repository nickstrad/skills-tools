# Create a loopback-only network namespace

slug: isolate-network-namespace
category: namespaces-and-isolation
difficulty: advanced
tags: namespaces, isolation, sockets
prerequisites: inspect-namespace-membership
safety: privileged
run-in: shell
sessions: 1
min-version: 5.1
minutes: 15
revision: 3

## Overview
Create a private network namespace without veth pairs or external traffic, bring up only loopback, and compare interface counts with the host. Teardown removes the view when the exact child exits.

## Syntax breakdown
### In plain terms

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
  - What they give us: skipped-host-policy is an honest untested branch; partial means the expected loopback-only evidence was not established.

## Caution
Run only in the disposable VM. This lesson avoids veth creation and external traffic; do not add either.

## Run
```sh
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
```

## Expected result
On a permitted VM, network_namespace_isolated=yes, inner_only_loopback=yes, and inner_ifaces is no greater than host_ifaces. Denied unshare is skipped-host-policy; no veth, route, or external packet is created.

## Systems lens
Network namespaces isolate interfaces, routes, sockets, and port spaces. Keeping only loopback makes the boundary visible while preserving zero external traffic.

## Optional variation
Rerun the complete lesson, changing ip link set lo up to ip link set lo down. Retain the fresh
namespace, timeout and cleanup. When creation succeeds, the inventory still contains only lo:
the interface exists even with its link down. Neither inventory establishes external connectivity.

A denied unshare leaves the mechanism untested. Likewise, a service port absent from the host's
ss view may belong to another network namespace; compare the service's namespace handle and
socket view before concluding that it has no listener.
