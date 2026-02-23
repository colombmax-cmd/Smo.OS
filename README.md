# Smo.OS — POC V0.1
**Smooth Personal Life Operating System**

Smo.OS is a minimal, open, and sovereign implementation of a Personal Life Operating System (PLOS).

It provides a lightweight event-sourced core to represent and persist structured personal state as an append-only log.

The goal is simple:
- Portable personal state
- Deterministic reconstruction
- No cloud dependency
- No central authority

---

## What It Does (POC Scope)

Current V0.1 implements:

- Event-based core (EntityCreated, StateUpdated, etc.)
- Append-only JSONL event log
- Deterministic state reconstruction
- Canonical export
- Basic local sync (log merge by event ID)

This is a proof of concept focused on validating the event-log architecture.

---

## Quick Start

```bash
npm install
npm run dev create "Coach AI"
npm run dev update <entityId> status=in_progress
npm run dev list
npm run dev export
