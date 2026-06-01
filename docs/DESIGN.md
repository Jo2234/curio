# Curio — Design Direction

## Two distinct directions

### Direction A — The Blackboard Docket

Curio feels like a slate teaching board crossed with an evidence examiner’s case file. The ground is deep green-black, not generic charcoal; fine horizontal rules recall a classroom board while crisp cream typography and squared paper labels keep the interface forensic. Teaching remains human and imperfect: transcript excerpts carry hand-drawn-style brackets, questions sit on warm index cards, and concepts are stamped with plain-language states. Verification is never represented as futuristic magic. It appears as careful marginalia—source ticks, numbered claims, corrections, and restrained red pencil marks. The live room becomes a three-part instrument: the lesson unfolding at center, the agents’ observations entering like laboratory notes, and the concept map visibly changing as understanding improves. This direction is ownable because its visual metaphor joins both halves of Curio—sincere novice and rigorous examiner—without becoming nostalgic classroom cosplay. On a projector it reads as a dark, high-contrast field with large cream text, bold state shapes, and one warm paper accent.

- Palette: `#0D1714`, `#14231E`, `#1C3029`, `#F4EEDB`, `#B8C5BB`, `#E6B85C`, `#D96C5F`, `#6FB18B`
- Type pairing: **Bitter** (display, questions, evidence) + **IBM Plex Sans** (interface and body) + **IBM Plex Mono** (claim IDs and source metadata)

### Direction B — The Red-Pencil Examination Room

Curio becomes an austere oral-exam chamber: near-black walls, bone-white working sheets, and a single vermilion reviewer’s mark. The layout is deliberately architectural—thick rules, numbered bays, oversized phase titles, and no soft card cloud. A transcript reads like a manuscript under review; claims are underlined, assigned folio numbers, and connected to findings through shared reference codes. Agent activity resembles an examiner’s running docket rather than a chat feed. The novice’s questions interrupt the severity with generous warm-white space and frank, almost vulnerable language. State is communicated through hatch patterns, labels, and geometry as well as color: verified claims receive a double rule, uncertainty a diagonal hatch, contradiction a red strike. This direction is memorable, editorial, and highly legible, but intentionally less cozy. It makes the final report feel authoritative and the expert queue consequential. Its risk is emotional distance: the novice could feel like an evaluator instead of a learner unless the copy and speaking behavior remain exceptionally gentle.

- Palette: `#10100F`, `#191917`, `#F3EFE4`, `#B8B2A7`, `#E14B3B`, `#D39A45`, `#63947A`, `#6D8FAB`
- Type pairing: **Newsreader** (display and evidence) + **Archivo** (interface and body) + **Roboto Mono** (reference codes)

## Selected direction: The Blackboard Docket

This is a teaching surface being examined in real time, not a dashboard monitoring abstract metrics. The UI should feel assembled from slate, ruled ledger paper, index cards, and precise evidence marks, translated into a contemporary instrument rather than reproduced literally. Every visual decision should help the audience answer three questions from five meters away: what was said, what does the learner now believe, and what deserves attention next. Warmth belongs to the novice and the teaching moment; rigor belongs to the structure, labels, and evidence trail.

## Screen grammar

One system governs every screen, but density changes by task.

- **Landing:** one oversized thesis, one clear action, and a small “how the examination works” three-step ruled strip. Avoid feature-card grids. The background rule texture begins here.
- **Session setup:** a single centered “lesson docket” with numbered fields: topic, reference pack, learner level, and session intent. Use a visible summary rail rather than a wizard.
- **Live room:** optimized at `1440×900` and readable from five meters. Use a 12-column grid: transcript `6`, agent feed `3`, claim ledger `3`; the concept-state map spans the full width as a persistent top rail beneath the phase bar. Transcript body is at least `18px/30px`; primary states and active question are `20–24px`. Do not compress this into equal generic cards.
- **Report:** the learner model and reference are two modes of the same evidence surface, not two unrelated pages. Tabs are thick ruled labels. Findings lead with the transcript quote, then interpretation, then reference.
- **Expert review:** a work queue with severity bands and explicit evidence counts. Keep the selected task and its evidence side by side.
- **Pack compiler:** source coverage at left, extracted concepts at center, review exceptions at right. It should read like a publishing proof desk.

