"use client";

import { useState } from "react";
import { AddWalletsMenu } from "./AddWalletsMenu";
import { useMultichainWallet } from "@/context/MultichainWallet";
import type { MultiInsights, WalletSlice } from "@/lib/balances/multi-wallet";
import { formatUsd, shortenAddress } from "@/lib/format";
import { MAX_WALLETS, type RosterWallet } from "@/lib/wallets/roster";
import {
  MAX_SOLANA_WALLETS,
  pastedTextLooksLikeBrokenSolana,
  type SolanaRosterWallet,
} from "@/lib/wallets/solana-roster";

type ViewMode = "combined" | "wallet";

type Props = {
  viewMode: ViewMode;
  onViewMode: (mode: ViewMode) => void;
  activeWallet: string | "all";
  onActiveWallet: (address: string | "all") => void;
  slices: WalletSlice[];
  insights: MultiInsights | null;
  totalValueUsd: number;
  scanProgress: { done: number; total: number } | null;
  scanning: boolean;
  hideInsights?: boolean;
};

function sourceLabel(
  source: RosterWallet["source"] | SolanaRosterWallet["source"],
): string {
  if (source === "appkit") return "connected";
  if (source === "metamask") return "MetaMask";
  if (source === "phantom") return "Phantom";
  return "pasted";
}

