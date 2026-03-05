# Smo.OS Versioning Convention
## Proposal v1

This document defines a unified naming convention for all version mentions across Smo.OS (docs, files, CLI, and on-disk formats).

---

## 1. Goals

- Remove ambiguity between protocol version, document version, and implementation release.
- Keep filenames stable and predictable.
- Ensure machine-readable fields remain strict while human-readable docs stay clear.

---

## 2. Canonical version types

Smo.OS uses **three distinct version domains**.

### 2.1 Spec Version (`specVersion`)

- Scope: normative protocol/format rules.
- Format: SemVer `MAJOR.MINOR.PATCH`.
- Example: `0.2.1`.
- MUST be embedded in machine-readable artifacts when the format is normative.

### 2.2 Document Revision (`docRevision`)

- Scope: prose/document edits only.
- Format: integer revision `rN`.
- Example: `r3`.
- MUST NOT be used as the normative compatibility signal.

### 2.3 Implementation Release (`implVersion`)

- Scope: repository/package release.
- Source of truth: `package.json#version`.
- Format: SemVer.

---

## 3. Display convention

To avoid mixed styles (`v0.1`, `0.1`, `v0.2.1`, etc.), use:

- Human text: `spec 0.2.1` (no `v` prefix)
- Machine fields: `"version": "0.2.1"`
- CLI/help text: `spec 0.2.1`

`v` prefix is deprecated for new text.

---

## 4. File naming convention

For normative protocol docs:

- Pattern: `<topic>-spec-<MAJOR.MINOR>.md`
- Example: `transport-protocol-spec-0.1.md`

For non-normative docs:

- Pattern: `<topic>-guide.md` or `<topic>-notes.md`

Compatibility rule:

- Existing files with legacy names MAY remain during transition.
- New docs MUST follow this convention.

---

## 5. Artifact field naming convention

Use explicit keys to disambiguate intent:

- `specVersion` for normative format compatibility
- `registryVersion` for registry schema version
- `bundleVersion` only when retained for backward compatibility (legacy alias)

Transition recommendation:

- During migration windows, emit both old and new key names when needed.
- Verify using `specVersion` first, fallback to legacy key if absent.

---

## 6. Compatibility bump policy

### 6.1 Patch (`x.y.Z`)

- Clarifications, bug fixes, editorial improvements.
- No breaking format semantics.

### 6.2 Minor (`x.Y.z`)

- Backward-compatible additions.
- Optional fields and optional message types.

### 6.3 Major (`X.y.z`)

- Breaking changes in on-disk/wire semantics.
- Requires migration strategy.

---

## 7. Interoperability naming matrix

- Transport protocol: `protocol = plos.transport/<major.minor>`; payload carries `specVersion` when needed.
- Portable bundles: `bundle.json.specVersion` is canonical; `bundleVersion` accepted as legacy alias.
- Namespace registry: top-level `registryVersion`.
- Segment manifest: `specVersion` (legacy `version` accepted during migration).

---

## 8. Migration plan (incremental)

1. Adopt display convention in README and new docs (`spec X.Y.Z`).
2. New files follow `*-spec-<major.minor>.md`.
3. Add explicit `specVersion`/`registryVersion` keys to new artifacts.
4. Keep legacy keys accepted for one full minor line.
5. Remove legacy keys at next major spec cycle.

---

## 9. Quick lint checklist for contributors

Before merge, verify:

- No new `v0.x` text prefix in docs.
- Each normative artifact uses explicit version key naming.
- Any compatibility-impacting change updates spec version intentionally.
- Migration notes exist when introducing aliases/deprecations.
