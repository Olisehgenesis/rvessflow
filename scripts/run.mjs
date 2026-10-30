import { spawn } from "node:child_process";

const command = process.argv[2];
if (command !== "dev" && command !== "build" && command !== "start") {
  console.error("Use dev, build, or start. Example: npm run dev -- sepolia");
  process.exit(1);
}

const names = { sepolia: "sepolia", base: "base", mainnet: "base", celo: "celo" };
const rest = process.argv.slice(3).filter((arg) => arg !== "--");
const picked = rest.find((arg) => Object.hasOwn(names, arg));
const nextArgs = rest.filter((arg) => arg !== picked);
const env = { ...process.env };

if (picked) {
  const network = names[picked];
  const rpcName = network === "celo" ? "NEXT_PUBLIC_CELO_RPC_URL" : network === "sepolia" ? "NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL" : "NEXT_PUBLIC_BASE_RPC_URL";
  const rpc = network === "celo" ? "https://forno.celo.org" : network === "sepolia" ? "https://sepolia.base.org" : "https://mainnet.base.org";
  const serverRpc = network === "celo" ? "CELO_RPC_URL" : network === "sepolia" ? "BASE_SEPOLIA_RPC_URL" : "BASE_RPC_URL";
  env.RVESS_NETWORK = network;
  env.NEXT_PUBLIC_RVESS_NETWORK = network;
  env[rpcName] = rpc;
  env[serverRpc] = rpc;
}

const child = spawn("next", [command, ...nextArgs], { env, stdio: "inherit" });
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
