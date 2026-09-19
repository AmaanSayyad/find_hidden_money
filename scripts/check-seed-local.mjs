#!/usr/bin/env node
/**
 * LOCAL ONLY — never paste a seed into chat.
 *
 * Usage:
 *   npm run check-seed
 *   # then paste/type the seed, press Enter, then Ctrl+D (Mac/Linux) or Ctrl+Z Enter (Windows)
 *
 * Or from a local file (gitignored):
 *   npm run check-seed -- --file ./seed.local.txt
 *
 * Optional:
 *   npm run check-seed -- --target 0x47e4... --count 100
 */
import { createInterface } from "node:readline";
import { readFileSync } from "node:fs";
import { mnemonicToAccount } from "viem/accounts";

const DEFAULT_TARGET = "0x47e478d115cec5d04494f14a7ab426cc1aa929a5";

function parseArgs(argv) {
  const out = {
    target: DEFAULT_TARGET,
    count: 100,
    file: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--target" && argv[i + 1]) out.target = argv[++i];
    else if (a === "--count" && argv[i + 1]) out.count = Number(argv[++i]);
    else if (a === "--file" && argv[i + 1]) out.file = argv[++i];
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

function normalizeMnemonic(raw) {
  return raw
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .join(" ")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

async function readMnemonicFromStdin() {
  process.stderr.write(
    "Paste seed phrase (input is not echoed to git/chat).\n" +
      "Press Enter, then Ctrl+D (Mac/Linux) or Ctrl+Z then Enter (Windows):\n",
  );
  const rl = createInterface({ input: process.stdin, terminal: false });
  const chunks = [];
  for await (const line of rl) chunks.push(line);
  return chunks.join("\n");
}

function checkMnemonic(mnemonic, target, count) {
  const want = target.toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(want)) {
    throw new Error("Invalid --target address");
  }
  const words = mnemonic.split(" ");
  if (words.length !== 12 && words.length !== 15 && words.length !== 18 && words.length !== 21 && words.length !== 24) {
    throw new Error(
      `Expected 12/15/18/21/24 words, got ${words.length}. Nothing was stored.`,
    );
  }

  const hits = [];
  const sample = [];
  for (let i = 0; i < count; i++) {
    const account = mnemonicToAccount(mnemonic, { addressIndex: i });
    const addr = account.address;
    if (i < 5) sample.push({ index: i, address: addr });
    if (addr.toLowerCase() === want) {
      hits.push({ index: i, path: `m/44'/60'/0'/0/${i}`, address: addr });
    }
  }

  // Common MetaMask alternate account branches
  for (let accountIndex = 1; accountIndex <= 3; accountIndex++) {
    for (let i = 0; i < Math.min(20, count); i++) {
      const account = mnemonicToAccount(mnemonic, {
        accountIndex,
        addressIndex: i,
      });
      if (account.address.toLowerCase() === want) {
        hits.push({
          index: i,
          accountIndex,
          path: `m/44'/60'/${accountIndex}'/0/${i}`,
          address: account.address,
        });
      }
    }
  }

  return { hits, sample, wordCount: words.length, checked: count };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Local seed checker (stays on your machine)

  npm run check-seed
  npm run check-seed -- --file ./seed.local.txt
  npm run check-seed -- --target 0x... --count 150

Never commit seed.local.txt. Never paste seeds in chat.`);
    process.exit(0);
  }

  let raw;
  if (args.file) {
    raw = readFileSync(args.file, "utf8");
  } else {
    raw = await readMnemonicFromStdin();
  }

  const mnemonic = normalizeMnemonic(raw);
  if (!mnemonic) {
    console.error("No mnemonic provided.");
    process.exit(1);
  }

  try {
    const { hits, sample, wordCount, checked } = checkMnemonic(
      mnemonic,
      args.target,
      Number.isFinite(args.count) && args.count > 0 ? args.count : 100,
    );

    console.log(
      JSON.stringify(
        {
          target: args.target,
          wordCount,
          accountsChecked: checked,
          match: hits.length > 0,
          hits,
          first5Addresses: sample,
          note:
            hits.length > 0
              ? "FOUND — this seed controls the target (MetaMask path above)."
              : "NOT FOUND in checked paths. Likely imported key, another seed, or higher index.",
        },
        null,
        2,
      ),
    );
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  } finally {
    // Best-effort: avoid leaving mnemonic in memory longer than needed
    raw = "";
  }
}

main();
