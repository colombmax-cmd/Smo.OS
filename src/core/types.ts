export type EntityId = string;

export type EventType =
  | "EntityCreated"
  | "StateUpdated"
  | "RelationAdded"
  | "RelationRemoved"
  | "MetricRecorded"
  | "ConflictResolved";

export interface Event {
  id: string;
  type: EventType;
  entityId: EntityId;
  payload: Record<string, any>;
  timestamp: number;
  origin: string; // e.g. "nodeA"
  seq: number;    // monotonically increasing per origin
  seen: Record<string, number>;
}