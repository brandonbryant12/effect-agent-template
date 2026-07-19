import { CommandId } from "@repo/contracts";
import { Schema } from "effect";

/** Generates a fresh idempotency command id for run-starting requests. */
export const newCommandId = (): CommandId =>
  Schema.decodeUnknownSync(CommandId)(
    `command_${crypto.randomUUID().replaceAll("-", "").slice(0, 26).toUpperCase()}`,
  );
