## What the evidence means

The publisher's exit left the caller without an application success reply, yet a fresh index GET
contained A. The authoritative outcome and the observed request outcome were different facts.
Retrying `op-a` returned its existing result without changing generation or entry count. This is
idempotent handling of one logical operation, not proof of exactly-once message delivery.

B provided the negative control: its immutable object existed, but its operation was absent from
accepted history. Returning “already done” at that point would have lost the update. The client
instead revalidated the original branch precondition and published B through CAS. The new index
preserved A and added B.

The identity check is tied to intent. Matching only a short ID while ignoring its content could
mistake a different requested update for a retry. Our client compares the stored record fields;
it rejects the same operation ID with different content. The retained tiny history lets it search
all accepted records. A larger system needs a deliberate deduplication-retention contract.

## The systems decision

Separate “the operation failed” from “the caller could not determine the result.” Stable identity
and an authoritative lookup turn an unknown outcome into a recoverable conversation. The same
decision appears in payment requests, job submission and database transactions with lost replies.
The caller must preserve identity across retries instead of generating a fresh request each time.

This lab exits a real process after successful publication. It does not drop a network packet or
prove behavior under an object-store outage. If authority cannot be read, the client must report
uncertainty or failure rather than guess. If the original branch precondition no longer holds and
the operation was never accepted, reconciliation cannot make that operation valid.

The worked logic is in `lab/cursor/`: inspect the publisher's identity lookup, original-ref check
and conditional replacement if you want to connect the CLI to Go. No coding is required. The next
lesson makes accepted history useful by materializing a real Git repository from it.