## Color system

The base is a green-black slate that is visibly different from standard neutral dark themes. Cream is the primary ink. Muted text remains deliberately bright enough for a projector; never place `--text-muted` below 16px. The warm ochre accent identifies Curio’s novice voice, active questions, and primary action—not every interactive control.

Color is never the only state signal. Every state pairs color with a short label and a shape treatment: solid edge, double edge, broken edge, or hatch.

### Semantic conventions

- **Claim / observed:** cool blue; left dot + `OBSERVED` label.
- **Claim / verified:** green; double bottom rule + check icon.
- **Claim / contradicted:** coral; solid left bar + strike/not-equal icon. Never strike the user’s quote itself.
- **Claim / uncertain:** ochre; broken border + question mark icon.
- **Concept / established:** green fill, dark ink, double inset edge.
- **Concept / misconceived:** coral fill, dark ink, clipped upper-right corner.
- **Concept / assisted:** blue fill, dark ink, small corner notch.
- **Concept / missing:** transparent, muted cream dashed edge.
- **Concept / assumed:** ochre hatch on slate with cream text.
- **Severity:** info blue, attention ochre, critical coral.
- **Agents:** six related mid-chroma hues are reserved for identity only. Their chips use tinted dark surfaces and a colored leading rule, never glow.

## Typography

Load with `next/font/google`: `Bitter`, `IBM_Plex_Sans`, and `IBM_Plex_Mono`. Use Bitter sparingly for the product wordmark, major screen titles, novice questions, and transcript evidence; its slab structure supplies the field-journal character. IBM Plex Sans carries all interface, transcript, and explanatory text. IBM Plex Mono is for claim numbers, timestamps, confidence, citations, and machine-state labels.

| Token | Size / line height | Weight | Use |
|---|---:|---:|---|
| `display-xl` | `56/60px` | 650 | Landing thesis only |
| `display-lg` | `40/44px` | 650 | Screen title, report conclusion |
| `heading-1` | `30/36px` | 650 | Major pane heading |
| `heading-2` | `22/28px` | 650 | Directive, finding title |
| `body-lg` | `20/32px` | 450 | Live transcript, novice speech |
| `body` | `16/25px` | 450 | Standard content |
| `body-sm` | `14/21px` | 500 | Dense ledgers; never primary projector content |
| `label` | `12/16px` | 650 | Uppercase metadata, `0.08em` tracking |
| `mono` | `12/18px` | 500 | IDs, timestamps, sources |

Use sentence case everywhere except compact state labels. Do not use all-caps paragraphs. Tabular numerals are required for times and confidence values.

## Space, radius, and borders

- Base spacing unit: `4px`. Primary rhythm: `8, 12, 16, 24, 32, 48, 64`.
- Page gutter: `32px` desktop/projector, `20px` tablet, `16px` mobile.
- Live-room gaps: `12px`; do not waste projector space with oversized gutters.
- Panel padding: `20px`; featured directive/evidence padding: `24px`.
- Radius: `2px` for chips, `4px` for controls/cards, `6px` maximum for major panels. No pills except actual concept-state pills and phase chips.
- Default border: `1px solid var(--border)`; structural dividers: `2px solid var(--border-strong)`; selected or critical edge: `3px`.
- Shadows are rare: only the warm directive card may use `4px 4px 0 var(--shadow-hard)`. No blurred shadows.
- Focus ring: `2px solid var(--focus)` with `2px` offset. It must remain visible against every state color.

## Texture and background

Use one cheap CSS-only ruled texture on the page background:

```css
background-color: var(--bg-canvas);
background-image: repeating-linear-gradient(
  to bottom,
  transparent 0,
  transparent 31px,
  var(--rule-faint) 32px
);
```

