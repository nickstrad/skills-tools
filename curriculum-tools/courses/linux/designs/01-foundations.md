# Change 01: foundations and process composition

Own only `curriculum/01-lab-and-shell.ts` through `04-file-descriptors-and-pipes.ts` and
`validation/01-foundations.md`. Read OVERPLAN, PLAN, AUTHORING and shell gotchas.

For every lesson replace the one-line syntax summary with the exact three authoring headings and
complete plain-language explanations of commands, flags, output and coordination. Add a specific
challenge with **Predict**, **Inspect and explain**, **Vary**, **Hint**, **Apply** sections. Early
variations may rerun the same bounded experiment with one supplied substitution; execute them and
record evidence. Avoid generic quizzes and repeated boilerplate. Increment each changed explicit
revision from the built baseline, leaving course revision and all slugs/order unchanged.

Preserve sound code. Audit claims against it: lesson 22 already holds the FIFO open with descriptor
7, so it demonstrates buffer blocking, not open blocking; correct the prose about 'no reader' to 'no
draining consumer'. Upgrade lesson 23 beyond lesson 5's rendezvous: demonstrate EOF only after the
final writer closes, with bounded coordination and two sessions. Retain its stable slug and learning
identity. Identify process-state snapshots and sampled timings as observations, not guarantees.
Inventory/version lessons are preparation, not additional internals demonstrations.

Use a private copy of curriculum-tools under /tmp and a private LINUX_LAB. Run build, format/check
owned modules, all owned lessons, and all new runnable variations. Record per-lesson evidence lines,
commands, skips, uncertainties and semantic diffs. Copy only owned modules/report back. Do not
modify shared artifacts, docs or commit. Primary reviews wording and reruns concurrency lessons
before shipping.
