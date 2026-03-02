export type EntityId = string;

export type CoreEventType =
  | "plos.core/EntityCreated"
  | "plos.core/StateUpdated"
  | "plos.core/RelationAdded"
  | "plos.core/RelationRemoved"
  | "plos.core/MetricRecorded"
  | "plos.core/ConflictResolved";

// Generic interoperability event type: free-form namespace.
export type AnyEventType = string;

// Shared event envelope (structural fields).
export type BaseEvent<TType extends string = string, TPayload = any> = {
  id: string;
  type: TType;
  entityId: string;
  payload: TPayload;
  timestamp: number;

  // Legacy-compatible metadata fields.
  origin?: string;
  seq?: number;
  seen?: Record<string, number>;
};

// Canonical core event (strictly typed to plos.core/* enum).
export type CoreEvent = BaseEvent<CoreEventType>;

// Interop event (accept any event namespace/type).
export type AnyEvent = BaseEvent<AnyEventType>;

export type Event = AnyEvent;

const CORE_PREFIX = "plos.core/";

export function isCoreEvent(e: AnyEvent): e is CoreEvent {
  return typeof e.type === "string" && e.type.startsWith(CORE_PREFIX);
}
