# Change 04: incident investigation and delivery

Primary-owned files: module 12, Linux wrapper, PLAN, handoff, build artifact, validation report and
Linux-specific durable knowledge. Agents may identify defects but the primary owns the final
semantic design and language.

Retain the five focused triage identities and final service-outage identity. Each focused case must
introduce a symptom before its cause, ask the learner to choose familiar evidence and have a bounded
worked experiment plus conceptual/runnable hints. Fix overclaims: two unpinned workers do not prove
saturation of a many-core machine, one FD snapshot does not establish a leak slope, cleanup text
does not prove recovery, and lsof selectors must intersect when attributing an exact owner.

The final experiment should use an actual loopback request/response service with a deterministic,
bounded service failure, correlate live kernel ownership, intervene, then receive a correct response
from a recovered service. Verify exact process, socket and file cleanup separately from
availability. Keep helpers embedded or course-local only if they make interactive investigation
possible without introducing an application framework. Provide a symptom-first investigation prompt
in challenge and keep complete setup/code/expected results available via normal CLI output.

Adopt guided presentation from the checked-in wrapper template using show/next JSON; do not invent a
Linux staged CLI. Full lesson requests remain verbatim. Preserve explicit progress recording and
installed symlink behavior. Update PLAN's scope, final evidence, numbered lesson decisions and
synthesis map to describe actual work.

Validate changed cases repeatedly, test recovery boundary with real responses, inspect negative
outcomes and cleanup, run all 72 after integration, and verify progress reseeding on a
copy/synthetic database. Record limits and commands in validation/04-integration.md and keep handoff
committed at every reviewed checkpoint.
