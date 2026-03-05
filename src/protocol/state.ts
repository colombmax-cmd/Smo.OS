import { rebuildState } from "../core/state";
import { AnyEvent } from "./events";

export { rebuildState };

export function projectCanonicalState(events: AnyEvent[]) {
  return rebuildState(events);
}
