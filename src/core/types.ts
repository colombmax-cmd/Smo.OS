export type EntityId = string;

export type EventType =
  | "EntityCreated"
  | "StateUpdated"
  | "RelationAdded"
  | "RelationRemoved"
  | "MetricRecorded";

export interface Event {
  id: string;
  type: EventType;
  entityId: EntityId;
  payload: Record<string, any>;
  timestamp: number;
}