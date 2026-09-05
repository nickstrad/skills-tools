import { FREEZE_VARIATION } from "../curriculum/freeze-incident.ts";
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
  "wraparound-drill": {
    brief:
      "Several vacuum passes completed, but part of a small ledger remains unfrozen and its frozen boundary has not advanced. Ask the tutor to run preparation and show symptom.json, or open run/full for the construction. Choose evidence that explains the plateau and a remedy that preserves application correctness. No server waits running between phases.",
    predict:
      "Which observations distinguish a worker that has not finished from tuples that are not yet eligible? Choose two initial measurements and state what a successful VACUUM command alone cannot prove.",
    inspect: [
      "Use FREEZE from preparation, or assign the printed absolute freeze.py path in a new shell. Each inspection starts and stops only that fixture. Saved and fresh observations are labeled separately.",
      '```bash\npython3 "$FREEZE" inspect passes\npython3 "$FREEZE" inspect tuples\npython3 "$FREEZE" inspect horizons\npython3 "$FREEZE" inspect decision\npython3 "$FREEZE" inspect data\n```',
      "The complete packet is available through inspect all. Record the unfrozen identities, the oldest dependency, and the evidence authorizing its resolution. Then execute the supplied decision-following remedy:",
      '```bash\npython3 "$FREEZE" recover resolve\n```',
      "Compare recovery.json, resolved-pass.log, ledger-before.json and ledger-final.json. Did physical freezing progress while preserving both the ledger and the required transaction outcome? Record your findings before releasing the fixture:",
      '```bash\npython3 "$FREEZE" cleanup\n```',
    ].join("\n\n"),
    explain:
      "Explain why repeated completed passes and restart did not release this horizon. Identify the decision's authority and reconcile the final tuple flags, relation boundary and visible business effect. Why would guessing a rollback to improve the metric be insufficient?",
    vary:
      "Use hint2 to change only the durable final decision to COMMIT. Predict the different visible effect and the unchanged freeze/ledger result. Inspect, resolve, verify and then clean up the variation.",
    apply:
      "A maintenance alert reports old unfrozen tuples but no idle clients. Give an evidence-driven investigation order and the outcome evidence required before releasing a durable transaction obligation. Which observations would you still need to estimate a real deadline, and which ones does this tiny fixture not measure?",
    hints: [
      "Compare completed scan logs and per-identity frozen flags before inspecting the horizon inventory. Look beyond live client sessions. The final durable decision authorizes the exact participant outcome; afterward verify both complete ledger equality and the expected separate effect.",
      "Run this fresh variation with the opposite committed coordinator decision. It supplies the complete evidence and performs the same resolution/freeze checks. Record the changed business outcome, then use the final cleanup command.\n\n```bash\n" +
      FREEZE_VARIATION + "\n```",
    ],
  },
};