This is a structural rule, not a decorative gradient: opacity should read at roughly 6% and disappear beneath opaque working panels. Add a `2px` vertical ochre rule to evidence and directive regions where a notebook margin would sit. Do not add grain, glow, blur, or simulated chalk dust.

## Motion

All motion uses `prefers-reduced-motion` fallbacks and the easing `cubic-bezier(0.2, 0, 0, 1)`. Nothing bounces or overshoots.

- **New agent event:** `220ms`; enter with opacity `0→1` and `translateY(6px→0)`. Its identity rule draws from `scaleY(0→1)` over `180ms`. Existing rows do not shift until the new row has reserved its height.
- **Claim state update:** `180ms`; border color and background tint crossfade. A verification mark draws once; no repeated pulsing.
- **Concept misconception → established:** a key demo beat lasting `280ms`. First the old clipped-corner pill compresses horizontally to `scaleX(.94)` for `100ms`; at the midpoint, label/color swap and a double inset rule appears; then it returns to `scaleX(1)`. A short `2px` underline sweeps left-to-right underneath. Preserve the pill’s position and width so the map feels corrected, not shuffled.
- **Novice speaking:** three short vertical bars beside `NOVICE` change height in a quiet `900ms` linear stagger. Use ochre, no halo and no waveform spectacle. When speech ends, bars settle to equal `4px` height within `150ms`.
- **Phase change:** the old phase label fades in `150ms`; the new label enters from `4px` right over `200ms`. Do not animate the entire screen.

## Component vocabulary

### Agent event row

`relative grid grid-cols-[4px_28px_1fr] gap-x-3 border-b border-border bg-bg-panel px-3 py-3 min-h-[68px]`. First column is the agent identity rule (`w-1 h-full bg-agent-*`); second is a simple 20px inline icon inside `h-7 w-7 border border-current rounded-[2px]`; content uses a mono `12px` timestamp, `14/20px font-medium` summary, and optional evidence reference. Hover becomes `bg-bg-raised`; selected adds `outline outline-2 outline-border-strong`. Never render agent messages as chat bubbles.

### Claim ledger row

`grid grid-cols-[56px_1fr_auto] gap-3 items-start border-b border-border px-3 py-3 bg-bg-panel`. Claim ID is `font-mono text-[12px] text-text-muted`; claim is `text-[14px] leading-5 text-text-primary line-clamp-3`; state badge is always visible. Contradicted rows gain `border-l-[3px] border-claim-contradicted`, uncertain rows `border-l-[3px] border-dashed border-claim-uncertain`, verified rows `border-b-2 border-claim-verified`. Expanded rows reveal the exact quote and source, never just a confidence score.

### Concept pill

`inline-flex min-h-9 items-center gap-2 border-2 px-3 py-1.5 rounded-[999px] text-[14px] leading-5 font-semibold whitespace-nowrap`. Include a 7px geometric state marker before the label. Established: solid green with `shadow-[inset_0_0_0_1px_var(--bg-canvas)]`; misconceived: coral with `clip-path: polygon(0_0,calc(100%-8px)_0,100%_8px,100%_100%,0_100%)`; assisted: blue with a small corner notch; missing: transparent dashed border; assumed: ochre diagonal hatch. Text must maintain at least 7:1 contrast where practical.

### Directive card — “Why this question”

`relative border-2 border-accent bg-paper text-ink-paper p-6 rounded-[4px] shadow-[4px_4px_0_var(--shadow-hard)]`. Add a `3px` dark vertical margin rule at `left-4`; content starts at `pl-5`. Eyebrow is mono uppercase `12px`; question is Bitter `22/30px font-semibold`; rationale is Plex Sans `15/23px`; footer shows targeted concept and expected diagnostic signal. This is the only light card in the live room, so it reads immediately as the novice’s intervention.

### Evidence quote block

