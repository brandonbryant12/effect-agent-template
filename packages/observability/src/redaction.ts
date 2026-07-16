const sensitive =
  /(?:secret|token|password|authorization|api[-_]?key|prompt|content)/i;

export const safeAttributes = (
  attributes: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> =>
  Object.fromEntries(
    Object.entries(attributes).map(([key, value]) => [
      key,
      sensitive.test(key) ? "[REDACTED]" : value,
    ]),
  );
