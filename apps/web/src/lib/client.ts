import {
  browserCookieAuth,
  createAgentClient,
  createFetchTransport,
  toPromiseClient,
} from "@repo/client";
import { createBrowserAuthClient } from "@repo/auth/browser";

export const authClient = createBrowserAuthClient();

export const effectClient = createAgentClient(
  createFetchTransport({
    baseUrl: "/api/v1",
    auth: browserCookieAuth(),
  }),
);

export const agentClient = toPromiseClient(effectClient);
