import { Schema } from "effect";

/**
 * Cross-cutting persistence failure shared by every core capability. Owned
 * here, not by any single domain service, so editing one service file never
 * ripples through the others.
 */
export class PersistenceError extends Schema.TaggedErrorClass<PersistenceError>()(
  "PersistenceError",
  { operation: Schema.String },
) {}
