import process from "node:process";
import {
  buildAuditSummary,
  classifyCustomerLocation,
  parseAcceptanceArgs,
} from "./customer-production-acceptance-lib.mjs";

class CdpClient {
  constructor(url, timeoutMs) {
    this.url = url;
    this.timeoutMs = timeoutMs;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.socket = null;
  }

  async connect() {
    await new Promise((resolve, reject) => {
      const socket = new WebSocket(this.url);
      const timer = setTimeout(() => reject(new Error("Timed out connecting to Chrome DevTools Protocol.")), this.timeoutMs);
      socket.addEventListener("open", () => {
        clearTimeout(timer);
        this.socket = socket;
        resolve();
      }, { once: true });
      socket.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("Could not connect to Chrome DevTools Protocol WebSocket."));
      }, { once: true });
      socket.addEventListener("message", (event) => this.onMessage(event.data));
      socket.addEventListener("close", () => this.rejectPending(new Error("Chrome DevTools Protocol connection closed.")));
    });
  }

  onMessage(raw) {
    const message = JSON.parse(String(raw));
    if (message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`));
      else pending.resolve(message.result ?? {});
      return;
    }
    const listeners = this.listeners.get(message.method) ?? [];
    for (const listener of [...listeners]) listener(message.params ?? {});
  }

  rejectPending(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  send(method, params = {}) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("Chrome DevTools Protocol is not connected."));
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out.`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer, method });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  once(method) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.off(method, handler);
        reject(new Error(`${method} event timed out.`));
      }, this.timeoutMs);
      const handler = (params) => {
        clearTimeout(timer);
        this.off(method, handler);
        resolve(params);
      };
      const current = this.listeners.get(method) ?? [];
      this.listeners.set(method, [...current, handler]);
    });
  }

  off(method, handler) {
    const current = this.listeners.get(method) ?? [];
    this.listeners.set(method, current.filter((listener) => listener !== handler));
  }

  close() {
    this.socket?.close();
  }
}

async function fetchTargets(cdpOrigin, timeoutMs) {
  const response = await fetch(`${cdpOrigin}/json/list`, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`CDP target discovery failed with HTTP ${response.status}.`);
  const targets = await response.json();
  if (!Array.isArray(targets)) throw new Error("CDP target discovery returned an invalid payload.");
  return targets;
}

function choosePageTarget(targets, baseUrl) {
  const baseHost = new URL(baseUrl).host;
  return targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl && target.url && new URL(target.url).host === baseHost)
    ?? targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl)
    ?? null;
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) throw new Error("Runtime.evaluate failed in the attached page.");
  return result.result?.value;
}

async function waitForCustomerUi(client, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const state = await evaluate(client, `(() => ({
      href: window.location.href,
      bodyText: document.body?.innerText ?? "",
      loading: (document.body?.innerText ?? "").includes("Loading customers...")
    }))()`);
    const location = classifyCustomerLocation(state?.href ?? "");
    if (!location.authenticated && /\/signin|\/login|\/auth\//i.test(location.route)) {
      throw new Error(`Authenticated Customer acceptance blocked: browser is on ${location.route || "an auth route"}. Sign in in this Chrome profile first.`);
    }
    if (location.authenticated && !state?.loading && /\bCustomers\b/.test(state?.bodyText ?? "")) return state;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Timed out waiting for the authenticated Customers UI to become ready.");
}

function unnamedInteractiveCount(nodes) {
  const interactiveRoles = new Set(["button", "link", "textbox", "combobox", "checkbox", "radio", "switch"]);
  return (nodes ?? []).filter((node) => {
    if (node.ignored) return false;
    const role = node.role?.value;
    if (!interactiveRoles.has(role)) return false;
    return !String(node.name?.value ?? "").trim();
  }).length;
}

async function main() {
  if (typeof WebSocket !== "function") {
    throw new Error("Customer production acceptance requires Node.js 22 or newer (global WebSocket support)." );
  }
  const options = parseAcceptanceArgs(process.argv.slice(2));
  const targets = await fetchTargets(options.cdpOrigin, options.timeoutMs);
  const target = choosePageTarget(targets, options.baseUrl);
  if (!target) {
    throw new Error(`No debuggable Chrome page found at ${options.cdpOrigin}. Start Chrome with --remote-debugging-port=9223 and sign in first.`);
  }

  const client = new CdpClient(target.webSocketDebuggerUrl, options.timeoutMs);
  await client.connect();

  try {
    await Promise.all([
      client.send("Page.enable"),
      client.send("Runtime.enable"),
      client.send("Network.enable"),
      client.send("Accessibility.enable"),
    ]);

    const loaded = client.once("Page.loadEventFired");
    await client.send("Page.navigate", { url: `${options.baseUrl}/customers` });
    await loaded;
    await waitForCustomerUi(client, options.timeoutMs);

    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await client.send("Emulation.setEmulatedMedia", {
      media: "screen",
      features: [{ name: "prefers-color-scheme", value: "dark" }],
    });
    await evaluate(client, "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");

    const beforeFocus = await evaluate(client, `(() => {
      const navigation = performance.getEntriesByType("navigation")[0];
      return {
        locationHref: window.location.href,
        bodyText: document.body?.innerText ?? "",
        navigation: navigation ? {
          duration: navigation.duration,
          domContentLoadedEventEnd: navigation.domContentLoadedEventEnd,
          loadEventEnd: navigation.loadEventEnd,
        } : null,
        resources: performance.getEntriesByType("resource").map((entry) => ({
          name: entry.name,
          duration: entry.duration,
          initiatorType: entry.initiatorType,
        })),
        viewport: {
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
        },
        darkMediaMatches: window.matchMedia("(prefers-color-scheme: dark)").matches,
      };
    })()`);

    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });

    const focusProbe = await evaluate(client, `(() => {
      const element = document.activeElement;
      return {
        tagName: element?.tagName ?? "",
        text: (element?.getAttribute?.("aria-label") || element?.textContent || "").trim(),
      };
    })()`);
    const axTree = await client.send("Accessibility.getFullAXTree");

    const summary = buildAuditSummary({
      ...beforeFocus,
      focusProbe,
      accessibility: { unnamedInteractiveCount: unnamedInteractiveCount(axTree.nodes) },
    });

    const report = {
      generatedAt: new Date().toISOString(),
      baseUrl: options.baseUrl,
      cdpOrigin: options.cdpOrigin,
      mode: "authenticated-read-only",
      darkMediaMatches: Boolean(beforeFocus?.darkMediaMatches),
      ...summary,
      gates: {
        authenticatedCustomerRoute: summary.authenticated,
        customerUiVisible: summary.customerUiVisible,
        noHorizontalPageOverflowAt390px: !summary.horizontalPageOverflow,
        keyboardFocusReachedControl: summary.keyboardFocusReachedControl,
        darkPreferenceEmulated: Boolean(beforeFocus?.darkMediaMatches),
        noUnnamedInteractiveControls: summary.unnamedInteractiveCount === 0,
      },
    };

    console.log(JSON.stringify(report, null, 2));
    if (!Object.values(report.gates).every(Boolean)) process.exitCode = 1;
  } finally {
    await client.send("Emulation.clearDeviceMetricsOverride").catch(() => {});
    await client.send("Emulation.setEmulatedMedia", { media: "", features: [] }).catch(() => {});
    client.close();
  }
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
