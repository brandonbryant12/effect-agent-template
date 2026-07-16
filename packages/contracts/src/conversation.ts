import { Schema } from "effect";
import { Timestamp } from "./common.js";
import { AgentRunId, ConversationId, MessageId, ProjectId } from "./ids.js";

export const MessageRole = Schema.Literals([
  "user",
  "assistant",
  "tool",
  "system",
]);

export const TextPart = Schema.TaggedStruct("TextPart", {
  text: Schema.String,
});

export const StatusPart = Schema.TaggedStruct("StatusPart", {
  status: Schema.String,
});

export const ToolPart = Schema.TaggedStruct("ToolPart", {
  callId: Schema.String,
  toolName: Schema.String,
  state: Schema.Literals([
    "proposed",
    "awaiting-approval",
    "running",
    "completed",
    "failed",
  ]),
  input: Schema.Unknown,
  output: Schema.NullOr(Schema.Unknown),
});

export const MessagePart = Schema.Union([TextPart, StatusPart, ToolPart]);
export type MessagePart = typeof MessagePart.Type;

export const Message = Schema.Struct({
  id: MessageId,
  conversationId: ConversationId,
  runId: Schema.NullOr(AgentRunId),
  role: MessageRole,
  parts: Schema.Array(MessagePart),
  createdAt: Timestamp,
});
export type Message = typeof Message.Type;

export const Conversation = Schema.Struct({
  id: ConversationId,
  projectId: ProjectId,
  title: Schema.String,
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type Conversation = typeof Conversation.Type;

export const CreateConversation = Schema.Struct({
  projectId: ProjectId,
  title: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(120)),
});
export type CreateConversation = typeof CreateConversation.Type;
