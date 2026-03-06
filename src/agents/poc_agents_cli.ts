#!/usr/bin/env node
import { randomUUID } from "crypto";
import { buildMinimalPocOrchestrator, AgentTask } from "./minimal";

const [, , command, ...args] = process.argv;
const orchestrator = buildMinimalPocOrchestrator();

function usage() {
  console.log("POC Agents CLI — commands:");
  console.log("  list");
  console.log("  run <capability> [json-input]");
  console.log("");
  console.log("Examples:");
  console.log("  npm run agents:poc:list");
  console.log('  npm run agents:poc:run -- summarize.text "{\"text\":\"PLOS enables interoperable cognitive state\"}"');
}

if (!command) {
  usage();
  process.exit(0);
}

if (command === "list") {
  console.log(JSON.stringify(orchestrator.listCapabilities(), null, 2));
  process.exit(0);
}

if (command === "run") {
  const capability = args[0];
  if (!capability) {
    console.error("Usage: run <capability> [json-input]");
    process.exit(1);
  }

  let input: Record<string, unknown> = {};
  const rawJson = args[1];
  if (rawJson) {
    try {
      input = JSON.parse(rawJson);
    } catch {
      console.error("Invalid json-input. Example: '{\"text\":\"hello\"}'");
      process.exit(1);
    }
  }

  const task: AgentTask = {
    id: randomUUID(),
    capability,
    input,
  };

  try {
    const result = orchestrator.dispatch(task);
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
}

usage();
