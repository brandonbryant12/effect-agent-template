const sensitive =
  /(?:secret|token|password|authorization|api[-_]?key|prompt|content)/i;

const credentialValue =
  /\b(authorization|api[-_]?key|token|password|secret)\s*[:=]\s*(?:Bearer\s+)?[^\s,;]+/gi;
const bearerValue = /\bBearer\s+[^\s,;]+/gi;

const redactText = (value: string): string =>
  value
    .replaceAll(credentialValue, (_match, key: string) => `${key}=[REDACTED]`)
    .replaceAll(bearerValue, "Bearer [REDACTED]");

const recordOf = (
  value: unknown,
): Readonly<Record<string, unknown>> | undefined =>
  typeof value === "object" && value !== null
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;

export const errorStatus = (error: unknown): number | undefined => {
  const record = recordOf(error);
  if (!record) return undefined;
  for (const value of [record.status, record.statusCode]) {
    if (typeof value === "number" && Number.isInteger(value)) return value;
  }
  const metadata = recordOf(record.$metadata);
  return typeof metadata?.httpStatusCode === "number"
    ? metadata.httpStatusCode
    : undefined;
};

/** Returns bounded provider detail with credential-shaped values removed. */
export const safeErrorDetail = (error: unknown): string | undefined => {
  const record = recordOf(error);
  const name = typeof record?.name === "string" ? record.name : undefined;
  const message =
    typeof error === "string"
      ? error
      : typeof record?.message === "string"
        ? record.message
        : undefined;
  const status = errorStatus(error);
  const detail = [
    name,
    message,
    status === undefined ? undefined : `status=${status}`,
  ]
    .filter((part): part is string => Boolean(part))
    .join(": ");
  if (!detail) return undefined;
  return redactText(detail).slice(0, 240);
};

export const safeAttributes = (
  attributes: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> =>
  Object.fromEntries(
    Object.entries(attributes).map(([key, value]) => [
      key,
      sensitive.test(key)
        ? "[REDACTED]"
        : typeof value === "string"
          ? redactText(value)
          : value,
    ]),
  );
