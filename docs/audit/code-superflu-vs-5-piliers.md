# Audit POC — code potentiellement superflu vs les 5 piliers du README

Ce document identifie le **code qui ne correspond pas directement** aux 5 piliers de la roadmap du README (Core, Integrity & Sovereignty, Interoperability, Performance, Agent Runtime Safety).

> Important : "superflu" ici veut dire **hors périmètre des 5 piliers** pour un POC focalisé protocole. Ce n'est pas forcément du mauvais code ; c'est surtout du code de distribution/packaging/demo qui peut être déplacé dans un repo séparé.

## 1) Rappel du périmètre officiel (README)

Les 5 piliers explicitement listés sont :
- Core
- Integrity & Sovereignty
- Interoperability
- Performance
- Agent Runtime Safety

Source: section "Roadmap" du README.

## 2) Code aligné aux 5 piliers (non superflu)

Ces zones sont cohérentes avec la roadmap et ne sont **pas** du superflu pour le POC protocolaire :

- `src/core/*` + `conformance/case-*` + `conformance/run.ts` (Core)
- `src/crypto/*` + `conformance/crypto-*.ts` (Integrity & Sovereignty)
- `src/transport/*`, `src/bundles/*`, `src/registry/*`, `src/protocol/*` (Interoperability)
- `src/runtime/*` + `conformance/sandbox-run.ts` (Agent Runtime Safety)
- `docs/protocol/*` (spécifications des piliers)

## 3) Code potentiellement superflu (hors 5 piliers)

### A. Packaging / publication npm (hors protocole)

**Pourquoi hors périmètre :** les 5 piliers décrivent des capacités protocole/runtime. La publication npm est une mécanique de distribution.

- `package.json` (champs publication/distribution):
  - `name: "@plos/protocol"`, `main`, `types`, `files`, `exports`
  - script `prepack`
  - script `protocol:smoke`

Ces éléments servent le packaging SDK, pas les invariants des 5 piliers.

### B. Packaging OS (Debian/APT)

**Pourquoi hors périmètre :** construire un `.deb` ou un repo APT est de la distribution système, pas du protocole PLOS.

- `scripts/build-deb.sh`
- `scripts/build-apt-repo.sh`

Si l'objectif POC est de valider les piliers techniques, ces scripts peuvent être sortis vers un repo "distribution".

### C. Démo d'orchestration d'agents (POC applicatif)

**Pourquoi potentiellement hors périmètre :** le README l'annonce comme bloc "minimal" de démonstration, distinct de la roadmap des piliers.

- `src/agents/minimal.ts`
- `src/agents/poc_agents_cli.ts`
- scripts npm `agents:poc*`

Ce code n'implémente pas directement les specs runtime safety ; il démontre un usage applicatif au-dessus du socle.

## 4) Recommandation pragmatique (si tu veux "dégraisser")

### Niveau 1 — immédiat (zéro risque protocole)
- Garder le code mais marquer comme "hors cœur 5 piliers" dans la doc.
- Déplacer les scripts Debian/APT dans un dossier `extras/distribution/`.

### Niveau 2 — simplification du repo
- Extraire `src/agents/*` vers un repo "examples".
- Conserver ici uniquement le noyau protocole + conformance + specs.

### Niveau 3 — séparation complète
- Repo A: `plos-core` (piliers)
- Repo B: `plos-sdk-publish` (npm packaging)
- Repo C: `plos-distribution` (.deb/APT)
- Repo D: `plos-examples-agents`

## 5) Décision finale suggérée

Si ton objectif court terme est d'éviter la dispersion "publication/packages", le meilleur compromis est :

1. **Ne toucher à aucun code de piliers**.
2. **Sortir `scripts/build-*.sh`** du repo principal en premier.
3. **Tagger `src/agents/*` comme exemple non-bloquant** (ou l'extraire ensuite).

## 6) Statut

- ✅ Les éléments du point 3 ont été retirés du repo principal pour revenir à une base protocolaire plus saine (publication npm, scripts Debian/APT, démo agents).
