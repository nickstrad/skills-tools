import { CORRUPTION_VARIATION } from "../curriculum/corruption-incident.ts";
import { DISK_INCIDENT_VARIATION } from "../curriculum/disk-incident.ts";
import type { Guide } from "./types.ts";

export const guides: Record<string, Guide> = {
  "abandoned-slot-fills-the-disk": {
    brief:
      "WAL allocation grew during a bounded write workload. Investigate the measured symptoms, choose a remedy and prove the application can continue correctly. The supplied preparation randomly selects a case and stops its private server. For an independent investigation, ask the tutor to run preparation and show only symptom.json; the complete setup remains available at run/full. Do not open fixture.json until you have recorded a diagnosis.",
    predict:
      "Choose your first two measurements. What would distinguish increased production from retained history, and what would distinguish two different consumers of that history? State what directory size alone cannot establish.",
    inspect: [
      "Use the INCIDENT variable set by preparation. In a new shell, assign it the printed absolute incident.py path. Select evidence before applying a remedy; every command starts and stops only that private server.",
      '```bash\npython3 "$INCIDENT" inspect workload\npython3 "$INCIDENT" inspect wal\npython3 "$INCIDENT" inspect slots\npython3 "$INCIDENT" inspect archiver\npython3 "$INCIDENT" inspect data\npython3 "$INCIDENT" inspect logs\n```',
      "You may request inspect all for the complete packet. Compare the saved incident window with fresh_after_restart; inspection lifecycle work can change the fresh values. Record two observations supporting your diagnosis and one alternative they weaken. An inactive slot alone is insufficient evidence.",
      "Then run exactly one action justified by that diagnosis. These are alternatives; do not paste all four. The discard action deliberately gives up the old cursor and reconstructs from the immutable ledger, so first state the consequence you expect.",
      '```bash\npython3 "$INCIDENT" recover resume\n```',
      '```bash\npython3 "$INCIDENT" recover repair-archive\n```',
      '```bash\npython3 "$INCIDENT" recover reduce-demand\n```',
      '```bash\npython3 "$INCIDENT" recover discard-reseed\n```',
      "Inspect recovery.json and the full source/receiver inventories. Which old files became reclaimable, which operations were missing, and what proves later work still arrives? Preparation alone has not completed recovery.",
    ].join("\n\n"),
    explain:
      "Separate measured workload WAL, whole-file allocation, retained slot history and pending archive copies. Which evidence supports your action? Explain any consumer reconstruction, the ordering of its receipt/effect commit and source acknowledgement, and why a directory that shrinks is insufficient proof of application recovery.",
    vary:
      "Use hint2's fresh retained-consumer case and replace resume with discard-reseed. Predict what a newly created slot can decode, what remains missing at the receiver and whether a complete immutable ledger can reconstruct the required result. Compare its later delivery with the resume path; no other failure condition changes.",
    apply:
      "For a service with an offline consumer and uncertain return time, propose a retention/remediation decision using workload rate, pending history, free capacity and recovery cost. Identify the extra observations needed for a disk forecast. Would a snapshot still recover the required effects if old source operations had been deleted or overwritten?",
    hints: [
      "Inspect the workload interval first, then compare slot restart/acknowledgement movement, current archive backlog/failure deltas and complete receiver progress. Check whether old needed filenames survive completed checkpoints. The remedy must restore the supplied receiver's complete state as well as resource progress; slowing writes alone cannot fill a receiver history gap.",
      "Run this complete variation in a shell. It deliberately chooses a fresh retained-consumer case, captures the evidence, then releases its cursor and performs the supplied snapshot reconstruction. Compare the actual empty new tail and missing identities with later verified delivery.\n\n```bash\n" +
      DISK_INCIDENT_VARIATION + "\n```",
    ],
  },
  "corrupt-a-page-and-detect-it": {
    brief:
      "An application read that previously succeeded now fails. Ask the tutor to run preparation and show symptom.json, or use run/full for the complete construction. Investigate the error, available recovery point and accepted work before choosing recovery. Preparation stops its private server and does not restore the data.",
    predict:
      "Choose two evidence sources that can distinguish physical readability from application completeness. What inventory would let you say exactly which accepted operations a particular backup can recover?",
    inspect: [
      "Use CORRUPTION from preparation; in a new shell assign the printed absolute corruption.py path. The following read saved evidence with the private servers stopped. Choose your first measurements; inspect all and the full construction remain available.",
      '```bash\npython3 "$CORRUPTION" inspect read\npython3 "$CORRUPTION" inspect checksums\npython3 "$CORRUPTION" inspect backup\npython3 "$CORRUPTION" inspect operations\npython3 "$CORRUPTION" inspect damage\n```',
      "Record the failure scope, the backup boundary, and the exact accepted identities you predict will be missing. Then choose the supplied restore into a separate destination:",
      '```bash\npython3 "$CORRUPTION" recover restore\n```',
      "Compare restored-operations.json, lost-accepted-operations.json and restored-final-operations.json. Account for all accepted identities and the later operation, and verify recovery.json plus the checksum logs. A clean startup is not the end of this investigation.",
      "After recording the evidence you need, reclaim the owned fixture:",
      '```bash\npython3 "$CORRUPTION" cleanup\n```',
    ].join("\n\n"),
    explain:
      "Which observations identify the unreadable page, and which establish the recovered application boundary? Explain the missing accepted work without treating the saved inventory as an implicit replay log. What remained unchanged while the separate destination was restored?",
    vary:
      "Use hint2 to move the same cold backup after the ten later commits. Predict the exact missing-ID set and final amount before running it. The damage, restore method and later write remain the same. Record the result and clean up this second fixture too.",
    apply:
      "A service has a checksum failure and a known-good backup older than some acknowledged requests. State the recovery point you can prove, the accepted operations needing reconciliation, and the extra retained history required for a stronger promise. Which evidence must survive until that decision is checked, and which large files can then be removed?",
    hints: [
      "Read the actual psql error and offline scan, then compare every accepted identity/payload with the backup inventory. Page checksums address physical integrity; backup age and retained history bound application recovery. Keep the damaged source unchanged while validating a separate restored copy.",
      "Run this fresh variation with the backup taken after the later commits. Inspect its actual symptom and inventory, execute restore, and compare the recovered boundary with the core. The final printed cleanup command releases this fixture after you record your evidence.\n\n```bash\n" +
      CORRUPTION_VARIATION + "\n```",
    ],
  },
};