`relative border-y-2 border-border-strong bg-bg-evidence px-6 py-5 pl-10`. Add a left bracket using pseudo-elements: a `2px` vertical line with `8px` top and bottom caps in `--accent`. Quote is Bitter `18/28px text-text-primary`; no decorative quotation marks. Beneath it: `font-mono text-[12px] text-text-muted` containing speaker, timestamp, transcript line, and linked claim ID. Highlight only the decisive phrase with `background: var(--evidence-mark)` and `color: var(--text-primary)`; never highlight a whole paragraph. Every finding should reach one of these blocks within one click.

### Verification badge

`inline-flex h-7 items-center gap-1.5 border px-2 rounded-[2px] font-mono text-[11px] font-semibold tracking-[0.06em] uppercase`. Use icon + label + state color. Verified adds a double bottom border; uncertain uses dashed border; contradicted uses a `3px` left edge. Copy is `Verified`, `Uncertain`, `Contradicted`, or `Observed`—never “AI approved.”

### Review-task card

`grid grid-cols-[6px_1fr_auto] border border-border bg-bg-panel min-h-[112px] rounded-[4px] overflow-hidden`. Severity occupies the full-height first rail. Body `p-4`; title `16/22px font-semibold`; evidence summary `14/20px text-text-secondary`; right column `p-4 text-right` contains evidence count and `Review` action. Selected state uses `border-border-strong bg-bg-raised`; critical uses a coral rail but does not tint the entire card red.

### Phase chip

`inline-flex h-8 items-center border-2 border-border-strong px-3 rounded-full font-mono text-[12px] font-semibold tracking-[0.08em] uppercase`. Inactive phases are transparent with muted text. Active phase uses `bg-accent text-ink-on-accent border-accent` and begins with a small solid square, not a glowing dot. Labels: `Teach`, `Probe`, `Teach-back`, `Examine`.

## Layout and accessibility guardrails

- Preserve one dominant reading order per screen. The live room’s order is phase/concepts → transcript → novice directive → supporting agents/claims.
- At `1440px`, never let the transcript column fall below `620px` or the active novice question below `20px`.
- All semantic colors must pass WCAG AA with their assigned foreground. State labels and geometry remain present for color-blind users.
- Keyboard focus follows transcript, current directive, concept map, agent feed, claim ledger. Agent stream updates use `aria-live="polite"`; transcript transcription does not continuously steal announcements.
- Freeze automatic feed scrolling while the user is reviewing older evidence. Show `3 new observations` as a quiet bordered control.
- Avoid charts when direct concept labels or evidence counts are clearer. Coverage is a map of named concepts, not a donut percentage.

## Voice and copy tone

Curio is candid about what it heard and modest about what it knows. The novice asks plain, specific questions; the examiner describes evidence without scolding. Never use scores, streaks, celebrations, “awesome,” “level up,” or corporate phrases such as “unlock insights.”

1. Empty transcript: **“I’m listening. Start wherever you would start with a new student.”**
2. Empty claim ledger: **“No testable claims yet. Definitions and examples will appear here as you teach.”**
3. Teach phase banner: **“Teach freely. I’ll wait for the idea to take shape.”**
4. Probe phase banner: **“I found one point worth slowing down for.”**
5. Novice question button: **“Let the novice ask”**
6. Directive rationale: **“Why this question: it separates a memorized rule from an understood cause.”**
7. Uncertain finding: **“The explanation supports this, but does not settle it.”**
8. Teach-back start: **“Now I’ll explain it using only what you gave me.”**
9. Missing concept: **“Not taught yet”**
10. Expert queue empty state: **“Nothing requires expert judgment. The evidence trail is still available.”**

## Hard bans in practice

No purple-to-blue gradients; no translucent blurred cards; no emoji icons; no floating dashboard tile mosaic; no stock illustrations; no confetti; no neon edges or glow. Do not round every object. Do not fill dead space with vanity metrics. If a section resembles a generic analytics dashboard, replace its chart or KPI tile with the relevant concept names, transcript evidence, or a ruled working surface.

## Ready-to-paste CSS variables

