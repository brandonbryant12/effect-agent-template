/** Creates the correlation identifier returned at the outer HTTP boundary. */
export const makeRequestId = (): string => globalThis.crypto.randomUUID();
