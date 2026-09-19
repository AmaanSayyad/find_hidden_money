import http from "node:http";
import https from "node:https";
import { URL } from "node:url";

export type JsonRpcResponse = {
  jsonrpc?: string;
  id?: number | string;
  result?: unknown;
  error?: { code?: number; message?: string };
};

/**
 * Node http/https — bypasses Next.js patched fetch.
 * Forces IPv4 (family: 4) to avoid hung IPv6 connects that were timing out every RPC.
 */
export function nodeRequest(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
  } = {},
): Promise<{ status: number; text: string }> {
  const { method = "GET", headers = {}, body, timeoutMs = 12_000 } = options;
  const parsed = new URL(url);
  const lib = parsed.protocol === "http:" ? http : https;

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (err?: Error, value?: { status: number; text: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve(value!);
    };

    const req = lib.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "http:" ? 80 : 443),
        path: `${parsed.pathname}${parsed.search}`,
        method,
        family: 4,
        headers: {
          Accept: "application/json",
          "User-Agent": "find-hidden-money/1.0",
          ...(body
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(body),
              }
            : {}),
          ...headers,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          finish(undefined, {
            status: res.statusCode ?? 0,
            text: Buffer.concat(chunks).toString("utf8"),
          });
        });
        res.on("error", (err) => finish(err));
      },
    );

    const timer = setTimeout(() => {
      req.destroy();
      finish(new Error(`Request timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    req.on("error", (err) => finish(err));

    if (body) req.write(body);
    req.end();
  });
}

export async function nodeJsonRpc<T = unknown>(
  url: string,
  method: string,
  params: unknown[],
  timeoutMs = 8_000,
): Promise<T> {
  const { status, text } = await nodeRequest(url, {
    method: "POST",
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    timeoutMs,
  });

  if (status < 200 || status >= 300) {
    throw new Error(`HTTP ${status}: ${text.slice(0, 200)}`);
  }

  let data: JsonRpcResponse;
  try {
    data = JSON.parse(text) as JsonRpcResponse;
  } catch {
    throw new Error(`Invalid JSON from RPC: ${text.slice(0, 120)}`);
  }

  if (data.error) {
    throw new Error(data.error.message || "JSON-RPC error");
  }

  return data.result as T;
}
