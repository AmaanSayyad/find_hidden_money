/**
 * Resolve the real MetaMask EIP-1193 provider when multiple extensions
 * (Temple, Phantom, Rabby, etc.) fight over window.ethereum.
 *
 * Prefer EIP-6963 (rdns io.metamask), then providers[] heuristics.
 */

export type EthereumProvider = {
  request: (args: { method: string; params?: unknown }) => Promise<unknown>;
  isMetaMask?: boolean;
  isTemple?: boolean;
  isPhantom?: boolean;
  isRabby?: boolean;
  isCoinbaseWallet?: boolean;
  isTrust?: boolean;
  isOkxWallet?: boolean;
  providers?: EthereumProvider[];
  _metamask?: unknown;
};

type EIP6963ProviderInfo = {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
};

type EIP6963ProviderDetail = {
  info: EIP6963ProviderInfo;
  provider: EthereumProvider;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }

  interface WindowEventMap {
    "eip6963:announceProvider": CustomEvent<EIP6963ProviderDetail>;
  }
}

const METAMASK_RDNS = new Set([
  "io.metamask",
  "io.metamask.flask",
  "io.metamask.mmi",
]);

function isLikelyMetaMask(provider: EthereumProvider): boolean {
  // Temple / Phantom / Rabby sometimes sit on window.ethereum
  if (provider.isTemple || provider.isPhantom || provider.isRabby) {
    return false;
  }
  if (provider.isCoinbaseWallet || provider.isTrust || provider.isOkxWallet) {
    return false;
  }
  // MetaMask-specific API bag — best signal beyond EIP-6963
  if (provider._metamask) return true;
  return provider.isMetaMask === true;
}

function collectInjectedProviders(): EthereumProvider[] {
  if (typeof window === "undefined") return [];
  const eth = window.ethereum;
  if (!eth) return [];

  const list: EthereumProvider[] = [];
  if (Array.isArray(eth.providers) && eth.providers.length > 0) {
    list.push(...eth.providers);
  }
  list.push(eth);

  // Dedupe by reference
  return [...new Set(list)];
}

/** Discover wallets via EIP-6963 and return MetaMask if announced. */
export function discoverMetaMaskViaEIP6963(timeoutMs = 300): Promise<EthereumProvider | null> {
  if (typeof window === "undefined") return Promise.resolve(null);

  return new Promise((resolve) => {
    let settled = false;
    let timer: number | undefined;
    const found: EIP6963ProviderDetail[] = [];

    const cleanup = () => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
      if (timer != null) window.clearTimeout(timer);
    };

    const finish = (provider: EthereumProvider | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(provider);
    };

    const onAnnounce = (event: Event) => {
      const detail = (event as CustomEvent<EIP6963ProviderDetail>).detail;
      if (detail?.info?.rdns && detail.provider) {
        found.push(detail);
        if (METAMASK_RDNS.has(detail.info.rdns)) {
          finish(detail.provider);
        }
      }
    };

    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    timer = window.setTimeout(() => {
      const mm = found.find((d) => METAMASK_RDNS.has(d.info.rdns));
      if (mm) {
        finish(mm.provider);
        return;
      }
      const byName = found.find(
        (d) => /metamask/i.test(d.info.name) && !/temple/i.test(d.info.name),
      );
      finish(byName?.provider ?? null);
    }, timeoutMs);
  });
}

function discoverMetaMaskInjected(): EthereumProvider | null {
  const providers = collectInjectedProviders();
  const strict = providers.find(
    (p) => p._metamask != null || (p.isMetaMask === true && !p.isTemple && !p.isPhantom),
  );
  if (strict) return strict;

  const loose = providers.find(isLikelyMetaMask);
  return loose ?? null;
}

/**
 * Always prefer MetaMask. Never fall back to "whatever window.ethereum is"
 * (that is often Temple / Phantom when multiple extensions are installed).
 */
export async function getMetaMaskProvider(): Promise<EthereumProvider | null> {
  const via6963 = await discoverMetaMaskViaEIP6963();
  if (via6963) return via6963;

  return discoverMetaMaskInjected();
}
