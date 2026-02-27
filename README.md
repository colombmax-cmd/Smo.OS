# Smo.OS — Smooth Personal Life Operating System

Smo.OS is an experimental implementation of a **Personal Life Operating System (PLOS)**.

It provides a minimal, open and sovereign protocol to persist, synchronize and resolve personal cognitive state using an append-only event log.

---

## Core Idea

Your tools change.
Your data should not.

Smo.OS separates:

- **state persistence**
- **synchronization**
- **conflict handling**

from applications, AI agents, or interfaces.

It acts as an infrastructure layer — not a productivity app.

---

## Current Status

✅ Event-sourced core  
✅ Offline-first synchronization  
✅ Deterministic convergence  
✅ Causal conflict detection (`seen` vector)  
✅ Append-only conflict resolution  

POC stage — protocol stabilization in progress.

---

## Architecture
Interfaces / Agents
↑
Ontologies
↑
Smo.OS Core
(event log + sync + causality)

## Quick Start

Install dependencies
Create an entity
Update state
List reconstructed state
Export fill event log
Merge from another instance
List detected conflits
Resolve a conflict
```bash
npm install
npm run dev create "Coach AI"
npm run dev update <entityId> status=in_progress
npm run dev list
npm run dev export
npm run dev sync <path-to-events.jsonl>
npm run dev conflicts
npm run dev resolve <entityId> <field> <chosenEventId>