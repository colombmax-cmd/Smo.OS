Compatibility Policy (Smo.OS)

This document defines how Smo.OS evolves without breaking users, data, or interoperability.

1. What counts as a public interface

The following are considered public and must follow compatibility rules:

On-disk formats

data/events.jsonl (buffer)

data/segments/seg-XXXXXX.jsonl

data/segments/seg-XXXXXX.manifest.json

data/keys/registry.json (if used for verification)

Any future docs/* normative formats (anchors, snapshots, bundles)


CLI surface (anything documented in README)

npm run dev <command>

npm run crypto:<command>


Normative behavior

Deterministic ordering rules

Verification rules (crypto:verify strictness, exit codes)



Internal modules, file layout under src/, refactors, and helper scripts are not public as long as they do not change the above.

2. Versioning rules

Smo.OS uses spec-versioned formats. Any format that is verified MUST contain a version field.

Patch change (x.y.Z)

Refactors, tests, docs, performance improvements

No changes to on-disk formats, CLI semantics, or verification outcomes


Minor change (x.Y.z)

Backward-compatible extensions

New optional fields in manifests

New commands / flags that do not change defaults

New algorithm suites MAY be added, but baseline support MUST remain


Major change (X.y.z)

Breaking changes to on-disk formats, CLI defaults, or normative rules

MUST bump manifest.version (and any other relevant spec version)

MUST provide a migration path (at minimum: documented re-seal / re-export procedure)



3. Strictness and forward-compat

crypto:verify is strict by default.

Unknown manifest.version MUST fail verification.

Unknown algo.* values MUST fail verification unless explicitly enabled by a flag (e.g. --allow-unknown-algos).

New fields must not change the meaning of existing fields.


4. Backward-compat guarantees

Existing sealed segments MUST remain verifiable across patch/minor releases.

If a breaking change is required, it MUST be a major release with a new format version.


5. Migration expectations

For any major change, provide one of:

Automated migration: crypto:migrate converting old formats to the new formats

Deterministic re-derivation: documented procedure to regenerate segments/manifests from a trusted source log


6. Recommendations for contributors

Prefer adding new optional fields over changing existing ones.

Prefer new commands/flags over changing defaults.

Any change that affects verification must include new conformance fixtures.


7. Conformance tests

Any normative rule change MUST be accompanied by:

A fixture (input events / segments)

Expected outputs (roots, manifests, verification outcomes)



---

Goal: enable long-term interoperability while allowing rapid iteration on internal code.