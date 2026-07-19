import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface ManifestEntry {
  readonly file: string;
  readonly isEntry?: boolean;
}

type Manifest = Readonly<Record<string, ManifestEntry>>;

export const entryBundleViolation = (
  manifest: Manifest,
  sizes: Readonly<Record<string, number>>,
  limit: number,
): string | undefined => {
  const entry = Object.values(manifest).find((chunk) => chunk.isEntry);
  if (!entry) return "Vite manifest has no entry JavaScript chunk";
  const size = sizes[entry.file];
  if (size === undefined)
    return `${entry.file} is missing from the build output`;
  return size > limit
    ? `${entry.file} is ${size} bytes; entry budget is ${limit} bytes`
    : undefined;
};

const main = async (): Promise<void> => {
  const dist = resolve(import.meta.dirname, "../apps/web/dist");
  const manifest = JSON.parse(
    await readFile(resolve(dist, ".vite/manifest.json"), "utf8"),
  ) as Manifest;
  const entries = Object.values(manifest).filter((chunk) => chunk.isEntry);
  const sizes = Object.fromEntries(
    await Promise.all(
      entries.map(async (entry) => [
        entry.file,
        (await stat(resolve(dist, entry.file))).size,
      ]),
    ),
  );
  const violation = entryBundleViolation(manifest, sizes, 768_000);
  if (violation) {
    console.error(violation);
    process.exitCode = 1;
  } else {
    const entry = entries[0];
    console.log(
      `bundle: ${entry?.file ?? "entry"} is ${entry ? sizes[entry.file] : 0} bytes`,
    );
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
