import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const packageJsonPath = resolve(root, "node_modules/effect/package.json");
const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
  version: string;
  gitHead?: string;
};

if (!packageJson.gitHead) {
  throw new Error(
    `effect@${packageJson.version} does not publish gitHead metadata`,
  );
}

const cacheRoot = resolve(root, ".cache/effect");
const checkout = resolve(cacheRoot, packageJson.version);

const run = (command: string, args: ReadonlyArray<string>, cwd = root) =>
  new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolvePromise()
        : reject(new Error(`${command} exited ${code ?? "without a code"}`)),
    );
  });

await mkdir(cacheRoot, { recursive: true });
await rm(checkout, { recursive: true, force: true });
await run("git", [
  "clone",
  "--filter=blob:none",
  "--no-checkout",
  "https://github.com/Effect-TS/effect.git",
  checkout,
]);
await run("git", ["checkout", "--detach", packageJson.gitHead], checkout);
await writeFile(
  resolve(checkout, ".effect-reference.json"),
  `${JSON.stringify({ version: packageJson.version, gitHead: packageJson.gitHead }, null, 2)}\n`,
);
console.log(
  `effect reference: ${packageJson.version} at ${packageJson.gitHead}`,
);
