import { WAL_RECORDS_VARIATION } from "../curriculum/wal-records.ts";
import { WAL_PAGE_IMAGES_VARIATION } from "../curriculum/wal-page-images.ts";
import type { Guide } from "./types.ts";

export const guides: Record<string, Guide> = {
  "every-change-is-a-wal-record": {
    brief:
      "A physical log records work that recovery may need, including work from transactions that never commit. Use transaction identity and visible rows to distinguish those responsibilities.",
    predict:
      "Which WAL evidence should differ between a committed INSERT and a rolled-back INSERT? What extra observation is needed before calling either a successful business operation?",
    inspect:
      "Check flushed bounds and final row assertions, then match the measured xid to heap, B-tree and transaction records. For the read-side phase, match FPI_FOR_HINT blocks to the owned hint table.",
    explain:
      "Why does an aborted transaction consume WAL? Why can a SELECT generate physical WAL? Why is an LSN interval not an exact per-request accounting boundary?",
    vary:
      "Recreate the same fixture and change only the UPDATE target from amount to the indexed id. Predict HOT eligibility and index work; verify the intended new key and unchanged total row count.",
    apply:
      "A job processor aborts frequently under load. Specify the outcome and WAL measurements that distinguish correct rollback from low-cost execution, and choose which contention or retry behavior to investigate.",
    hints: [
      "Find the target xid's UPDATE/HOT_UPDATE and B-tree records. Then inspect the final row independently; the log is not a committed-result table.",
      "Run this complete indexed-key variation in one psql session.\n\n```sql\n" +
      WAL_RECORDS_VARIATION + "\n```",
    ],
  },
  "full-page-writes-after-checkpoint": {
    brief:
      "Recovery may need an entire valid page image before later changes can be replayed safely. Measure when that representation appears and how many bytes it adds.",
    predict:
      "For two successive updates of the same row, followed by a checkpoint and another update, where should image bytes appear? Which evidence would distinguish page-image cost from ordinary record overhead?",
    inspect:
      "Check the flushed bounds and three-increment invariant. Compare image_bytes across the three phases and match block_fpi_length/info to the owned heap page.",
    explain:
      "Why can first-touch bytes differ from exactly one full block? Why does compressing an image preserve a different guarantee from simply disabling full_page_writes?",
    vary:
      "Change only wal_compression from off to pglz on the fresh fixture. Keep full_page_writes enabled and compare the same three updates and final data result.",
    apply:
      "A write-heavy service generates a WAL burst after every checkpoint. Which page-reuse, compression-CPU, storage and recovery measurements would you gather before changing its policy?",
    hints: [
      "A first-touch image can omit free space or be compressed. Compare the actual block image metadata, not just the interval's total address-space movement.",
      "Run this complete compression variation in one psql session; it restores the prior session settings.\n\n```sql\n" +
      WAL_PAGE_IMAGES_VARIATION + "\n```",
    ],
  },
};
