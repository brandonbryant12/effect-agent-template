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
    /from\s+["']better-auth(?:\/[^"']*)?["']/.test(source) &&
    !path.startsWith("packages/auth/")
  ) {
    violations.push(`${path}: imports Better Auth outside packages/auth`);
  }
  if (
    /from\s+["']@alibaba-group\/opensandbox["']/.test(source) &&
    !path.startsWith("packages/sandbox-opensandbox/")
  ) {
    violations.push(`${path}: imports OpenSandbox outside its adapter`);
  }
  if (
    /from\s+["']@opencode-ai\/sdk(?:\/[^"']*)?["']/.test(source) &&
    !path.startsWith("packages/agent-runtime-opencode/")
  ) {
    violations.push(`${path}: imports OpenCode outside its adapter`);
  }
  if (
    /from\s+["']@aws-sdk\//.test(source) &&
    !path.startsWith("packages/secrets/")
  ) {
    violations.push(`${path}: imports AWS SDK outside packages/secrets`);
  }
  if (
    /from\s+["']@base-ui\/react/.test(source) &&
    !path.startsWith("packages/ui/")
  ) {
    violations.push(`${path}: imports Base UI outside packages/ui`);
  }
  if (
    /from\s+["'](?:radix-ui|cmdk)["']/.test(source) &&
    !path.startsWith("apps/web/src/components/ui/") &&
    !path.startsWith("packages/ui/")
  ) {
    violations.push(
      `${path}: imports a UI primitive library outside the vendored component directories`,
    );
  }
  if (
    !isTest &&
    /\bsql(?:<[^`]*>)?`/.test(source) &&
    !path.startsWith("packages/db/") &&
    !path.startsWith("packages/queue/src/") &&
    !/^packages\/[^/]+\/src\/internal\//.test(path) &&
    !source.includes("architecture-allow: raw-sql")
  ) {
    violations.push(
      `${path}: raw SQL outside a data-access module (move it into the owning package's internal/ directory, or justify it with an '// architecture-allow: raw-sql -- <reason>' comment)`,
    );
  }
  if (
    !isTest &&
    /\bnew Date\(\)|\bDate\.now\(\)/.test(source) &&
    !source.includes("architecture-allow: wall-clock") &&
    !path.startsWith("apps/web/src/components/ai-elements/") &&
    !path.startsWith("apps/web/src/components/ui/")
  ) {
    violations.push(
      `${path}: reads the wall clock directly (take time from Effect Clock, or justify with an '// architecture-allow: wall-clock -- <reason>' comment)`,
    );
  }
  if (!isTest && /Effect\.fail\(\s*new Error\(/.test(source)) {
    violations.push(
      `${path}: fails with an untyped Error (define a Schema.TaggedErrorClass instead)`,
    );
  }
  if (!isTest && /\bString\([^)]*\)\s*\.includes\(/.test(source)) {
    violations.push(
      `${path}: matches errors by stringified content (branch on the error's _tag instead)`,
    );
  }
  if (/\bData\.TaggedError\b|\bContext\.GenericTag\b/.test(source)) {
    violations.push(
      `${path}: uses a non-canonical idiom (Schema.TaggedErrorClass for errors, Context.Service for capabilities)`,
    );
  }
  if (!isTest && /\bas never\b/.test(source)) {
    violations.push(`${path}: contains a production 'as never' assertion`);
  }
  if (!isTest && /\bas any\b|:\s*any\b/.test(source)) {
    violations.push(`${path}: contains a production 'any'`);
  }
  if (
    !isTest &&
    /\bconsole\.\w+\(/.test(source) &&
    path.startsWith("packages/") &&
    path !== "packages/db/src/migrate.ts"
  ) {
    violations.push(
      `${path}: uses console in a library package (log through @repo/observability or return typed errors)`,
    );
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
