/// <reference lib="webworker" />
import { PulseNode } from "./pulse";
import { ComputedNode } from "./computed";
import { EffectNode } from "./effect";
// eslint-disable-next-line @typescript-eslint/no-unused-vars

export type BridgeMessage =
  | {
    type: "expose";
    id: string;
    value: any;
    kind: "pulse" | "computed";
    version: number;
  }
  | { type: "update"; id: string; value: any; version: number }
  | { type: "set"; id: string; value: any }
  | { type: "subscribe"; id: string }
  | { type: "unsubscribe"; id: string }
  | { type: "dispose"; id: string }
  | { type: "ping"; timestamp: number }
  | { type: "pong"; timestamp: number };

/**
 * Local proxy for a PulseNode that lives on another runtime.
 *
 * Reads return the locally cached value kept in sync via 'update' messages.
 * Writes send a 'set' message to the owning side — the local value is only
 * updated when the remote confirms via an 'update' message.
 */
export class RemotePulse<T> extends PulseNode<T> {
  private bridge: GraphBridge;
  readonly remoteId: string;
  connected = true;

  constructor(bridge: GraphBridge, id: string, initialValue: T) {
    super(initialValue);
    this.bridge = bridge;
    this.remoteId = id;
  }

  override set(next: T) {
    if (!this.connected) {
      throw new Error(`RemotePulse '${this.remoteId}' is disconnected`);
    }

    this.bridge.send({ type: "set", id: this.remoteId, value: next });
  }

  /**
   * Updates the local value immediately AND sends the write to the remote.
   * Use when you need responsive UI and can tolerate brief inconsistency.
   */
  setOptimistic(next: T) {
    super.set(next);

    if (this.connected) {
      this.bridge.send({ type: "set", id: this.remoteId, value: next });
    }
  }

  _receiveUpdate(value: T) {
    super.set(value);
  }

  _disconnect() {
    this.connected = false;
    this.observers.length = 0;
  }
}

/**
 * Local proxy for a ComputedNode that lives on another runtime.
 *
 * The computation runs on the remote side; only the result is mirrored
 * locally via 'update' messages. Backed by a PulseNode so it participates
 * in the local reactive graph like any other dependency.
 */
export class RemoteComputed<T> {
  private bridge: GraphBridge;
  readonly remoteId: string;
  readonly pulse: PulseNode<T>;
  connected = true;

  constructor(bridge: GraphBridge, id: string, initialValue: T) {
    this.bridge = bridge;
    this.remoteId = id;
    this.pulse = new PulseNode(initialValue);
  }

  get(): T {
    return this.pulse.get();
  }

  _receiveUpdate(value: T) {
    this.pulse.set(value);
  }

  _disconnect() {
    this.connected = false;
    this.pulse.observers.length = 0;
  }
}

/**
 * Connects two runtimes and synchronizes reactive graph nodes between them
 * via a MessagePort.
 *
 * expose() makes a local node visible to the remote side. proxyPulse() /
 * proxyComputed() create local mirrors of nodes the remote has exposed.
 */
export class GraphBridge {
  private port: MessagePort;

  private exposed: Map<
    string,
    {
      node: PulseNode<any> | ComputedNode<any>;
      effect: EffectNode | null;
      version: number;
    }
  > = new Map();

  private proxies: Map<string, RemotePulse<any> | RemoteComputed<any>> =
    new Map();

  private active = true;

  private pendingSubscriptions: Map<
    string,
    {
      resolve: (proxy: RemotePulse<any> | RemoteComputed<any>) => void;
      kind: "pulse" | "computed";
    }[]
  > = new Map();

  constructor(port: MessagePort) {
    this.port = port;
    this.port.onmessage = (event: MessageEvent) => {
      this.onMessage(event.data as BridgeMessage);
    };
  }

  expose(id: string, node: PulseNode<any> | ComputedNode<any>): void {
    if (!this.active) {
      throw new Error("Cannot expose on a disposed bridge");
    }

    if (this.exposed.has(id)) {
      throw new Error(`Node '${id}' is already exposed on this bridge`);
    }

    const isPulse = node instanceof PulseNode;
    const kind: "pulse" | "computed" = isPulse ? "pulse" : "computed";
    const value = isPulse ? node.value : (node as ComputedNode<any>).get();
    let version = isPulse ? node.version : 0;

    this.send({ type: "expose", id, value, kind, version });

    // EffectNode runs fn() immediately on construction. Suppress the first
    // run — the 'expose' above already sent the initial value.
    let firstRun = true;
    const effect = new EffectNode(() => {
      const currentValue = isPulse
        ? (node as PulseNode<any>).get()
        : (node as ComputedNode<any>).get();

      if (firstRun) {
        firstRun = false;
        return;
      }

      const currentVersion = isPulse
        ? (node as PulseNode<any>).version
        : ++version;

      this.send({ type: "update", id, value: currentValue, version: currentVersion });
    });

    this.exposed.set(id, { node, effect, version });
  }

  proxyPulse<T>(id: string, defaultValue?: T): RemotePulse<T> {
    if (this.proxies.has(id)) {
      return this.proxies.get(id) as RemotePulse<T>;
    }

    const proxy = new RemotePulse<T>(this, id, defaultValue as T);
    this.proxies.set(id, proxy);
    this.send({ type: "subscribe", id });
    return proxy;
  }

