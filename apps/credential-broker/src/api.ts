import type { Principal } from "@repo/auth";
import type { CredentialUploadService, StoredCredential } from "@repo/secrets";
import { Effect, Redacted } from "effect";

export interface CredentialUploadHandlerOptions {
  readonly authenticate: (
    headers: Headers,
  ) => Effect.Effect<Principal, unknown>;
  readonly uploads: CredentialUploadService;
  readonly maxBodyBytes: number;
  readonly onStored: (
    principal: Principal,
    credential: StoredCredential,
  ) => Effect.Effect<void, unknown>;
}

const headers = {
  "cache-control": "no-store",
  pragma: "no-cache",
  "x-content-type-options": "nosniff",
};

const errorResponse = (status: number, code: string) =>
  new Response(JSON.stringify({ error: code }), {
    status,
    headers: { ...headers, "content-type": "application/json" },
  });

const uploadStatus = (error: unknown): number => {
  if (typeof error !== "object" || error === null || !("reason" in error)) {
    return 503;
  }
  switch (error.reason) {
    case "replayed":
      return 409;
    case "expired":
    case "invalid":
    case "wrong-principal":
      return 401;
    default:
      return 503;
  }
};

export const createCredentialUploadHandler = (
  options: CredentialUploadHandlerOptions,
): ((request: Request) => Promise<Response>) =>
  async function handle(request) {
    const url = new URL(request.url);
    if (
      url.pathname !== "/v1/credential-uploads" ||
      request.method !== "POST"
    ) {
      return errorResponse(404, "not_found");
    }
    const length = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(length) && length > options.maxBodyBytes) {
      return errorResponse(413, "payload_too_large");
    }
    const token = request.headers.get("x-upload-token");
    if (!token) return errorResponse(401, "invalid_upload");

    let principal: Principal;
    try {
      principal = await Effect.runPromise(
        options.authenticate(request.headers),
      );
    } catch {
      return errorResponse(401, "unauthorized");
    }

    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.byteLength === 0) return errorResponse(400, "empty_payload");
    if (bytes.byteLength > options.maxBodyBytes) {
      return errorResponse(413, "payload_too_large");
    }
    const material = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    try {
      const stored = await Effect.runPromise(
        options.uploads.consume(principal, token, Redacted.make(material)),
      );
      await Effect.runPromise(options.onStored(principal, stored));
      return new Response(null, { status: 204, headers });
    } catch (error) {
      return errorResponse(uploadStatus(error), "upload_rejected");
    }
  };
