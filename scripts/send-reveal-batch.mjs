#!/usr/bin/env node
/**
 * Send N RevealPass.reveal() tips on Monad Mainnet.
 *   node --env-file=.env.local scripts/send-reveal-batch.mjs
 * Never commit private keys.
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

const COUNT = Number(process.env.COUNT || 1);
const MONAD_CHAIN_ID = 143;
const MONAD_RPC_URL =
  process.env.MONAD_RPC_URL?.trim() || "https://rpc.monad.xyz";
const MONAD_REVEAL_PASS = "0xb8171c4E2002Deea048477D8B337ff27F9a36687";
const MONAD_TIP_WEI = parseEther("1");
const EXPLORER = "https://monadscan.com/tx";

const revealPassAbi = [
  {
    type: "function",
    name: "reveal",
    stateMutability: "payable",
    inputs: [],
    outputs: [],
  },
];

const monadMainnet = defineChain({
  id: MONAD_CHAIN_ID,
  name: "Monad",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [MONAD_RPC_URL] } },
  testnet: false,
});

const pk = process.env.MONAD_TEST_PK?.trim();
if (!pk) {
  console.error("Set MONAD_TEST_PK (do not commit)");
  process.exit(1);
}

const key = pk.startsWith("0x") ? pk : `0x${pk}`;
const account = privateKeyToAccount(key);
const publicClient = createPublicClient({
  chain: monadMainnet,
  transport: http(MONAD_RPC_URL),
});
const walletClient = createWalletClient({
  account,
  chain: monadMainnet,
  transport: http(MONAD_RPC_URL),
});

const data = encodeFunctionData({
  abi: revealPassAbi,
  functionName: "reveal",
});

const startBal = await publicClient.getBalance({ address: account.address });
const need = MONAD_TIP_WEI * BigInt(COUNT);
console.log(
  JSON.stringify(
    {
      from: account.address,
      contract: MONAD_REVEAL_PASS,
      count: COUNT,
      tipEachMon: "0.3",
      balanceMon: formatEther(startBal),
    },
    null,
    2,
  ),
);

if (startBal < need) {
  console.error(
    `Need at least ${formatEther(need)} MON + gas, have ${formatEther(startBal)}`,
  );
  process.exit(2);
}

let nonce = await publicClient.getTransactionCount({
  address: account.address,
  blockTag: "pending",
});

const hashes = [];
for (let i = 0; i < COUNT; i++) {
  const hash = await walletClient.sendTransaction({
    to: MONAD_REVEAL_PASS,
    value: MONAD_TIP_WEI,
    data,
    nonce,
  });
  nonce += 1;
  hashes.push(hash);
  console.log(`${i + 1}/${COUNT} sent ${hash}`);
}

let ok = 0;
for (let i = 0; i < hashes.length; i++) {
  const hash = hashes[i];
  try {
    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      timeout: 120_000,
    });
    const status = receipt.status === "success" ? "ok" : "FAILED";
    if (receipt.status === "success") ok += 1;
    console.log(`${i + 1}/${COUNT} ${status} ${EXPLORER}/${hash}`);
  } catch (err) {
    console.error(
      `${i + 1}/${COUNT} wait failed ${hash}: ${err instanceof Error ? err.message : err}`,
    );
  }
}

const endBal = await publicClient.getBalance({ address: account.address });
console.log(
  JSON.stringify(
    {
      confirmed: ok,
      sent: hashes.length,
      spentMon: formatEther(startBal - endBal),
      balanceMon: formatEther(endBal),
    },
    null,
    2,
  ),
);

process.exit(ok === COUNT ? 0 : 1);
