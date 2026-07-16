import { createAuthClient } from "better-auth/react";

export interface BrowserUser {
  readonly id: string;
  readonly name: string;
  readonly email: string;
}

export interface BrowserSessionState {
  readonly data: { readonly user: BrowserUser } | null;
  readonly isPending: boolean;
}

export interface BrowserAuthResult {
  readonly error?: { readonly message?: string };
}

export interface BrowserAuthClient {
  readonly useSession: () => BrowserSessionState;
  readonly signInEmail: (input: {
    readonly email: string;
    readonly password: string;
  }) => Promise<BrowserAuthResult>;
  readonly signUpEmail: (input: {
    readonly email: string;
    readonly password: string;
    readonly name: string;
  }) => Promise<BrowserAuthResult>;
  readonly signOut: () => Promise<BrowserAuthResult>;
}

const browserResult = (
  error: { readonly message?: string | undefined } | null | undefined,
): BrowserAuthResult =>
  error ? { error: error.message ? { message: error.message } : {} } : {};

export const createBrowserAuthClient = (): BrowserAuthClient => {
  const client = createAuthClient();
  return {
    useSession: () => {
      const session = client.useSession();
      return {
        data: session.data
          ? {
              user: {
                id: session.data.user.id,
                name: session.data.user.name,
                email: session.data.user.email,
              },
            }
          : null,
        isPending: session.isPending,
      };
    },
    signInEmail: async (input) => {
      const result = await client.signIn.email(input);
      return browserResult(result.error);
    },
    signUpEmail: async (input) => {
      const result = await client.signUp.email(input);
      return browserResult(result.error);
    },
    signOut: async () => {
      const result = await client.signOut();
      return browserResult(result.error);
    },
  };
};
