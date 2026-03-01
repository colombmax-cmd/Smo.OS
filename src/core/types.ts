export type EntityId = string;

export type CoreEventType =
  | "plos.core/EntityCreated"
  | "plos.core/StateUpdated"
  | "plos.core/RelationAdded"
  | "plos.core/RelationRemoved"
  | "plos.core/MetricRecorded"
  | "plos.core/ConflictResolved";

// Event générique interop : type libre
export type AnyEventType = string;

// Base commune (structure)
export type BaseEvent<TType extends string = string, TPayload = any> = {
  id: string;
  type: TType;
  entityId: string;
  payload: TPayload;
  timestamp: number;

  // tes champs existants
  origin?: string;
  seq?: number;
  seen?: Record<string, number>;
};

// Event canonique du core (strict)
export type CoreEvent = BaseEvent<CoreEventType>;

// Event interop (tout accepté)
export type AnyEvent = BaseEvent<AnyEventType>;

export type Event = AnyEvent;

const CORE_PREFIX = "plos.core/";

export function isCoreEvent(e: AnyEvent): e is CoreEvent {
  return typeof e.type === "string" && e.type.startsWith(CORE_PREFIX);
}