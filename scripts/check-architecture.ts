import { readdir, readFile } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sourceRoots = ["apps", "packages", "examples"].map((path) =>
  resolve(root, path),
);
const sourceExtensions = new Set([".ts", ".tsx", ".mts", ".cts"]);

const walk = async (directory: string): Promise<Array<string>> => {
  const entries = await readdir(directory, { withFileTypes: true }).catch(
    () => [],
  );
  const files = await Promise.all(
    entries
      .filter((entry) => entry.name !== "node_modules" && entry.name !== "dist")
      .map((entry) => {
        const path = resolve(directory, entry.name);
        return entry.isDirectory() ? walk(path) : Promise.resolve([path]);
      }),
  );
  return files.flat();
};

const files = (await Promise.all(sourceRoots.map(walk)))
  .flat()
  .filter((path) => sourceExtensions.has(extname(path)));

const violations: Array<string> = [];

for (const file of files) {
  const path = relative(root, file).split(sep).join("/");
  const source = await readFile(file, "utf8");
  const isTest = /(?:\/test\/|\.test\.)/.test(path);

  if (/from\s+["']@repo\/[^"']+\/internal(?:\/|["'])/.test(source)) {
    violations.push(`${path}: imports another package's internal module`);
  }
  if (
    /from\s+["']openai["']/.test(source) &&
    !path.startsWith("packages/ai/src/internal/openai/")
  ) {
    violations.push(`${path}: imports OpenAI outside its adapter`);
  }
  if (
    /from\s+["']@alibaba-group\/opensandbox["']/.test(source) &&
    !path.startsWith("packages/sandbox-opensandbox/")
  ) {
    violations.push(`${path}: imports OpenSandbox outside its adapter`);
  }
  if (
    /from\s+["']@base-ui\/react/.test(source) &&
    !path.startsWith("packages/ui/")
  ) {
    violations.push(`${path}: imports Base UI outside packages/ui`);
  }
  if (!isTest && /\bas never\b/.test(source)) {
    violations.push(`${path}: contains a production 'as never' assertion`);
  }
  if (
    !isTest &&
    /\bprocess\.env\b/.test(source) &&
    !path.startsWith("packages/config/") &&
    !/^apps\/[^/]+\/src\/main\.ts$/.test(path)
  ) {
    violations.push(
      `${path}: reads process.env outside config or an app entrypoint`,
    );
  }
}

if (violations.length > 0) {
  console.error(violations.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`architecture: ${files.length} source files checked`);
}
