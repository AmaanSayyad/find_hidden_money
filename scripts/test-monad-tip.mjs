#!/usr/bin/env node
/**
 * Local Monad RevealPass smoke test. Never commit private keys.
 *
 *   MONAD_TEST_PK=0x... npx tsx scripts/test-monad-tip.mjs
 */
import {
  createPublicClient,
  createWalletClient,
  formatEther,
  http,
  parseEther,
  defineChain,
  encodeFunctionData,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const MONAD_CHAIN_ID = 143;
const MONAD_RPC_URL =
  process.env.MONAD_RPC_URL?.trim() || "https://rpc.monad.xyz";
const MONAD_TIP_AMOUNT = "1";
const MONAD_REVEAL_PASS = "0x19F82072e6612156eC5F8b43fa404c3e3Eef9957";
const MONAD_TIP_RECIPIENT = MONAD_REVEAL_PASS;
const MONAD_TIP_WEI = parseEther(MONAD_TIP_AMOUNT);

const revealPassAbi = [
  {
    type: "function",
    name: "reveal",
    stateMutability: "payable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "isRevealed",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "bool" }],
  },
];

const monadTestnet = defineChain({
  id: MONAD_CHAIN_ID,
  name: "Monad",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [MONAD_RPC_URL] } },
  testnet: false,
});

const pk = process.env.MONAD_TEST_PK?.trim();
if (!pk) {
  console.error("Set MONAD_TEST_PK=0x... (do not commit)");
  process.exit(1);
}

const key = pk.startsWith("0x") ? pk : `0x${pk}`;
const account = privateKeyToAccount(key);
const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(MONAD_RPC_URL),
});
const walletClient = createWalletClient({
  account,
  chain: monadTestnet,
  transport: http(MONAD_RPC_URL),
});

const [bal, already] = await Promise.all([
  publicClient.getBalance({ address: account.address }),
  publicClient.readContract({
    address: MONAD_REVEAL_PASS,
    abi: revealPassAbi,
    functionName: "isRevealed",
    args: [account.address],
  }),
]);

console.log(
  JSON.stringify(
    {
      from: account.address,
      contract: MONAD_REVEAL_PASS,
      treasury: MONAD_TIP_RECIPIENT,
      tipAmount: MONAD_TIP_AMOUNT,
      chainId: MONAD_CHAIN_ID,
      balanceMon: formatEther(bal),
      alreadyRevealed: already,
      enough: bal >= MONAD_TIP_WEI,
    },
    null,
    2,
  ),
);

try {
  const res = await fetch("http://localhost:3000/api/balances", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ evm: [account.address], mode: "indexed" }),
  });
  const data = await res.json();
  const monTokens = (data.tokens || []).filter(
    (t) => t.chainSlug === "monad_testnet" || t.chainId === MONAD_CHAIN_ID,
  );
  console.log("scan http", res.status, {
    tokenCount: data.tokenCount,
    monadTokens: monTokens.map((t) => ({
      s: t.symbol,
      b: t.balance,
      u: t.valueUsd,
    })),
    providers: data.provider,
  });
} catch (e) {
  console.log("local balances API unavailable", e instanceof Error ? e.message : e);
}

try {
  const status = await fetch(
    `http://localhost:3000/api/monad/tip/verify?address=${account.address}`,
  );
  console.log("status api", status.status, await status.json());
} catch (e) {
  console.log("status api unavailable", e instanceof Error ? e.message : e);
}

if (already) {
  console.log("already revealed on-chain — skipping second tip");
  process.exit(0);
}

if (bal < MONAD_TIP_WEI) {
  console.error(
    `\nINSUFFICIENT MON — need ${MONAD_TIP_AMOUNT} + gas, have ${formatEther(bal)}.\nFund ${account.address} on Monad (143) then re-run to send the tip.`,
  );
  process.exit(2);
}

const hash = await walletClient.sendTransaction({
  to: MONAD_REVEAL_PASS,
  value: MONAD_TIP_WEI,
  data: encodeFunctionData({ abi: revealPassAbi, functionName: "reveal" }),
});
console.log("sent reveal()", hash);

for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 800));
  try {
    const receipt = await publicClient.getTransactionReceipt({ hash });
    if (receipt?.status === "success") {
      const res = await fetch("http://localhost:3000/api/monad/tip/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txHash: hash, from: account.address }),
      });
      console.log("verify api", res.status, await res.json());
      const unlocked = await publicClient.readContract({
        address: MONAD_REVEAL_PASS,
        abi: revealPassAbi,
        functionName: "isRevealed",
        args: [account.address],
      });
      console.log("isRevealed", unlocked);
      process.exit(res.ok && unlocked ? 0 : 1);
    }
  } catch {
    console.log("waiting for inclusion…");
  }
}

console.error("Timed out waiting for tip confirmation");
process.exit(3);
