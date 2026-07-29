# Curio architecture

Curio turns a spoken explanation into an inspectable evidence trail, then asks an AI novice to reconstruct what it learned. This document describes the implementation; [the README](../README.md) covers setup, and [lib/types.ts](../lib/types.ts) defines the current contracts.

## Runtime and storage

- Next.js 15 App Router, React 19, TypeScript and Tailwind host the UI and server APIs. Use Node.js 22. The optional [Electron shell](../electron/main.ts) starts a local Next.js server and opens the same application.
- [lib/store.ts](../lib/store.ts) keeps sessions in a process-local map. Mutations synchronously write JSON snapshots under `data/sessions/`, then notify subscribers. These files support inspection; the store does **not** reload sessions after restart. There is no database, shared worker or multi-process persistence layer.
- [lib/packs.ts](../lib/packs.ts) loads validated bundled packs from `packs/` and approved packs from `data/packs/`. Approval writes through a temporary file and rename, using a new pack ID so bundled content is preserved.
- [lib/llm.ts](../lib/llm.ts) centralizes structured reasoning and vision calls. `REASONING_PROVIDER=openai` selects OpenAI structured outputs; otherwise it uses Anthropic tool output. Set `REASONING_MODEL` and `REASONING_MODEL_DEEP` explicitly for the selected provider. The helper's fallback model names are Anthropic names, even when the provider is OpenAI; follow the README's explicit configuration.
- OpenAI Realtime supplies voice over WebRTC. `/api/realtime/token` mints the client credential server-side. `REALTIME_MODEL` selects the voice model independently of reasoning models.

## Evidence flow

```text
VoiceClient → final transcript → session store → SSE → live room
                                  │
                                  └→ claim mapper → verifier → coverage → pedagogy
                                                                            │
                                      novice ← WebRTC client ← SSE directive

Finish → flush verification → learner beliefs → isolated teach-back
Correction → refreshed evidence/beliefs → report → expert review
```

1. [VoiceClient](../components/VoiceClient.tsx) posts final user and novice segments to `/api/sessions/[id]/transcript`. User segments trigger the claim pipeline without waiting for it in the HTTP response.
2. [Claim mapping](../lib/agents/claimMapper.ts) extracts atomic statements with source segment IDs and original wording. Its fallback extracts candidate sentences; this does not establish their truth. Concurrent ticks join an in-flight promise and coalesce new work.
3. [Verification](../lib/agents/verifier.ts) compares claims with the selected pack, retaining reference citations and evidence for findings. Misconception hints are context, not proof: negation, quotation and refutation must be distinguished from affirmative errors. Failed verification stays retryable. Explicit repairs can supersede earlier claims.
4. [Coverage](../lib/agents/coverage.ts) updates concept states and assumption debt. [Pedagogy](../lib/agents/pedagogy.ts) chooses one diagnostic question or hint and records the reason in a `Directive` and `AgentEvent`. Listening time, question budgets, repair evidence and transfer probes constrain the phase transitions.
5. `/api/sessions/[id]/events` sends an initial snapshot and subsequent store events over SSE, with heartbeat comments and disconnect cleanup. The client injects directives into the Realtime data channel; the server does not directly control that voice connection. The novice persona permits substantive questions only under a directive. Voice controls include manual push-to-talk.

Board captures take a separate vision path through [visual.ts](../lib/agents/visual.ts), retaining labels, relationships and ambiguities for review. The live room exposes transcript, claims, agent events and concept coverage without a numeric learning score.

## Learner reconstruction and context boundaries

The evaluator and the novice have different inputs. Preserve this separation when changing prompts or shared types:

| Component | Input and boundary |
| --- | --- |
| Realtime novice | A novice persona, conversation and client-delivered directives; it is instructed to avoid supplying outside knowledge. This is a prompt constraint. |
| Claim verifier | Claims and the curriculum pack, including reference knowledge, to assess semantic meaning and cite evidence. |
| Learner model | Taught claim content and provenance, existing beliefs, and prerequisite names. Evaluator status is not a correction source; a contradicted claim remains taught content until repaired. |
| Teach-back generation | Pack title, prerequisite names, and belief IDs, statements, statuses and ambiguity notes. Reference nodes/edges, findings and raw claims are not serialized into the generation context. |
| Report composer | Evaluation evidence and learner reconstruction, shown separately from the verified reference. Findings retain links back to claims and transcript segments. |

Teach-back first awaits pending extraction/verification, then reconstructs beliefs once per evidence revision. Belief reconstruction stays outside the live question path. Report finalization flushes and refreshes again so post-teach-back corrections are reflected.

[teachback.ts](../lib/agents/teachback.ts) checks the serialized generation context for verbatim overlap with the reference summary and long edge/misconception explanations. It strips detected overlap before generation and can fall back to reciting the stored belief list. This guard prevents those reference strings from entering the generation call; it is not a semantic proof against all answer leakage. Returned belief IDs are checked against stored beliefs to retain provenance. The reference pack remains available to the guard locally, but is not passed wholesale to the generator.

## Curriculum compilation and review

`/compiler` accepts source text labelled as a syllabus, reference material or instructor notes. [compiler.ts](../lib/agents/compiler.ts) generates a full draft pack, validates graph references, scope labels and exact objective quotations, then asks a critic for warnings. The reviewer inspects the draft before approval.

`PUT /api/compiler` revalidates the submitted draft against its source and saves the approved pack with that source text, role, approver label and timestamp. The resulting pack appears in `/setup` and can be used in a new session. The approver label is supplied by the caller; this demo does not authenticate instructor identity.

`/report/[id]` separates learner reconstruction from verified reference material and presents coverage, findings, assumption debt and hint dependency. `/review` supports human review of queued findings. Approval and review are workflow records, not evidence that model judgments are infallible.

## Main entry points

| Path | Responsibility |
| --- | --- |
| `app/setup/`, `app/api/sessions/route.ts` | Pack selection and session creation |
| `app/session/[id]/`, `components/` | Voice, transcript, controls and evidence panels |
| `app/api/sessions/[id]/` | Transcript, board, event stream and phase actions |
| `lib/agents/` | Claim, verification, coverage, pedagogy, belief, visual, compiler and report stages |
| `lib/types.ts`, `lib/packSchema.ts` | Shared contracts and runtime pack validation |
| `app/compiler/`, `app/report/[id]/`, `app/review/` | Approval, reporting and human review |

## Validation and limits

Run `npm test`, `npm run typecheck`, `npm run lint` and `npm run build`. The regression suite mocks provider boundaries while exercising session/pack persistence and React reconciliation. Provider smoke scripts in `scripts/` are opt-in live calls. The build fetches Google fonts; Electron compilation and packaging are separate checks.

This remains a single-process demonstration with local snapshots, no session restoration or access-control layer, and external model calls for reasoning/voice/vision. Before use with real classroom data or multiple users, it needs authenticated roles, durable session recovery, retention controls and evaluation across subjects. Automated tests establish the covered software behavior, not educational validity or the accuracy of a live model response.

The earlier construction plan remains in [Git history](https://github.com/Jo2234/curio/blob/fa38b2a3253fab42c9d5cbd43be52640ffcd65a2/docs/ARCHITECTURE.md); its task assignments and copied interfaces are not current engineering requirements.
