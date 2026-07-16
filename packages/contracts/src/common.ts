import { Schema } from "effect";

export const Timestamp = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
).pipe(Schema.brand("Timestamp"));
export type Timestamp = typeof Timestamp.Type;

export const NonEmptyText = Schema.Trim.check(Schema.isMinLength(1));
export const Name = NonEmptyText.check(Schema.isMaxLength(120));
export const Description = Schema.NullOr(
  Schema.String.check(Schema.isMaxLength(10_000)),
);