```css
:root {
  color-scheme: dark;

  --bg-canvas: #0d1714;
  --bg-panel: #14231e;
  --bg-raised: #1c3029;
  --bg-evidence: #10201b;
  --bg-sunken: #09110f;
  --paper: #f0e4bf;
  --ink-paper: #182019;

  --text-primary: #f4eedb;
  --text-secondary: #c9d2ca;
  --text-muted: #9eaea3;
  --text-disabled: #728078;
  --ink-on-accent: #182019;

  --border: #385047;
  --border-strong: #6f8479;
  --rule-faint: rgba(244, 238, 219, 0.06);
  --shadow-hard: #050b09;
  --focus: #f6cf79;
  --accent: #e6b85c;
  --accent-hover: #f0c970;
  --evidence-mark: rgba(230, 184, 92, 0.28);

  --claim-observed: #72a7bd;
  --claim-verified: #6fb18b;
  --claim-contradicted: #d96c5f;
  --claim-uncertain: #e6b85c;

  --concept-established: #7fc29a;
  --concept-misconceived: #e17b6f;
  --concept-assisted: #79adc2;
  --concept-missing: #91a198;
  --concept-assumed: #d4a956;

  --severity-info: #72a7bd;
  --severity-attention: #e6b85c;
  --severity-critical: #d96c5f;

  --agent-claim: #74a9bd;
  --agent-verifier: #72b18c;
  --agent-jargon: #d0a85d;
  --agent-question: #d98568;
  --agent-concept: #9b91c1;
  --agent-curriculum: #82aaa0;

  --font-display: "Bitter", Georgia, serif;
  --font-sans: "IBM Plex Sans", Arial, sans-serif;
  --font-mono: "IBM Plex Mono", Consolas, monospace;

  --radius-chip: 2px;
  --radius-control: 4px;
  --radius-panel: 6px;
  --motion-fast: 150ms;
  --motion-base: 220ms;
  --motion-demo: 280ms;
  --ease-curio: cubic-bezier(0.2, 0, 0, 1);
}
```

## Ready-to-paste Tailwind color mapping

```ts
// tailwind.config.ts — theme.extend
colors: {
  bg: {
    canvas: "var(--bg-canvas)",
    panel: "var(--bg-panel)",
    raised: "var(--bg-raised)",
    evidence: "var(--bg-evidence)",
    sunken: "var(--bg-sunken)",
  },
  text: {
    primary: "var(--text-primary)",
    secondary: "var(--text-secondary)",
    muted: "var(--text-muted)",
    disabled: "var(--text-disabled)",
  },
  paper: "var(--paper)",
  "ink-paper": "var(--ink-paper)",
  accent: {
    DEFAULT: "var(--accent)",
    hover: "var(--accent-hover)",
  },
  border: {
    DEFAULT: "var(--border)",
    strong: "var(--border-strong)",
  },
  claim: {
    observed: "var(--claim-observed)",
    verified: "var(--claim-verified)",
    contradicted: "var(--claim-contradicted)",
    uncertain: "var(--claim-uncertain)",
  },
  concept: {
    established: "var(--concept-established)",
    misconceived: "var(--concept-misconceived)",
    assisted: "var(--concept-assisted)",
    missing: "var(--concept-missing)",
    assumed: "var(--concept-assumed)",
  },
  severity: {
    info: "var(--severity-info)",
    attention: "var(--severity-attention)",
    critical: "var(--severity-critical)",
  },
  agent: {
    claim: "var(--agent-claim)",
    verifier: "var(--agent-verifier)",
    jargon: "var(--agent-jargon)",
    question: "var(--agent-question)",
    concept: "var(--agent-concept)",
    curriculum: "var(--agent-curriculum)",
  },
  focus: "var(--focus)",
},
fontFamily: {
  display: ["var(--font-display)"],
  sans: ["var(--font-sans)"],
  mono: ["var(--font-mono)"],
},
borderRadius: {
  chip: "var(--radius-chip)",
  control: "var(--radius-control)",
  panel: "var(--radius-panel)",
},
```
