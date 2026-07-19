import type {
  Conversation,
  ConversationId,
  CreateConversation,
} from "@repo/contracts";
import {
  ConversationId as ConversationIdSchema,
  Timestamp,
} from "@repo/contracts";
import { Context, Effect, Layer, Ref, Schema } from "effect";
import type { AccessScope } from "./access-scope.js";
import type { PersistenceError } from "./errors.js";

export class ConversationNotFound extends Schema.TaggedErrorClass<ConversationNotFound>()(
  "ConversationNotFound",
  { conversationId: ConversationIdSchema },
) {}

export class ConversationService extends Context.Service<
  ConversationService,
  {
    readonly create: (
      scope: AccessScope,
      input: CreateConversation,
    ) => Effect.Effect<Conversation, PersistenceError>;
    readonly get: (
      scope: AccessScope,
      id: ConversationId,
    ) => Effect.Effect<Conversation, ConversationNotFound | PersistenceError>;
  }
>()("repo/ConversationService") {}

const conversationId = (value: number): ConversationId =>
  Schema.decodeUnknownSync(ConversationIdSchema)(
    `conversation_${value.toString().padStart(26, "0")}`,
  );
const timestamp = (value: string) => Schema.decodeUnknownSync(Timestamp)(value);

export const ConversationServiceTest = Layer.effect(
  ConversationService,
  Effect.gen(function* () {
    const state = yield* Ref.make(
      new Map<
        ConversationId,
        { readonly scope: AccessScope; readonly value: Conversation }
      >(),
    );
    let sequence = 0;

    const get = (scope: AccessScope, id: ConversationId) =>
      Effect.flatMap(Ref.get(state), (conversations) => {
        const record = conversations.get(id);
        return record &&
          record.scope.tenantId === scope.tenantId &&
          record.scope.userId === scope.userId
          ? Effect.succeed(record.value)
          : Effect.fail(new ConversationNotFound({ conversationId: id }));
      });

    return ConversationService.of({
      create: (scope, input) =>
        Effect.gen(function* () {
          sequence += 1;
          const now = timestamp("2026-07-19T12:00:00.000Z");
          const value: Conversation = {
            id: conversationId(sequence),
            projectId: input.projectId,
            title: input.title,
            createdAt: now,
            updatedAt: now,
          };
          yield* Ref.update(state, (current) =>
            new Map(current).set(value.id, { scope, value }),
          );
          return value;
        }),
      get,
    });
  }),
);
