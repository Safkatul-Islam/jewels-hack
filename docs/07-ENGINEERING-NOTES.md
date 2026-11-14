# Engineering guidance: research and decisions

Reviewed 2026-11-14. These are sources for the instruction-file design and P4 setup,
not evidence that an agent client or physical camera has loaded/passed anything.

## Instruction files

| Question | Primary source | Finding and decision |
| --- | --- | --- |
| What belongs in AGENTS.md? | https://agents.md/ | Project context, executable setup/check commands and specific working conventions. Use a focused root file and link detailed project docs. No mandatory schema exists. |
| How does Codex discover guidance? | https://learn.chatgpt.com/docs/agent-configuration/agents-md | Root and more specific directory guidance participate in instruction discovery. Keep important rules near the beginning and check for overrides. Verify effective instructions in a fresh session rather than assuming automatic hot reload. |
| How should Claude load the same rules? | https://code.claude.com/docs/en/memory#import-additional-files | A bare `@AGENTS.md` line imports the file. A sentence telling Claude to read a file is weaker than an actual import. Keep CLAUDE.md as a thin pointer. |
| Why an import instead of a symlink? | https://code.claude.com/docs/en/memory#share-one-file-with-other-coding-tools | Anthropic specifically recommends the import for Windows clones, where symlinks can require privileges or check out as plain files. No symlink/config changes are needed here. |
| Are Markdown instructions enforcement? | https://code.claude.com/docs/en/memory#claude-md-vs-auto-memory | They guide behavior; they are not a hard enforcement layer. Tests, CI and repository controls are separate mechanisms. This task does not configure hooks or GitHub protections. |

The root file contains repository-specific rules synthesized from the team docs and
the user's requests. It does not copy example package managers, commit conventions or
commands from vendor documentation into this repository as if they were team choices.

## Git policy supplied by the owner

Use local branch `p4-vision-table`. Commit meaningful verified work one file at a time,
with a short `feat: message` subject and no body/footer/co-author attribution. Local
commits are authorized; every push needs explicit approval. PRs are not required.
Main integration requires additional conflict review and approval. Rebase, cherry-pick,
stash and other history/worktree-management operations also require specific approval.
See root AGENTS.md for the actionable policy. These are the user's rules, not inferred
Git conventions or rules copied from third-party examples.

The earlier branch `codex/p4-vision-table` and multi-file scenario commit `b543844` were
pushed before this policy was supplied. The requested local rename does not rename or
delete that remote branch. Do not rewrite its history or change the remote without approval.

Primary implementation references checked 2026-11-14:
- https://git-scm.com/docs/git-branch — local `-m` renames a branch; no force flag needed.
- https://git-scm.com/docs/git-add — stage one exact file, then inspect the index.
- https://git-scm.com/docs/git-commit — a normal commit records staged changes.

## Owner-approved integration

The owner chose **align with Next.js/R3F now**, replacing the standalone Vite preview
and temporary types. The owner separately approved merging P1's `peter` branch into
`p4-vision-table` locally, retaining our owner-specified AGENTS.md/CLAUDE.md. The merge
is `9c61e6a`; it is a merge checkpoint, while subsequent feature commits remain one
file each. No push is authorized. Four-point planar calibration remains available
for angled table views and does not claim full AR pose estimation.

The hardware/software camera route below remains a researched candidate, not an approved
installation or a verified device connection. Architectural and other consequential
decisions must be routed through the owner before action; silence is not approval.

## iPhone and Windows camera path

User-provided hardware: iPhone 17 Pro Max; ASUS Zephyrus G16 running Windows 11.

Primary source: https://camo.com/studio (vendor page, including compatibility FAQ).
The vendor lists Camo Camera for iOS 15+ and Camo Studio for Windows 10+, and describes
wired/wireless phone-camera input. This supports evaluating Camo Camera on the iPhone
with Camo Studio on Windows. USB is our preferred demo setup to reduce reliance on
venue Wi-Fi; that preference is an engineering decision, not a measured latency claim.

Still unverified: actual iOS version, available cable, driver/install status, browser
camera enumeration, physical framing and latency on this user's devices. No software
was installed and no phone feed was opened. Use the built-in webcam or a local recording
for early software tests; verify the phone bridge before choosing it for the live demo.

The preview's camera menu lists browser-visible inputs after permission. Simply opening
the laptop's LAN HTTP URL from the phone does not forward its camera to the laptop.

## P4 library and validation

Primary source: https://github.com/damianofalcioni/js-aruco2 and the installed root
package source. Package version: 2.0.0 (MIT).
Verified `AR.Detector`, `dictionaryName`, `maxHammingDistance`, `AR.Dictionary.generateSVG`,
and marker corner/Hamming fields before using them. Generator and detector use the same
dictionary. The confidence calculation is a heuristic, not a probability.

Current commands are the root `npm run test:vision`, `typecheck`, `lint` and `build`.
Ten test groups pass, including actual detector round trips for all nine IDs at two
orientations and asynchronous camera replacement/late-stream cleanup. The Next.js
production build includes `/table`. Browser checks exercise the integrated detector,
movement, R3F primitives, Confirm/shared planner navigation and calibration controls.
These checks do not establish physical camera or lighting performance.

Primary sources checked for the approved framework integration:

| Source | Finding and implementation |
| --- | --- |
| https://r3f.docs.pmnd.rs/getting-started/installation | Fiber 9 pairs with React 19. Installed Fiber 9.8.2 and Three 0.182.0 against P1's React 19.1; declarative Canvas owns the render lifecycle. |
| https://nextjs.org/docs/15/app/api-reference/directives/use-client | Camera hooks and interactive table components are client boundaries. Browser APIs run in effects/event handlers. |
| https://nextjs.org/docs/15/app/guides/lazy-loading | `dynamic(..., { ssr: false })` belongs in a client component. The optional R3F scene is loaded this way. |
| https://eslint.org/docs/latest/use/configure/ignore | Global ignores exclude the retired generated Vite artifacts from root source linting. |

Runtime shared types now come directly from P1's `lib/sim/types.ts`, defaults from
`lib/pieces.ts`, and map coordinates from `lib/transform.ts`. Confirm writes to the
existing store and clears stale results; engine integration remains P1/P3 work.
Automatic approval review rejected recursive deletion of retired `tools/p4/` artifacts
because it could remove uncommitted work. The safer resolution is retaining and
ignoring that unused local directory, without retrying or bypassing the rejection.

## Instruction-file acceptance

Check AGENTS.md is under 200 lines, its local Markdown links resolve, its commands match
the package scripts, and CLAUDE.md contains a real standalone import. These are static
checks. In a fresh Codex/Claude session, ask the agent to identify the loaded guidance,
the P4 ownership boundary and owner-specified Git policy. No fresh client session was launched
or tested as part of writing these files.
