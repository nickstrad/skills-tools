# Cursor Git lesson source migration — 2026-09-12

This refactor folds each legacy `review.md` interpretation into the end of its corresponding
`lesson.md`, preserving the renderer wrapper heading (`Interpretation and optional worked solution`)
and the review page headings/content. The seven review files were then removed. The CLI's `review`
spelling remains a read-only alias, but it reads only the merged lesson source.

The current `source-sha256.txt` manifest tracks the three available lessons used by batch 1. The
accepted hashes below preserve the source identity bound to that measured validation; the immediate
hashes identify the files immediately before this migration; and the new hashes record the layout
transformation. No object-store, Git, or other lesson experiment was rerun for this source-only
migration.

| Slug | Accepted batch-1 lesson SHA256 | Immediate-before lesson SHA256 | Removed review SHA256 | Merged lesson SHA256 |
| --- | --- | --- | --- | --- |
| `objects-before-refs` | `9b5316adf78975ca5e86d0a4580834d9779ef98e50998b968945adb03e8c897f` | `48776d0dd058c71d5c903d0f926748078226539e53abc7155a81dca8ab0fde81` | `7417a1553a327f5846de8e9abfd0c1d8e95573bdc3b8c314d61dfa40629337e7` | `44560caae104d3b20e7dca07b3edf96884b596924a91d1d9b8a5cd11b9282425` |
| `publish-the-index` | `9e27ce753ed7ed43121b8936e382c71b154eed0cb3af92fcfec978c3bbac55b6` | `05f07a879924c51a40f1c262e0fe0a85db9332d8ec77abb0990e58bb56cccb23` | `5223066df1d80b7ce2bc653dcc5e83be5698d154830b9d4545709fbbb977a27b` | `407fbabd99287c6362e9db86820071479dd2859d8f824f6a29c7542505d3b0a5` |
| `race-the-publishers` | `0b91871e9002e314189a518072aa3f1fb96b74b9fd06c906186485c7c7ff5700` | `195d0011df8407712fd2180f71816f1ebd60cde1b51cb1862f87b62157acdefd` | `52688cf2ffb3222f5b83dee4a8704c26a4ed6725ace87bc9252d6bc3b89abb06` | `d98dbd2c5ff322ab9ca2796c42314140a08cbdc62928647ce29d607f0e735bd3` |
| `reconcile-unknown-outcomes` | — | `fade05b62c11472f990c6cad010901eea918cb8dc9b6f84f588130f576521629` | `f7c931994468ce4227ba48478a85f41c6b1df013ea71d56f9e0715f81aed5beb` | `8ba021c1d3b434dcb5303782aac80401789cd40b2f5244078763543668e8eb36` |
| `replay-published-history` | — | `df1ebe84910f42d5d866687ffcf5199b6df106f0931b1209a21df731ee73a54e` | `e94c1a50db708a363f44aafb25e41735d042cd2753dc567ce6156e0ef79908cb` | `72c53b261be713b32414b96f33b44642341c2121f0e5cacaa475c6414480fb02` |
| `verify-before-serving` | — | `44882e5dec9300f79adaa9cdb901c1f088faf5245c8c9f85c16b79c87c3da734` | `6d42a06825c110200b5b4a180168cb84572a92dfbc2a3ffde43a5a688baac9c7` | `86d740030a1257bca1dc6278289440020eeb9bf3326313e23f1283579043c68f` |
| `evict-and-rebuild` | — | `a6cebee8765dbd9db90760dc955100fd044a542484558961abc311f2b70a414c` | `a201c9ded1951c74fa1cd3edcfe307f5104cfd807f54f744449edeb66776da8a` | `471f075b55128828815f5633c004279bbea38679c2c29f7a751843340c7d4d67` |

The accepted batch-1 hashes for lessons 1–3 are historical evidence copied from the prior manifest;
they are distinct from the immediate-before hashes, which identify the files at this migration
boundary. Lessons 4–8 were not part of that manifest, so their accepted-hash cells are intentionally
empty.

## Primary acceptance

All seven merged files reproduce the exact prior renderer body, including its newline boundaries.
The primary restored an omitted limitations paragraph during review. Independently compiled old
and new CLIs produce byte-identical output for all three available lessons through both `lesson`
and the saved `review` alias, with isolated state remaining empty. Go tests and vet passed, and
all 13 current source-manifest entries verify. Project availability, revisions, experiments and
learner receipts were not changed.

The launcher and supplied-client builder now use shared `/usr/local/go` when Go is absent from PATH.
They discard only inherited GOPATH/GOCACHE paths belonging to the retired gRPC installation.
A minimal-PATH launcher check passed with those stale variables deliberately supplied.
