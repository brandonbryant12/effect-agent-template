import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface PackageManifest {
  readonly name?: string;
  readonly scripts?: Readonly<Record<string, string>>;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
}

export const unusedDependencies = (
  manifest: PackageManifest,
  ownedFileContents: ReadonlyArray<string>,
): ReadonlyArray<string> => {
  const usage = [
    ...ownedFileContents,
    ...Object.values(manifest.scripts ?? {}),
  ].join("\n");
  return Object.keys({
    ...manifest.dependencies,
    ...manifest.devDependencies,
  })
    .filter((dependency) => !dependency.startsWith("@types/"))
    .filter((dependency) => !usage.includes(dependency))
    .sort();
};

const root = resolve(import.meta.dirname, "..");
const textExtensions = new Set([
  ".css",
  ".cjs",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".mts",
  ".cts",
  ".sh",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);

const walk = async (directory: string): Promise<ReadonlyArray<string>> => {
  const entries = await readdir(directory, { withFileTypes: true }).catch(
    () => [],
  );
  const nested = await Promise.all(
    entries
      .filter(
        (entry) =>
          entry.name !== "node_modules" &&
          entry.name !== "dist" &&
          entry.name !== ".turbo",
      )
      .map((entry) => {
        const path = resolve(directory, entry.name);
        return entry.isDirectory() ? walk(path) : Promise.resolve([path]);
      }),
  );
  return nested.flat();
};

const main = async (): Promise<void> => {
  const packageFiles = (
    await Promise.all(["apps", "packages", "examples"].map(walk))
  )
    .flat()
    .filter((path) => path.endsWith("/package.json"));
  const violations: Array<string> = [];
  for (const packageFile of packageFiles.sort()) {
    const directory = dirname(packageFile);
    const manifest = JSON.parse(
      await readFile(packageFile, "utf8"),
    ) as PackageManifest;
    const ownedFiles = (await walk(directory)).filter(
      (path) =>
        path !== packageFile && textExtensions.has(extname(path).toLowerCase()),
    );
    const contents = await Promise.all(
      ownedFiles.map((path) => readFile(path, "utf8")),
    );
    for (const dependency of unusedDependencies(manifest, contents)) {
      violations.push(
        `${manifest.name ?? relative(root, directory)}: ${dependency}`,
      );
    }
  }
  if (violations.length > 0) {
    console.error(violations.join("\n"));
    process.exitCode = 1;
  } else {
    console.log(
      `dependencies: ${packageFiles.length} workspace packages checked`,
    );
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
