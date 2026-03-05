import * as fs from "fs";
import * as path from "path";

export type NamespaceStatus = "experimental" | "stable" | "deprecated";

export type NamespaceEntry = {
  namespace: string;
  owner: string;
  status: NamespaceStatus;
specVersion?: string;
  version?: string; // legacy alias
  spec: string;
  eventTypes: string[];
  contact?: string;
  compat?: {
    backward: boolean;
    notes?: string;
  };
};

export type NamespaceRegistry = {
  registryVersion?: string;
  version?: string; // legacy alias
  namespaces: NamespaceEntry[];
};

export type RegistryValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

export type EventTypeDiagnostic = {
  eventType: string;
  namespace: string;
  eventName: string;
  knownNamespace: boolean;
  deprecatedNamespace: boolean;
  errors: string[];
  warnings: string[];
};

const DEFAULT_REG_PATH = path.resolve(process.cwd(), "docs", "protocol", "registry", "namespaces.json");

const NAMESPACE_RE = /^(plos\.[a-z0-9]+(?:\.[a-z0-9]+)*|[a-z0-9]+(?:\.[a-z0-9]+)+)$/;
const EVENT_NAME_RE = /^[A-Z][A-Za-z0-9]*$/;
const SEMVER_RE = /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/;

export function parseEventType(eventType: string): { namespace: string; eventName: string } {
  const idx = eventType.indexOf("/");
  if (idx <= 0 || idx === eventType.length - 1) {
    throw new Error(`registry_invalid_event_name: invalid event type format '${eventType}'`);
  }
  return {
    namespace: eventType.slice(0, idx),
    eventName: eventType.slice(idx + 1),
  };
}

export function isReservedNamespace(namespace: string): boolean {
  return namespace === "plos.core" || namespace === "plos.security";
}

export function loadNamespaceRegistry(registryPath = DEFAULT_REG_PATH): NamespaceRegistry {
  if (!fs.existsSync(registryPath)) {
    throw new Error(`registry_invalid_schema: registry file not found at ${registryPath}`);
  }
  const raw = fs.readFileSync(registryPath, "utf8");
  return JSON.parse(raw) as NamespaceRegistry;
}

export function validateNamespaceRegistry(registry: NamespaceRegistry): RegistryValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!registry || typeof registry !== "object") {
    return { ok: false, errors: ["registry_invalid_schema: registry root must be an object"], warnings };
  }

  const regVersion = registry.registryVersion ?? registry.version;
  if (typeof regVersion !== "string") {
    errors.push("registry_invalid_schema: registryVersion (or legacy version) must be a string");
  } else if (regVersion !== "0.1.0" && regVersion !== "0.1") {
    errors.push(`registry_unsupported_version: ${regVersion}`);
  }

  if (!Array.isArray(registry.namespaces)) {
    errors.push("registry_invalid_schema: namespaces must be an array");
    return { ok: false, errors, warnings };
  }

  const seenNamespaces = new Set<string>();

  for (const [i, entry] of registry.namespaces.entries()) {
    const where = `namespaces[${i}]`;

    if (!entry || typeof entry !== "object") {
      errors.push(`registry_invalid_schema: ${where} must be an object`);
      continue;
    }

    if (typeof entry.namespace !== "string" || !entry.namespace) {
      errors.push(`registry_invalid_schema: ${where}.namespace must be a non-empty string`);
    } else {
      if (!NAMESPACE_RE.test(entry.namespace)) {
        errors.push(`registry_invalid_schema: ${where}.namespace invalid syntax (${entry.namespace})`);
      }
      if (seenNamespaces.has(entry.namespace)) {
        errors.push(`registry_duplicate_namespace: ${entry.namespace}`);
      }
      seenNamespaces.add(entry.namespace);
    }

    if (typeof entry.owner !== "string" || !entry.owner.trim()) {
      errors.push(`registry_invalid_schema: ${where}.owner must be a non-empty string`);
    }

    if (!["experimental", "stable", "deprecated"].includes(entry.status)) {
      errors.push(`registry_invalid_schema: ${where}.status must be experimental|stable|deprecated`);
    }

    const specVersion = entry.specVersion ?? entry.version;
    if (typeof specVersion !== "string" || !SEMVER_RE.test(specVersion)) {
      errors.push(`registry_invalid_schema: ${where}.specVersion (or legacy version) must be semver-like`);
    }

    if (typeof entry.spec !== "string" || !entry.spec.trim()) {
      errors.push(`registry_invalid_schema: ${where}.spec must be a non-empty string`);
    }

    if (!Array.isArray(entry.eventTypes)) {
      errors.push(`registry_invalid_schema: ${where}.eventTypes must be an array`);
    } else {
      const seenTypes = new Set<string>();
      for (const ev of entry.eventTypes) {
        if (typeof ev !== "string" || !ev) {
          errors.push(`registry_invalid_schema: ${where}.eventTypes contains non-string`);
          continue;
        }
        if (!EVENT_NAME_RE.test(ev)) {
          errors.push(`registry_invalid_event_name: ${entry.namespace}/${ev}`);
        }
        if (seenTypes.has(ev)) {
          errors.push(`registry_invalid_schema: duplicate eventTypes entry ${entry.namespace}/${ev}`);
        }
        seenTypes.add(ev);
      }
    }

    if (entry.status === "deprecated") {
      warnings.push(`extension_deprecated_event_emitted: namespace ${entry.namespace} is deprecated`);
    }

    if (entry.namespace.startsWith("plos.") && !isReservedNamespace(entry.namespace)) {
      warnings.push(`unknown reserved-like namespace: ${entry.namespace}`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function getNamespaceEntry(registry: NamespaceRegistry, namespace: string): NamespaceEntry | undefined {
  return registry.namespaces.find((e) => e.namespace === namespace);
}

export function diagnoseEventType(eventType: string, registry: NamespaceRegistry): EventTypeDiagnostic {
  const errors: string[] = [];
  const warnings: string[] = [];
  let namespace = "";
  let eventName = "";

  try {
    const parsed = parseEventType(eventType);
    namespace = parsed.namespace;
    eventName = parsed.eventName;
  } catch (e) {
    errors.push((e as Error).message);
    return {
      eventType,
      namespace,
      eventName,
      knownNamespace: false,
      deprecatedNamespace: false,
      errors,
      warnings,
    };
  }

  if (!NAMESPACE_RE.test(namespace)) {
    errors.push(`registry_invalid_schema: invalid namespace syntax '${namespace}'`);
  }
  if (!EVENT_NAME_RE.test(eventName)) {
    errors.push(`registry_invalid_event_name: invalid EventName '${eventName}'`);
  }

  const entry = getNamespaceEntry(registry, namespace);
  const knownNamespace = Boolean(entry);
  const deprecatedNamespace = entry?.status === "deprecated";

  if (!knownNamespace) {
    warnings.push("extension_unknown_namespace");
  } else if (deprecatedNamespace) {
    warnings.push("extension_deprecated_event_emitted");
  }

  if (entry && entry.eventTypes.length > 0 && !entry.eventTypes.includes(eventName)) {
    warnings.push(`event type not declared in registry entry: ${eventType}`);
  }

  return {
    eventType,
    namespace,
    eventName,
    knownNamespace,
    deprecatedNamespace,
    errors,
    warnings,
  };
}

export function defaultRegistryPath() {
  return DEFAULT_REG_PATH;
}
