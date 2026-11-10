// Cross-platform replacement for the POSIX-only `NODE_ENV=x command` prefix,
// which fails under Windows cmd/PowerShell. Usage:
//   node scripts/with-node-env.mjs <development|production> <command> [args...]
import { spawn } from "node:child_process";

const [nodeEnv, ...command] = process.argv.slice(2);
if (!nodeEnv || command.length === 0) {
  console.error("Usage: with-node-env.mjs <NODE_ENV> <command> [args...]");
  process.exit(2);
}

const child = spawn(command.join(" "), {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, NODE_ENV: nodeEnv },
});
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
