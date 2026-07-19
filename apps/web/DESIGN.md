---
version: alpha
name: Agent Ledger
description: Design-system contract for the reference agent workbench.
colors:
  blueprint-paper: "#F3F6F7"
  ink: "#16252D"
  panel: "#FFFFFF"
  panel-muted: "#E8EFF1"
  blueprint: "#325F73"
  blueprint-strong: "#284E5E"
  primary: "#325F73"
  blueprint-foreground: "#FFFFFF"
  signal: "#C64F36"
  signal-strong: "#AD402B"
  signal-foreground: "#FFFFFF"
  border: "#C8D6DB"
  line: "#C8D6DB"
  line-soft: "#D5E0E4"
  line-strong: "#B6C8CF"
  mist: "#8EA9B4"
  ink-muted: "#5D727A"
  ink-subtle: "#65787F"
  surface-raised: "#F8FAFB"
  success: "#2F7D65"
  warning: "#A86618"
  destructive: "#B83A3A"
  code: "#243941"
typography:
  ledger-title:
    fontFamily: Geist Variable
    fontSize: 2rem
    fontWeight: "650"
    lineHeight: "1.05"
    letterSpacing: -0.03em
  section-title:
    fontFamily: Geist Variable
    fontSize: 1rem
    fontWeight: "650"
    lineHeight: "1.25"
    letterSpacing: -0.01em
  body:
    fontFamily: Geist Variable
    fontSize: 0.875rem
    fontWeight: "400"
    lineHeight: "1.55"
    letterSpacing: 0em
  utility:
    fontFamily: ui-monospace
    fontSize: 0.6875rem
    fontWeight: "550"
    lineHeight: "1.35"
    letterSpacing: 0.06em
rounded:
  sm: 4px
  md: 8px
  lg: 12px
  full: 999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
components:
  app-shell:
    backgroundColor: "{colors.blueprint-paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: 16px
  ledger-panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: 16px
  button-primary:
    backgroundColor: "{colors.blueprint}"
    textColor: "{colors.blueprint-foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: 8px
  button-signal:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.signal-foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: 8px
  status-ready:
    backgroundColor: "{colors.success}"
    textColor: "{colors.panel}"
    typography: "{typography.utility}"
    rounded: "{rounded.full}"
    padding: 4px
  status-working:
    backgroundColor: "{colors.warning}"
    textColor: "{colors.panel}"
    typography: "{typography.utility}"
    rounded: "{rounded.full}"
    padding: 4px
  status-failed:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.panel}"
    typography: "{typography.utility}"
    rounded: "{rounded.full}"
    padding: 4px
  surface-muted:
    backgroundColor: "{colors.panel-muted}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: 16px
  border-sample:
    backgroundColor: "{colors.border}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: 4px
  code-label:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.code}"
    typography: "{typography.utility}"
    rounded: "{rounded.sm}"
    padding: 4px
  button-primary-hover:
    backgroundColor: "{colors.blueprint-strong}"
    textColor: "{colors.blueprint-foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: 8px
  button-signal-hover:
    backgroundColor: "{colors.signal-strong}"
    textColor: "{colors.signal-foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: 8px
  ledger-divider:
    backgroundColor: "{colors.line}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: 4px
  ledger-divider-soft:
    backgroundColor: "{colors.line-soft}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: 4px
  ledger-divider-dashed:
    backgroundColor: "{colors.line-strong}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: 4px
  utility-caption:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.utility}"
    rounded: "{rounded.sm}"
    padding: 4px
  utility-caption-subtle:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink-subtle}"
    typography: "{typography.utility}"
    rounded: "{rounded.sm}"
    padding: 4px
  hover-affordance:
    backgroundColor: "{colors.mist}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: 8px
---

## Product thesis

Agent Ledger is a reference workbench for engineers who need to understand an
agent run at a glance. The interface should read like an operational record:
projects and tasks on the left, the active session on the right, and one durable
event spine connecting every state transition.

## Layout

Desktop uses an asymmetric three-zone ledger: a narrow project rail, a task
field, and a wider session transcript. Mobile preserves the same order in a
single column. The slim session tape at the top always shows authentication,
transport, worker, and sandbox state.

## Color and type

Use blueprint paper, ink, and blue for the stable application shell. Oxide
signal is reserved for the primary “run agent” moment. Semantic success,
warning, and destructive colors describe real state only. Geist carries the
interface; IDs, timestamps, and event sequences use the platform monospace.

## Components

Use vendored shadcn source for application controls and official AI Elements
for conversation, markdown, prompt, tool, and approval surfaces. Base UI
primitives are wrapped and exported only from `packages/ui`; application code
does not import Base UI directly.

## Motion

The event spine may reveal new entries with a 140ms opacity and translate
transition. No ambient animation, glowing orb, or decorative gradient is
allowed. Respect `prefers-reduced-motion`.

## Guardrails

Do update this file before introducing a reusable visual token. Do make empty
and error states explain the next action. Do preserve visible focus and a
44-pixel mobile target. Do not use arbitrary feature colors, glassmorphism,
purple AI gradients, or raw markdown output.