  proxyComputed<T>(id: string, defaultValue?: T): RemoteComputed<T> {
    if (this.proxies.has(id)) {
      return this.proxies.get(id) as RemoteComputed<T>;
    }

    const proxy = new RemoteComputed<T>(this, id, defaultValue as T);
    this.proxies.set(id, proxy);
    this.send({ type: "subscribe", id });
    return proxy;
  }

  awaitProxy<T>(id: string, kind: "pulse"): Promise<RemotePulse<T>>;
  awaitProxy<T>(id: string, kind: "computed"): Promise<RemoteComputed<T>>;
  awaitProxy<T>(
    id: string,
    kind: "pulse" | "computed",
  ): Promise<RemotePulse<T> | RemoteComputed<T>> {
    if (this.proxies.has(id)) {
      return Promise.resolve(this.proxies.get(id) as any);
    }

    return new Promise((resolve) => {
      if (!this.pendingSubscriptions.has(id)) {
        this.pendingSubscriptions.set(id, []);
      }
      this.pendingSubscriptions.get(id)!.push({ resolve, kind });
      this.send({ type: "subscribe", id });
    });
  }

  send(msg: BridgeMessage): void {
    if (!this.active) return;

    try {
      this.port.postMessage(msg);
    } catch {
      this.active = false;
    }
  }

  dispose(): void {
    if (!this.active) return;
    this.active = false;

    for (const [id, entry] of this.exposed) {
      if (entry.effect) {
        entry.effect.dispose();
      }
      this.send({ type: "dispose", id });
    }
    this.exposed.clear();

    for (const proxy of this.proxies.values()) {
      proxy._disconnect();
    }
    this.proxies.clear();
    this.pendingSubscriptions.clear();

    try {
      this.port.close();
    } catch {
      // already closed
    }
  }

  ping(): Promise<number> {
    const start = performance.now();

    return new Promise((resolve) => {
      const onMessage = (event: MessageEvent) => {
        const msg = event.data as BridgeMessage;
        if (msg.type === "pong" && msg.timestamp === start) {
          this.port.removeEventListener("message", onMessage);
          resolve(performance.now() - start);
        }
      };

      this.port.addEventListener("message", onMessage);
      this.send({ type: "ping", timestamp: start });
    });
  }

  private onMessage(msg: BridgeMessage): void {
    if (!this.active) return;

    switch (msg.type) {
      case "expose": {
        let proxy = this.proxies.get(msg.id);

        if (!proxy) {
          if (msg.kind === "pulse") {
            proxy = new RemotePulse(this, msg.id, msg.value);
          } else {
            proxy = new RemoteComputed(this, msg.id, msg.value);
          }
          this.proxies.set(msg.id, proxy);
        } else {
          proxy._receiveUpdate(msg.value);
        }

        const pending = this.pendingSubscriptions.get(msg.id);
        if (pending) {
          for (const { resolve } of pending) {
            resolve(proxy);
          }
          this.pendingSubscriptions.delete(msg.id);
        }
        break;
      }

      case "update": {
        const proxy = this.proxies.get(msg.id);
        if (proxy) {
          proxy._receiveUpdate(msg.value);
        }
        break;
      }

      case "set": {
        const entry = this.exposed.get(msg.id);
        if (entry && entry.node instanceof PulseNode) {
          entry.node.set(msg.value);
        }
        break;
      }

      case "subscribe": {
        const entry = this.exposed.get(msg.id);
        if (entry) {
          const isPulse = entry.node instanceof PulseNode;
          const value = isPulse
            ? (entry.node as PulseNode<any>).value
            : (entry.node as ComputedNode<any>).get();

          this.send({
            type: "expose",
            id: msg.id,
            value,
            kind: isPulse ? "pulse" : "computed",
            version: entry.version,
          });
        }
        break;
      }

      case "unsubscribe": {
        break;
      }

      case "dispose": {
        const proxy = this.proxies.get(msg.id);
        if (proxy) {
          proxy._disconnect();
          this.proxies.delete(msg.id);
        }
        break;
      }

      case "ping": {
        this.send({ type: "pong", timestamp: msg.timestamp });
        break;
      }

      case "pong": {
        // handled by ping() promise listener
        break;
      }
    }
  }
}

/**
 * Call this in a Web Worker to receive the MessagePort and initialize the bridge.
 *   createWorkerBridge((bridge) => {
 *     const count = bridge.proxyPulse<number>('count')
 *     bridge.expose('result', new ComputedNode(() => heavyComputation(count.get())))
 *   })
 */
export function createWorkerBridge(setup: (bridge: GraphBridge) => void): void {
  const workerScope = globalThis as unknown as DedicatedWorkerGlobalScope;

  workerScope.onmessage = (event: MessageEvent) => {
    if (event.data && event.data.port instanceof MessagePort) {
      const bridge = new GraphBridge(event.data.port);
      setup(bridge);
    }
  };
}

/**
 * Sets up a bridge on the main thread by creating a MessageChannel and
 * sending one port to the worker.
 *
 *   const bridge = connectWorker(new Worker('worker.js'))
 *   bridge.expose('count', countPulse)
 */
export function connectWorker(worker: Worker): GraphBridge {
  const channel = new MessageChannel();
  worker.postMessage({ port: channel.port2 }, [channel.port2]);
  return new GraphBridge(channel.port1);
}
