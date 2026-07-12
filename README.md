# Curio

Curio is a live understanding rehearsal: teach an AI novice by voice, let reasoning agents map the claims you actually made against an instructor-approved curriculum, then hear the novice teach the idea back using only what it learned from you. The result is an evidence-led view of gaps, misconceptions, assumptions, and moments that deserve human review—without turning learning into a score.

## Quickstart

Use Node.js 22 and copy `.env.example` to `.env.local`. For the current OpenAI runtime, set at least:

```bash
OPENAI_API_KEY=your_key_here
REALTIME_MODEL=gpt-realtime
REASONING_PROVIDER=openai
REASONING_MODEL=gpt-5.4-mini
REASONING_MODEL_DEEP=gpt-5.6-sol
```

The Anthropic reasoning path remains supported: set `REASONING_PROVIDER=anthropic`, add `ANTHROPIC_API_KEY`, and choose the corresponding reasoning models. Then run:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Runtime session snapshots are written to `data/sessions/` and are not a production database.

## Architecture

```text
                          CURIO LIVE REHEARSAL

  teacher / student ──voice──► OpenAI Realtime novice
          │                         │
          └──── final transcript ───┴──► session store ──► SSE ──► live room
                                              │
                    ┌─────────────────────────┴─────────────────────────┐
                    │            fast evidence loop                    │
                    │  claim mapper → verifier → coverage → pedagogy   │
                    └─────────────────────────┬─────────────────────────┘
                                              │ directive
                                              └──────────► novice asks / hints

  finish ──► learner model ──► isolated teach-back ──► report composer ──► report
                                  (taught beliefs only)             │
                                                                    └─► expert review

  syllabus ──► compiler agents ──► inspectable pack draft ──► instructor approval
```

The Next.js App Router hosts the UI and APIs. An in-memory store plus JSON snapshots holds demo sessions; SSE streams server-side agent events to the room; OpenAI Realtime handles live voice; and structured reasoning helpers support both OpenAI and Anthropic providers. Teach-back is deliberately isolated from the reference pack so Curio can reproduce only the learner beliefs it was given.

## Credits and hackathon disclosure

Built solo at **BUIDL_OPC_Hackathon_SG** by **Johan Vaz**, orchestrating AI coding agents: **Claude Code (Fable 5, orchestration)** and **OpenAI Codex (GPT-5.6-Sol, implementation)**.

Runtime models: **OpenAI Realtime** for voice and **GPT-5.4-mini / GPT-5.6-Sol** for reasoning agents. Allowed pre-hackathon preparation comprised the product specification, architecture and design documents, wireframes and user flows, and demo-content research. **All code and data were authored during the hacking period.**

Open-source dependencies include Next.js, React, Tailwind CSS, the OpenAI SDK, the Anthropic SDK, and Nano ID. See `package.json` for exact versions and the complete dependency list.
