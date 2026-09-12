import { code } from "../../../src/types.ts";

export const setup = code`
source /root/Software/skills-tools/curriculum-tools/courses/grpc/lab/env.sh
`;
export const shellHelp = code`
- **source .../env.sh** loads the installed tools and cleanup helpers. Run the README's one-time
  installation first. **GRPC_COURSE** points to the course directory.
- **( ... )** creates a child shell. **set -euo pipefail** stops on an unexpected error, unset
  variable or failed pipeline without changing your parent shell's settings.
- **new_lab** creates a private temporary directory in **LAB** and registers an exit cleanup.
  The closing parenthesis stops the owned server and removes this experiment's temporary files.
  Rerun the whole block for fresh state.
`;
export const rpcHelp = code`
- **start_server** starts the supplied counter on an available loopback port, checks it with an
  actual RPC and puts its address in **ADDR**. **stop_server** stops and reaps that child.
  Starting again gives a fresh counter. Logs are in **LAB/server.log** during the block.
- **grpcurl** calls gRPC from a terminal. **-plaintext** disables TLS for this loopback-only lab;
  do not copy that setting to a remote service. **-d** supplies JSON that grpcurl converts into
  protobuf bytes. The last arguments are the address and service/method; **{}** is an empty message.
  This CLI's JSON is not JSON transmitted as the protobuf payload.
`;
export const failureHelp = code`
- **expect_failure TEXT COMMAND...** runs the command, displays output and exit status, and checks
  that it failed with the named text. An unexpected success or different error stops the experiment.
  This helper lets deliberate errors coexist with **set -e**.
`;
export const caution = "Use the supplied loopback lab. Each complete block cleans its temporary " +
  "files and stops its server on exit; inspect output inside the block or rerun it. " +
  "Existing databases and learner progress are not changed.";
