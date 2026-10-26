import { spawn } from "node:child_process";

const command = process.argv[2];
if (command !== "dev" && command !== "build" && command !== "start") {
  console.error("Use dev, build, or start. Example: npm run dev -- sepolia");
  process.exit(1);
}

const names = { sepolia: "sepolia", base: "base", mainnet: "base" };
const rest = process.argv.slice(3).filter((arg) => arg !== "--");
const picked = rest.find((arg) => Object.hasOwn(names, arg));
const nextArgs = rest.filter((arg) => arg !== picked);
const env = { ...process.env };

if (picked) {
  const network = names[picked];
  const rpc = network === "sepolia" ? "https://sepolia.base.org" : "https://mainnet.base.org";
  env.RVESS_NETWORK = network;
  env.NEXT_PUBLIC_RVESS_NETWORK = network;
  env.NEXT_PUBLIC_BASE_RPC_URL = rpc;
}

const child = spawn("npx", ["next", command, ...nextArgs], { env, stdio: "inherit" });
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
