import { CAPACITY } from "../curriculum/capacity-workload.ts";
import type { Guide } from "./types.ts";

export const guides: Record<string, Guide> = {
  "connection-saturation": {
    brief:
      "Separate the number of admitted connections from the active workload a shared service point can complete.",
    predict:
      "Every transaction holds the same row lock for 5ms. What should happen to throughput and waiting as clients increase from one to eight, and which metric could falsify your prediction?",
    inspect:
      "First verify 400 committed increments and 400 successful log records with zero failures in each trial. Then compare both rounds' throughput, latency samples and peak observed lock waiters.",
    explain:
      "Why can more active clients raise p99 without buying much throughput? Why does a closed-loop benchmark reduce its own offered load as responses get slower?",
    vary:
      "Reduce only the row-lock hold time to 1ms and repeat the same two sweeps. Compare the useful concurrency range and explain any change in the bottleneck.",
    apply:
      "Choose an active-client limit that keeps measured p99 below 30ms in both rounds, and defend the throughput/latency tradeoff. What further arrival-rate, application and resource evidence would you need before using it for a real service?",
    hints: [
      "Keep client counts, total transactions, reverse order and observation method fixed. PCAP_HOLD_MS controls only the pause inside each transaction; the supplied variation changes it to 1.",
      "Run the same lab connection environment as the core. The only changed input is the hold time.\n\n```bash\n" +
      CAPACITY.code.replace("python3 - <<'PY'", "PCAP_HOLD_MS=1 python3 - <<'PY'") +
      "\n```",
    ],
  },
};
