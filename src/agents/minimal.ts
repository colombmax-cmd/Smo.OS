export type AgentTask = {
  id: string;
  capability: string;
  input: Record<string, unknown>;
};

export type AgentResult = {
  taskId: string;
  executorId: string;
  capability: string;
  output: Record<string, unknown>;
};

export interface ExecutorAgent {
  id: string;
  capabilities: string[];
  execute(task: AgentTask): AgentResult;
}

export class MinimalOrchestrator {
  private readonly executors: ExecutorAgent[];

  constructor(executors: ExecutorAgent[]) {
    this.executors = executors;
  }

  listCapabilities(): Record<string, string[]> {
    const byExecutor: Record<string, string[]> = {};
    for (const executor of this.executors) {
      byExecutor[executor.id] = [...executor.capabilities];
    }
    return byExecutor;
  }

  dispatch(task: AgentTask): AgentResult {
    const selected = this.executors.find((ex) => ex.capabilities.includes(task.capability));
    if (!selected) {
      throw new Error(`No executor available for capability: ${task.capability}`);
    }
    return selected.execute(task);
  }
}

export class SummarizeExecutor implements ExecutorAgent {
  id = "executor.summarize.v1";
  capabilities = ["summarize.text"];

  execute(task: AgentTask): AgentResult {
    const text = String(task.input.text ?? "").trim();
    const maxWords = Number(task.input.maxWords ?? 12);
    const summary = text
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, Math.max(1, maxWords))
      .join(" ");

    return {
      taskId: task.id,
      executorId: this.id,
      capability: task.capability,
      output: {
        summary,
        sourceLength: text.length,
      },
    };
  }
}

export class PriorityClassifierExecutor implements ExecutorAgent {
  id = "executor.priority.v1";
  capabilities = ["classify.priority"];

  execute(task: AgentTask): AgentResult {
    const text = String(task.input.text ?? "").toLowerCase();
    const score =
      (text.includes("urgent") ? 2 : 0) +
      (text.includes("today") ? 1 : 0) +
      (text.includes("asap") ? 1 : 0);

    const priority = score >= 3 ? "high" : score >= 1 ? "medium" : "low";

    return {
      taskId: task.id,
      executorId: this.id,
      capability: task.capability,
      output: {
        priority,
        score,
      },
    };
  }
}

export function buildMinimalPocOrchestrator(): MinimalOrchestrator {
  return new MinimalOrchestrator([
    new SummarizeExecutor(),
    new PriorityClassifierExecutor(),
  ]);
}
