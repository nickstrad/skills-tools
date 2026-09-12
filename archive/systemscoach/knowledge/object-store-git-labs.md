# Object-store and Git lab findings

Validated work began 2026-09-09 with SeaweedFS 4.46, Git 2.43.0 and the Cursor Git project.
Use [batch evidence](../projects/cursor-git/validation/batch-1.md) for final measured acceptance.

## What happened

The pinned Linux amd64 SeaweedFS archive is about 46 MB, with SHA256
`f4c654a72353c36bd8ae03c8879b81588dc29ffee0fa87594d8716a3d9347ad5`.
The installed `weed` binary reports commit `d997fba1575583a89cf0cc50dc0150642286c86d` and has SHA256
`075592965db0bbef04067512b44278d08eac90c6dc2ea9962beac3aebe019665`.

In this release, `weed mini -admin.ui=false` still started an admin HTTP listener and a wildcard
admin gRPC listener. Setting `-ip.bind=127.0.0.1` did not restrict that particular admin listener.
The bounded project instead uses `weed server -filer -s3`, disables ancillary catalog/IAM/WebDAV
features, and explicitly sets all eight TCP listener ports. All eight were observed on loopback.
This is a version/configuration finding, not a general rejection of the project's mini quick start.

A real conditional index race returned HTTP 200 for one client and 412 for the other; a GET returned
only the winning body. Uploaded candidate objects can both exist while the authoritative index
selects only one. Current documentation alone would not establish this behavior in a pinned release.

On normal restart, an existing bucket's PUT returned 409, and root/bucket listing could become ready
before stored object data was readable. The launcher now checks for the existing bucket before
creating one, then waits for the index read to return 200 (existing data) or 404 (fresh fixture).
It tolerates transient data-read failures within a 45-second startup budget. A later exact-byte
comparison verified that the published index and pack survived restart. Shutdown needed more than
the initial 10-second allowance; the supplied stop path waits up to 30 seconds without deleting
state under a live process.

## Why it matters

Command-line switches may disable a UI without disabling its service. Inspect actual TCP and Unix
listeners and data paths before declaring a lab isolated. Set volume size/count and preallocation
explicitly; a small workload alone does not bound an infrastructure service's allocation.

An HTTP request can complete at the transport layer while its operation fails with 412. Keep response
status/body/headers as evidence. A client merely returning exit 0 is not proof of publication.
Conversely, curl's `-f` is useful for requests whose HTTP failure is unexpected. ETags are comparison
tokens; use a separate checksum to verify payload bytes.

## How to apply

- Follow the [owned launcher](../projects/cursor-git/lab/lab.sh): unique root, recorded PID,
  executable and data-directory ownership check before stopping, all data underneath the root,
  finite startup/shutdown waits and complete teardown. Check peak allocation including install
  copies, object-store files and Git replicas. Retain one reusable pinned binary, not download copies.
- Validate real backend create-if-absent, stale update rejection and a same-ETag race before writing
  lessons that depend on them. Distinguish object-store CAS from local coordination barriers/locks.
  Check fresh/unchanged conditional GET and normal-restart persistence separately.
- A shared publication conflict does not replace application validation. Preserve each request's
  original expected-old ref and reconstruct a retry from current accepted history. A same-branch
  conflict must not be converted into a blind ref overwrite.
- Keep Git fixtures deterministic using explicit author/committer identity/date and isolated config.
  Import full reachable packs with native `index-pack`; inspect actual refs and object identities.
  A pack does not carry a branch publication decision. Several ref updates do not imply atomic
  snapshot visibility to arbitrary concurrent Git readers.
- A tool-call shell may retire background descendants at call completion even after `nohup`.
  Run the whole validation inside one tracked parent process; retain its session handle and poll
  that handle instead of starting a second fixture. Ordinary interactive learner commands still
  use the supplied launcher and explicit cleanup. Confirm actual process state when diagnosing.
- Keep executable lab scripts stable while a tracked run is using them. Bash may read later portions
  after a wait; editing the file during execution caused an EOF parse error after one trial's cleanup.
  Validate the final unchanged source again, rather than treating that mixed-source run as acceptance.
