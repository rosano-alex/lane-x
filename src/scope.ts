import type { Node } from "./node";
import type { PulseNode } from "./pulse";

export type EffectKey<T = any, R = void> = symbol & {
  readonly __payload: T;
  readonly __result: R;
};

export function defineEffect<T = any, R = void>(name: string): EffectKey<T, R> {
  return Symbol(name) as EffectKey<T, R>;
}

export type EffectHandler<T = any, R = void> = (
  payload: T,
  resume: (value: R) => void,
) => void;

// Built-in effect keys

/** Fired when an EffectNode throws. Install a handler to catch without crashing the graph. */
export const ERROR = defineEffect<Error, void>("error");

/** Fired when a scope is about to be disposed. */
export const DISPOSE = defineEffect<Scope, void>("dispose");

/** Wraps a batch of pulse writes into an atomic unit. */
export const TRANSACTION = defineEffect<() => void, void>("transaction");

/**
 * Ownership and algebraic-effect-handler boundary for reactive nodes.
 *
 * Every node created inside scope.run() is owned by that scope and torn
 * down recursively when it's disposed. Scopes also host effect handlers:
 * when perform(key, payload) is called, the runtime walks up the scope
 * tree until it finds a matching handler.
 */
export class Scope {
  parent: Scope | null;
  children: Set<Scope> = new Set();
  ownedNodes: Set<Node | PulseNode<any>> = new Set();
  cleanups: (() => void)[] = [];
  handlers: Map<symbol, EffectHandler<any, any>> = new Map();
  disposed = false;

  constructor(parent: Scope | null = null) {
    this.parent = parent;
    if (parent) {
      parent.children.add(this);
    }
  }

  run<T>(fn: () => T): T {
    if (this.disposed) {
      throw new Error("Cannot run in a disposed scope");
    }

    setActiveScope(this);

    try {
      return fn();
    } finally {
      setActiveScope(null);
    }
  }

  fork(): Scope {
    if (this.disposed) {
      throw new Error("Cannot fork a disposed scope");
    }
    return new Scope(this);
  }

  handle<T, R>(key: EffectKey<T, R>, handler: EffectHandler<T, R>): this {
    if (this.disposed) {
      throw new Error("Cannot install handler on a disposed scope");
    }
    this.handlers.set(key as symbol, handler);
    return this;
  }

  perform<T, R>(key: EffectKey<T, R>, payload: T): R | undefined {
    const findHandler = (scope: Scope | null): EffectHandler<any, any> | null =>
      scope === null
        ? null
        : (scope.handlers.get(key as symbol) ?? findHandler(scope.parent));

    const handler = findHandler(this);

    if (!handler) {
      if (key === (ERROR as symbol)) throw payload;
      throw new Error(
        `Unhandled effect: ${String(key)}. ` +
        `Install a handler via scope.handle() on an ancestor scope.`,
      );
    }

    let result: R | undefined;
    let resumed = false;
    handler(payload, (value: R) => { resumed = true; result = value; });
    return resumed ? result : undefined;
  }

  own(node: Node | PulseNode<any>): void {
    if (this.disposed) {
      throw new Error("Cannot register node on a disposed scope");
    }
    this.ownedNodes.add(node);
  }

  disown(node: Node | PulseNode<any>): void {
    this.ownedNodes.delete(node);
  }

  onCleanup(fn: () => void): void {
    if (this.disposed) {
      fn();
      return;
    }
    this.cleanups.push(fn);
  }

  dispose(): void {
    if (this.disposed) return;

    try {
      if (this.handlers.has(DISPOSE as symbol) || this.parent) {
        this.perform(DISPOSE, this);
      }
    } catch {
      // No DISPOSE handler bound — that's fine, it's optional.
    }

    for (const child of [...this.children]) {
      child.dispose();
    }

    for (const node of this.ownedNodes) {
      if ("dispose" in node && typeof node.dispose === "function") {
        (node as { dispose(): void }).dispose();
      } else if ("observers" in node) {
        // PulseNodes have no dispose() of their own — just drop their
        // observers so they stop notifying once this scope is gone.
        (node as unknown as PulseNode<any>).observers.length = 0;
      }
    }
    this.ownedNodes.clear();

    for (const fn of this.cleanups) {
      try {
        fn();
      } catch {
        // One cleanup throwing shouldn't stop the rest from running.
      }
    }
    this.cleanups.length = 0;

    if (this.parent) {
      this.parent.children.delete(this);
    }

    this.disposed = true;
  }
}

const scopeStack: (Scope | null)[] = [];

export let activeScope: Scope | null = null;

function setActiveScope(scope: Scope | null) {
  if (scope === null) {
    scopeStack.pop();
    activeScope = scopeStack[scopeStack.length - 1] ?? null;
  } else {
    scopeStack.push(scope);
    activeScope = scope;
  }
}

export function createScope(): Scope {
  return new Scope(activeScope);
}

export function perform<T, R>(key: EffectKey<T, R>, payload: T): R | undefined {
  if (!activeScope) {
    throw new Error(
      `perform() called outside of any scope. ` +
      `Wrap your code in scope.run() to establish a scope context.`,
    );
  }
  return activeScope.perform(key, payload);
}

export function onCleanup(fn: () => void): void {
  if (!activeScope) {
    throw new Error(
      `onCleanup() called outside of any scope. ` +
      `Wrap your code in scope.run() to establish a scope context.`,
    );
  }
  activeScope.onCleanup(fn);
}
