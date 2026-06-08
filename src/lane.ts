import type { Node } from "./node";
import type { PulseNode } from "./pulse";
import type { ComputedNode } from "./computed";
import { activeObserver, setObserver } from "./context";
import { Scope, activeScope } from "./scope";

export type Priority = "sync" | "transition" | "idle";

let nextLaneId = 1;

/**
 * A concurrent execution context that maintains an isolated fork of the
 * reactive graph's pulse values.
 *
 * Writes inside lane.run() go to pulseOverrides instead of mutating base
 * pulse values. commit() flushes overrides to the base graph; abort()
 * discards them. Useful for speculative state or React-style transitions.
 */
export class Lane {
  readonly id: number;
  readonly priority: Priority;

  // pulse values written inside this lane
  pulseOverrides: Map<PulseNode<any>, any> = new Map();

  // per-lane computed cache; entries are evicted when a dependency is overridden
  computedCache: Map<ComputedNode<any>, any> = new Map();
  dirtyComputeds: Set<ComputedNode<any>> = new Set();

  pendingEffects: Node[] = [];
  status: "active" | "committed" | "aborted" = "active";
  scope: Scope | null;
  parent: Lane | null;

  constructor(priority: Priority, parent: Lane | null = null) {
    this.id = nextLaneId++;
    this.priority = priority;
    this.parent = parent;
    this.scope = activeScope;

    if (this.scope) {
      this.scope.onCleanup(() => {
        if (this.status === "active") {
          this.abort();
        }
      });
    }
  }

  run<T>(fn: () => T): T {
    if (this.status !== "active") {
      throw new Error(`Cannot run in a ${this.status} lane`);
    }

    setActiveLane(this);

    try {
      return fn();
    } finally {
      setActiveLane(null);
    }
  }

  // Lookup order: this lane → parent lane → base value
  read<T>(pulse: PulseNode<T>): T {
    if (this.pulseOverrides.has(pulse)) {
      return this.pulseOverrides.get(pulse) as T;
    }
    if (this.parent) {
      return this.parent.read(pulse);
    }
    return pulse.value;
  }

  write<T>(pulse: PulseNode<T>, value: T): void {
    const current = this.read(pulse);
    if (Object.is(current, value)) return;

    this.pulseOverrides.set(pulse, value);
    this.invalidateDownstream(pulse);
  }

  readComputed<T>(node: ComputedNode<T>): T {
    if (this.computedCache.has(node) && !this.dirtyComputeds.has(node)) {
      return this.computedCache.get(node) as T;
    }

    const value = this.recompute(node);
    this.computedCache.set(node, value);
    this.dirtyComputeds.delete(node);
    return value;
  }

  commit(): void {
    if (this.status !== "active") {
      throw new Error(`Cannot commit a ${this.status} lane`);
    }

    this.status = "committed";

    for (const [pulse, value] of this.pulseOverrides) {
      pulse.set(value);
    }

    this.cleanup();
  }

  abort(): void {
    if (this.status !== "active") return;

    this.status = "aborted";
    this.cleanup();
  }

  fork(priority?: Priority): Lane {
    if (this.status !== "active") {
      throw new Error(`Cannot fork a ${this.status} lane`);
    }
    return new Lane(priority ?? this.priority, this);
  }

  private recompute<T>(node: ComputedNode<T>): T {
    setActiveLane(this);

    // Save and restore observer so nested recompute() calls don't clobber the outer context.
    const prevObserver = activeObserver;
    setObserver(node as unknown as Node);

    let value: T;
    try {
      value = (node as any).compute();
    } finally {
      setObserver(prevObserver);
      setActiveLane(null);
    }

    return value;
  }

  private invalidateDownstream(pulse: PulseNode<any>): void {
    const visited = new Set<Node>();
    const queue: Node[] = [...pulse.observers];

    while (queue.length) {
      const node = queue.shift()!;
      if (visited.has(node)) continue;
      visited.add(node);

      if ("compute" in node) {
        this.dirtyComputeds.add(node as unknown as ComputedNode<any>);
      } else if ("dispose" in node) {
        this.pendingEffects.push(node);
      }

      if (node.observers?.length) queue.push(...node.observers);
    }
  }

  private cleanup(): void {
    this.pulseOverrides.clear();
    this.computedCache.clear();
    this.dirtyComputeds.clear();
    this.pendingEffects.length = 0;
  }
}

// Supports nested lane.run() calls — a lane can fork a child mid-run.
const laneStack: (Lane | null)[] = [];

export let activeLane: Lane | null = null;

function setActiveLane(lane: Lane | null) {
  if (lane === null) {
    laneStack.pop();
    activeLane = laneStack[laneStack.length - 1] ?? null;
  } else {
    laneStack.push(lane);
    activeLane = lane;
  }
}

export function forkLane(priority: Priority = "transition"): Lane {
  return new Lane(priority, activeLane);
}

/**
 * Creates a transition-priority lane, runs fn inside it, then commits.
 * The lane-x equivalent of React's startTransition.
 */
export function transition(fn: () => void): void {
  const lane = forkLane("transition");
  lane.run(fn);
  lane.commit();
}

/**
 * Runs fn in a lane and returns it without committing, so the caller
 * can inspect derived values before deciding whether to commit or abort.
 */
export function speculate(
  fn: () => void,
  priority: Priority = "transition",
): Lane {
  const lane = forkLane(priority);
  lane.run(fn);
  return lane;
}
