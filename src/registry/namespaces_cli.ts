#!/usr/bin/env node
import {
  defaultRegistryPath,
  diagnoseEventType,
  loadNamespaceRegistry,
  parseEventType,
  validateNamespaceRegistry,
} from "./namespaces";

function argValue(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx < 0 || idx + 1 >= process.argv.length) return undefined;
  return process.argv[idx + 1];
}

function usage() {
  console.log("namespaces registry CLI");
  console.log("  validate [--registry <path>]");
  console.log("  list [--registry <path>]");
  console.log("  check-event <namespace/EventName> [--registry <path>]");
}

async function main() {
  const [, , command, ...args] = process.argv;
  const registryPath = argValue("--registry") || defaultRegistryPath();

  if (!command) {
    usage();
    process.exit(0);
  }

  const registry = loadNamespaceRegistry(registryPath);

  if (command === "validate") {
    const res = validateNamespaceRegistry(registry);
    if (!res.ok) {
      console.error("Registry validation failed:");
      for (const e of res.errors) console.error(`- ${e}`);
      for (const w of res.warnings) console.warn(`- warning: ${w}`);
      process.exit(1);
    }
    console.log(`Registry valid (${registry.namespaces.length} namespaces).`);
    for (const w of res.warnings) console.warn(`warning: ${w}`);
    process.exit(0);
  }

  if (command === "list") {
    const sorted = [...registry.namespaces].sort((a, b) => a.namespace.localeCompare(b.namespace));
    for (const n of sorted) {
      const specVersion = n.specVersion || n.version || "unknown";
      console.log(`${n.namespace} [${n.status}] spec ${specVersion} owner=${n.owner} events=${n.eventTypes.length}`);
    }
    process.exit(0);
  }

  if (command === "check-event") {
    const eventType = args.find((a) => !a.startsWith("--"));
    if (!eventType) {
      console.error("Usage: check-event <namespace/EventName> [--registry <path>]");
      process.exit(1);
    }

    try {
      parseEventType(eventType);
    } catch (e) {
      console.error((e as Error).message);
      process.exit(1);
    }

    const diag = diagnoseEventType(eventType, registry);
    console.log(JSON.stringify(diag, null, 2));
    process.exit(diag.errors.length > 0 ? 1 : 0);
  }

  usage();
  process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
