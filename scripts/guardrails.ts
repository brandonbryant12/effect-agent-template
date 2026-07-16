import { spawn } from "node:child_process";

const commands: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
  ["pnpm", ["lint"]],
  ["pnpm", ["typecheck"]],
  ["pnpm", ["architecture:check"]],
  ["pnpm", ["test"]],
];

for (const [command, args] of commands) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              `${command} ${args.join(" ")} exited ${code ?? "without a code"}`,
            ),
          ),
    );
  });
}
