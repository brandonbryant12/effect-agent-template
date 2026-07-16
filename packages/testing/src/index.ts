export const deterministicId = (prefix: string, sequence: number): string =>
  `${prefix}_${sequence.toString().padStart(4, "0")}`;
