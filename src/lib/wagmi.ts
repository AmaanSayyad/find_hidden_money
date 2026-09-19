import { wagmiAdapter, appKitNetworks } from "@/lib/reown/config";

export const chains = appKitNetworks;
export const config = wagmiAdapter.wagmiConfig;
