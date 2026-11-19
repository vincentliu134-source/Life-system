import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ProxyAgent } from "undici";

const execute = promisify(execFile);
const agents = new Map<string, ProxyAgent>();
let systemProxy: { expires: number; url: string } | undefined;

export function parseMacProxy(output: string): string {
  const value = (key: string) => output.match(new RegExp(`^\\s*${key}\\s*:\\s*(\\S+)`, "m"))?.[1];
  for (const kind of ["HTTPS", "HTTP"]) {
    const host = value(`${kind}Proxy`);
    const port = Number(value(`${kind}Port`));
    if (value(`${kind}Enable`) === "1" && host && Number.isInteger(port) && port > 0 && port <= 65535) {
      return `http://${host.includes(":") ? `[${host}]` : host}:${port}`;
    }
  }
  return "";
}

async function proxyUrl(): Promise<string> {
  if (process.env.GEMINI_PROXY_URL === "direct") return "";
  const explicit = process.env.GEMINI_PROXY_URL || process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  if (explicit) return explicit;
  if (process.platform !== "darwin") return "";
  if (systemProxy && systemProxy.expires > Date.now()) return systemProxy.url;
  const output = await execute("/usr/sbin/scutil", ["--proxy"], { timeout: 1500 }).catch(() => ({ stdout: "" }));
  const url = parseMacProxy(output.stdout);
  systemProxy = { url, expires: Date.now() + 30000 };
  return url;
}

// Scope the dispatcher to Gemini requests; never change the global fetch agent.
export async function fetchAi(url: string, init: RequestInit): Promise<Response> {
  const proxy = await proxyUrl();
  if (!proxy) return fetch(url, init);
  let dispatcher = agents.get(proxy);
  if (!dispatcher) {
    dispatcher = new ProxyAgent(proxy);
    agents.set(proxy, dispatcher);
  }
  return fetch(url, { ...init, dispatcher } as RequestInit);
}