export function WalletHub({
  viewMode,
  onViewMode,
  activeWallet,
  onActiveWallet,
  slices,
  insights,
  totalValueUsd,
  scanProgress,
  scanning,
  hideInsights = false,
}: Props) {
  const {
    walletKind,
    roster,
    solanaRoster,
    activeEvm,
    connect,
    requestMoreAccounts,
    importEvmBulk,
    importSolanaBulk,
    toggleWallet,
    toggleSolanaWallet,
    setAllEnabled,
    setAllSolanaEnabled,
    removeWallet,
    removeSolanaWallet,
    addActivePhantomSolana,
    clearSolanaRoster,
    maxSolanaWallets,
    isPending,
  } = useMultichainWallet();

  const isPhantom = walletKind === "phantom";
  const isMetaMask = walletKind === "metamask";
  const inRoster = activeEvm
    ? roster.find((w) => w.address === activeEvm)
    : undefined;
  const evmEnabled = Boolean(inRoster?.enabled);
  const evmScanned = activeEvm
    ? slices.find((s) => s.address === activeEvm)
    : undefined;

  const [bulk, setBulk] = useState("");
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);

  const onImport = () => {
    const evm = importEvmBulk(bulk);
    const sol = importSolanaBulk(bulk);
    if (evm.added === 0 && sol.added === 0) {
      setBulkMsg(
        pastedTextLooksLikeBrokenSolana(bulk)
          ? "That Solana address isn’t valid base58 (it can’t contain 0, O, I, or l). Copy it again from Phantom."
          : "No valid EVM (0x) or Solana addresses found.",
      );
      return;
    }
    const parts: string[] = [];
    if (evm.added > 0) {
      parts.push(
        `${evm.added} EVM (${evm.total}/${MAX_WALLETS})`,
      );
    }
    if (sol.added > 0) {
      parts.push(
        `${sol.added} Solana (${sol.total}/${MAX_SOLANA_WALLETS})`,
      );
    }
    setBulkMsg(`Added ${parts.join(" and ")}.`);
    setBulk("");
    if (evm.added > 0 || sol.added > 0) setShowImport(false);
  };

  const onAddWallet = async () => {
    if (isMetaMask) {
      const added = await requestMoreAccounts();
      setBulkMsg(
        added > 0
          ? `Added ${added} account(s). Select every account you want in the wallet prompt.`
          : "No new accounts — in the prompt, open the account list and select all you want.",
      );
      return;
    }
    setBulkMsg(
      "Pick another wallet or account. Addresses already in the roster stay.",
    );
    await connect().catch(() => undefined);
  };

  const onAddPhantomSol = async () => {
    const added = await addActivePhantomSolana();
    setBulkMsg(
      added > 0
        ? `Added Phantom Solana account (${added} new). Switch accounts in Phantom to collect more (up to ${maxSolanaWallets}).`
        : "That account is already in the roster (or Phantom returned nothing). Switch to another account in Phantom, then click Add again.",
    );
  };

  const sliceByAddr = new Map(slices.map((s) => [s.address, s]));
  const enabledSolCount = solanaRoster.filter((w) => w.enabled).length;
  const enabledEvmCount = roster.filter((w) => w.enabled).length;

  return (
    <div className="wallet-hub" id="wallets">
      <div className="wallet-hub-head">
        <div>
          <p className="extra-chain-title">Wallets</p>
          <p className="extra-chain-copy">
            {isPhantom
              ? `Phantom-only: collect up to ${MAX_SOLANA_WALLETS} Solana accounts. Switch accounts in the extension and we add each one. Roster is saved across disconnect.`
              : `Accounts from any connected wallet (Reown) — up to ${MAX_WALLETS} EVM and ${MAX_SOLANA_WALLETS} Solana. Use Add wallets to approve every address in this wallet, or to connect another wallet.`}
          </p>
        </div>
        <div className="view-toggle" role="group" aria-label="Portfolio view">
          <button
            type="button"
            className={viewMode === "combined" ? "active" : ""}
            onClick={() => {
              onViewMode("combined");
              onActiveWallet("all");
            }}
          >
            Combined
          </button>
          <button
            type="button"
            className={viewMode === "wallet" ? "active" : ""}
            onClick={() => onViewMode("wallet")}
          >
            Per wallet
          </button>
        </div>
      </div>

      {isPhantom ? (
        <div className="roster-warn" role="status">
          <p>
            <strong>How to connect all ~60 Phantom wallets:</strong> Phantom’s
            connect popup only approves the <em>currently selected</em> Solana
            account. Keep this page open, switch Account 1 → 2 → 3… — each
            switch is auto-added. Collected:{" "}
            <strong>{solanaRoster.length}</strong>/{maxSolanaWallets}.
          </p>
          <p style={{ marginTop: "0.5rem" }}>
            <button
              type="button"
              className="linkish"
              disabled={isPending}
              onClick={() => void onAddPhantomSol()}
            >
              Add active Phantom account
            </button>
            {" · "}
            <button
              type="button"
              className="linkish"
              onClick={() => {
                if (
                  confirm(
                    "Clear all saved Phantom Solana wallets from this app?",
                  )
                ) {
                  clearSolanaRoster();
                }
              }}
            >
              Clear saved roster
            </button>
          </p>
        </div>
      ) : null}

      {activeEvm && !inRoster && !isPhantom ? (
        <p className="roster-warn" role="status">
          Connected EVM account <code>{shortenAddress(activeEvm)}</code> is not
          in this roster.{" "}
          <button
            type="button"
            className="linkish"
            disabled={isPending}
            onClick={() => void onAddWallet()}
          >
            Add wallet
          </button>
        </p>
      ) : null}

      {activeEvm && inRoster && !evmEnabled ? (
        <p className="roster-warn" role="status">
          Selected EVM account <code>{shortenAddress(activeEvm)}</code> is in
          the roster but off.{" "}
          <button
            type="button"
            className="linkish"
            onClick={() => {
              toggleWallet(activeEvm, true);
              onViewMode("wallet");
              onActiveWallet(activeEvm);
            }}
          >
            Enable &amp; focus it
          </button>
        </p>
      ) : null}

      {activeEvm &&
      evmEnabled &&
      viewMode === "wallet" &&
      activeWallet !== "all" &&
      activeWallet !== activeEvm ? (
        <p className="roster-warn" role="status">
          Viewing <code>{shortenAddress(activeWallet)}</code> while the wallet
          is on <code>{shortenAddress(activeEvm)}</code>
          {evmScanned?.status === "done"
            ? ` (EVM wallet scan: ${formatUsd(evmScanned.totalValueUsd)}).`
            : "."}{" "}
          <button
            type="button"
            className="linkish"
            onClick={() => onActiveWallet(activeEvm)}
          >
            Show active EVM account
          </button>
        </p>
      ) : null}

      {roster.length > 0 && enabledEvmCount < roster.length ? (
        <p className="roster-warn" role="status">
          Only <strong>{enabledEvmCount}</strong> of{" "}
          <strong>{roster.length}</strong> EVM wallets are enabled. Click{" "}
          <button
            type="button"
            className="linkish"
            onClick={() => setAllEnabled(true)}
          >
            Enable all
          </button>
          .
        </p>
      ) : null}

      {solanaRoster.length > 0 && enabledSolCount < solanaRoster.length ? (
        <p className="roster-warn" role="status">
          Only <strong>{enabledSolCount}</strong> of{" "}
          <strong>{solanaRoster.length}</strong> Solana wallets are enabled.{" "}
          <button
            type="button"
            className="linkish"
            onClick={() => setAllSolanaEnabled(true)}
          >
            Enable all Solana
          </button>
        </p>
      ) : null}

      {!hideInsights && insights ? (
        <div className="insight-strip">
          <div>
            <span>Combined</span>
            <strong>{formatUsd(totalValueUsd)}</strong>
          </div>
          <div>
            <span>Scanned</span>
            <strong>
              {insights.scannedCount}/{enabledEvmCount + enabledSolCount}
            </strong>
          </div>
          <div>
            <span>In roster</span>
            <strong>
              {solanaRoster.length > 0
                ? `${solanaRoster.length} SOL · ${roster.length} EVM`
                : roster.length}
            </strong>
          </div>
          <div>
            <span>Empty</span>
            <strong>{insights.emptyCount}</strong>
          </div>
          <div>
            <span>Top wallet</span>
            <strong>{Math.round(insights.topWalletShare * 100)}%</strong>
          </div>
          <div>
            <span>Top 3</span>
            <strong>{Math.round(insights.top3Share * 100)}%</strong>
          </div>
          {insights.errorCount > 0 ? (
            <div>
              <span>Errors</span>
              <strong className="insight-danger">{insights.errorCount}</strong>
            </div>
          ) : null}
        </div>
      ) : null}

      {scanProgress && scanning ? (
        <div className="scan-progress" role="status">
          <div
            className="scan-progress-bar"
            style={{
              width: `${Math.round(
                (scanProgress.done / Math.max(scanProgress.total, 1)) * 100,
              )}%`,
            }}
          />
          <p>
            Scanning wallets {scanProgress.done}/{scanProgress.total}
            {scanProgress.total > 20
              ? " — large roster; batched scan in progress."
              : ""}
          </p>
        </div>
      ) : null}

      <div className="wallet-hub-actions">
        <AddWalletsMenu
          buttonClassName="btn-primary"
          showPaste
          pasteOpen={showImport}
          onPaste={() => setShowImport((v) => !v)}
          onMessage={setBulkMsg}
        />
        <button
          type="button"
          className="linkish"
          onClick={() => {
            setAllEnabled(true);
            setAllSolanaEnabled(true);
          }}
        >
          Enable all
        </button>
        <button
          type="button"
          className="linkish"
          onClick={() => {
            setAllEnabled(false);
            setAllSolanaEnabled(false);
          }}
        >
          Disable all
        </button>
      </div>

      {showImport ? (
        <div className="bulk-import">
          <textarea
            rows={4}
            spellCheck={false}
            placeholder="Paste 0x or Solana addresses (comma or newline separated)."
            value={bulk}
            onChange={(e) => {
              setBulk(e.target.value);
              setBulkMsg(null);
            }}
          />
          <button type="button" className="btn-ghost" onClick={onImport}>
            Import to roster
          </button>
        </div>
      ) : null}
      {bulkMsg ? <p className="extra-chain-copy">{bulkMsg}</p> : null}

      {solanaRoster.length > 0 ? (
        <>
          <p className="extra-chain-title" style={{ marginTop: "1rem" }}>
            Solana ({solanaRoster.length}/{maxSolanaWallets})
          </p>
          <div className="wallet-table-wrap">
            <table className="wallet-table">
              <thead>
                <tr>
                  <th>On</th>
                  <th>Wallet</th>
                  <th>Status</th>
                  <th>Value</th>
                  <th>Assets</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {solanaRoster.map((w) => {
                  const slice = sliceByAddr.get(w.address);
                  const selected =
                    viewMode === "wallet" && activeWallet === w.address;
                  const status = !w.enabled
                    ? "off"
                    : slice?.status ?? (scanning ? "pending" : "idle");
                  return (
                    <tr
                      key={`sol:${w.address}`}
                      className={[
                        selected ? "selected" : "",
                        !w.enabled ? "row-off" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <td>
                        <input
                          type="checkbox"
                          checked={w.enabled}
                          onChange={(e) =>
                            toggleSolanaWallet(w.address, e.target.checked)
                          }
                          aria-label={`Include ${w.label}`}
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="wallet-pick"
                          onClick={() => {
                            onViewMode("wallet");
                            onActiveWallet(w.address);
                          }}
                          title={w.address}
                        >
                          <strong>{w.label}</strong>
                          <code>{shortenAddress(w.address)}</code>
                          <em>{sourceLabel(w.source)} · Solana</em>
                        </button>
                      </td>
                      <td>
                        <span className={`status-pill status-${status}`}>
                          {status}
                        </span>
                      </td>
                      <td className="num">
                        {w.enabled
                          ? formatUsd(slice?.totalValueUsd ?? null)
                          : "—"}
                      </td>
                      <td className="num">
                        {w.enabled ? (slice?.tokenCount ?? "—") : "—"}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="linkish"
                          onClick={() => removeSolanaWallet(w.address)}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {roster.length > 0 ? (
        <div className="wallet-table-wrap">
          {solanaRoster.length > 0 ? (
            <p className="extra-chain-title" style={{ marginTop: "1rem" }}>
              EVM ({roster.length})
            </p>
          ) : null}
          <table className="wallet-table">
            <thead>
              <tr>
                <th>On</th>
                <th>Wallet</th>
                <th>Status</th>
                <th>Value</th>
                <th>Assets</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {roster.map((w) => {
                const slice = sliceByAddr.get(w.address);
                const selected =
                  viewMode === "wallet" && activeWallet === w.address;
                const status = !w.enabled
                  ? "off"
                  : slice?.status ?? (scanning ? "pending" : "idle");
                return (
                  <tr
                    key={w.address}
                    className={[
                      selected ? "selected" : "",
                      !w.enabled ? "row-off" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={w.enabled}
                        onChange={(e) =>
                          toggleWallet(w.address, e.target.checked)
                        }
                        aria-label={`Include ${w.label}`}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="wallet-pick"
                        onClick={() => {
                          onViewMode("wallet");
                          onActiveWallet(w.address);
                        }}
                        title={w.address}
                      >
                        <strong>{w.label}</strong>
                        <code>{shortenAddress(w.address)}</code>
                        <em>
                          {sourceLabel(w.source)}
                          {activeEvm === w.address ? " · selected" : ""}
                        </em>
                      </button>
                    </td>
                    <td>
                      <span className={`status-pill status-${status}`}>
                        {status}
                      </span>
                    </td>
                    <td className="num">
                      {w.enabled
                        ? formatUsd(slice?.totalValueUsd ?? null)
                        : "—"}
                    </td>
                    <td className="num">
                      {w.enabled ? (slice?.tokenCount ?? "—") : "—"}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="linkish"
                        onClick={() => removeWallet(w.address)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : solanaRoster.length === 0 ? (
        <p className="empty-state">
          Connect a wallet or paste 0x addresses to start a scan.
        </p>
      ) : null}
    </div>
  );
}
