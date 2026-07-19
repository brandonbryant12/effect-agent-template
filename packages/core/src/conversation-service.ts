import type {
  Conversation,
  ConversationId,
  CreateConversation,
} from "@repo/contracts";
import { ConversationId as ConversationIdSchema } from "@repo/contracts";
import { Context, Effect, Schema } from "effect";
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
