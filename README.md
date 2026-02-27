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

                 ┌─────────────────────────────────────┐
                 │     Interfaces / Apps / Agents      │
                 │  (CLI, mobile, web, LLM, coach...)  │
                 └─────────────────────────────────────┘
                               ▲
                               │ read/write (events)
                               │
                 ┌─────────────────────────────────────┐
                 │            Ontologies               │
                 │ (finance, health, admin, habits...) │
                 └─────────────────────────────────────┘
                               ▲
                               │ typed events / schemas
                               │
┌───────────────────────────────────────────────────────────────────┐
│                           Smo.OS Core                             │
│  - Event model (EntityCreated, StateUpdated, ConflictResolved...) │
│  - Append-only log (events.jsonl)                                 │
│  - Deterministic ordering (timestamp, origin, seq, id)            │
│  - Causality (seen vector)                                        │
│  - Conflict detection (concurrent writes)                         │
│  - Sync merge (union by id + sort)                                │
└───────────────────────────────────────────────────────────────────┘
                               ▲
                               │ local files (sovereign)
                               │
                 ┌─────────────────────────────────────┐
                 │          Local Storage              │
                 │  data/events.jsonl + data/meta.json │
                 └─────────────────────────────────────┘

---

## Conflict Resolution

        Node A (origin=nodeA)                    Node B (origin=nodeB)
     ┌───────────────────────┐                ┌───────────────────────┐
     │ data/events.jsonl     │                │ data/events.jsonl     │
     │ data/meta.json        │                │ data/meta.json        │
     │  - nextSeq            │                │  - nextSeq            │
     │  - seen{A:x,B:y}      │                │  - seen{A:x,B:y}      │
     └───────────┬───────────┘                └───────────┬───────────┘
                 │                                        │
    offline write│                                        │offline write
                 ▼                                        ▼
   eA: StateUpdated(status=done)             eB: StateUpdated(status=canceled)
   origin=nodeA, seq=10, seen={A:9,B:3}      origin=nodeB, seq=7,  seen={A:9,B:6}

                 │                                        │
                 └─────────────── sync (merge) ───────────┘
                                 (union by id + sort)
                                         ▼
                             merged ordered event stream
                                         ▼
            conflict? same entity+field, different values, concurrent?
              - eA sees eB ?  seenA[B] >= seqB  → 3 >= 7  false
              - eB sees eA ?  seenB[A] >= seqA  → 9 >= 10 false
              => concurrent => CONFLICT DETECTED

                                         ▼
                         user chooses winner append-only:
                 ConflictResolved(field=status, chosenEventId=eA.id)
                                         ▼
                           projection enforces chosen value
                         (without rewriting history)

---

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
