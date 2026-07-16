import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const required = [
  "AGENTS.md",
  "apps/web/DESIGN.md",
  "compose.yaml",
  "deploy/helm/effect-agent/Chart.yaml",
  "deploy/terraform/eks/main.tf",
  "docs/architecture.md",
  "docs/security.md",
];
const failures: Array<string> = [];
for (const path of required) {
  await access(resolve(root, path)).catch(() =>
    failures.push(`missing ${path}`),
  );
}
const trackedText = await Promise.all(
  ["README.md", "AGENTS.md", "apps", "packages", "docs", "examples"].map(
    async (path) => {
      const { spawnSync } = await import("node:child_process");
      const files = spawnSync("git", ["ls-files", path], {
        cwd: root,
        encoding: "utf8",
      })
        .stdout.split("\n")
        .filter(Boolean);
      return Promise.all(
        files.map(
          async (file) =>
            `${file}\n${await readFile(resolve(root, file), "utf8").catch(() => "")}`,
        ),
      );
    },
  ),
).then((groups) => groups.flat().join("\n"));
for (const forbidden of ["content-studio", "card-madness"]) {
  if (trackedText.toLowerCase().includes(forbidden))
    failures.push(`domain leak: ${forbidden}`);
}
const helm = await readFile(
  resolve(root, "deploy/helm/effect-agent/templates/_helpers.tpl"),
  "utf8",
);
if (/value:\s*(?:sk-|[A-Za-z0-9]{32,})/.test(helm))
  failures.push("possible plaintext secret in Helm environment");
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `template: ${required.length} required surfaces and domain boundaries verified`,
  );
}
