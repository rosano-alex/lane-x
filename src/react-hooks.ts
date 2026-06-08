import { ComputedNode } from "./computed";
import { PulseNode } from "./pulse";
import * as React from "react";
import { useRef, useState, useEffect, useMemo, useCallback } from "react";
import { EffectNode } from "./effect";
import { activeObserver, setObserver } from "./context";
import { Scope, createScope } from "./scope";
import { forkLane, type Priority, Lane } from "./lane";
import type { Node } from "./node";

/** Reads a pulse and re-renders the component when it changes. */
export function usePulse<T>(pulse: PulseNode<T>): T {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const effect = new EffectNode(() => {
      pulse.get();
      forceUpdate((v) => v + 1);
    });

    return () => effect.dispose();
  }, [pulse]);

  return pulse.get();
}

/**
 * Creates a memoized value inside a React component and re-renders
 * whenever any of its reactive dependencies change.
 */
export function useComputed<T>(fn: () => T): T {
  const node = useMemo(() => new ComputedNode(fn), []);

  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const effect = new EffectNode(() => {
      node.get();
      forceUpdate((v) => v + 1);
    });

    return () => effect.dispose();
  }, [node]);

  return node.get();
}

/**
 * Renders inside a reactive context so any pulses read during render
 * trigger a re-render on change. Most components should reach for
 * `observer()` instead — use this directly when you need finer control.
 */
export function useObserver(
  render: () => React.ReactElement | null,
): React.ReactElement | null {
  const [, forceUpdate] = useState(0);

  const effectRef = useRef<EffectNode | null>(null);

  if (!effectRef.current) {
    // React forbids state updates during render, so ignore the effect's
    // first run (which fires synchronously as setObserver subscribes it).
    let mounted = false;
    effectRef.current = new EffectNode(() => {
      if (mounted) forceUpdate((v) => v + 1);
    });
    mounted = true;
  }

  useEffect(() => {
    return () => {
      if (effectRef.current) {
        effectRef.current.dispose();
        effectRef.current = null;
      }
    };
  }, []);

  const effect = effectRef.current as Node;

  // Save/restore prevObserver so nested useObserver calls don't orphan the outer context.
  const prevObserver = activeObserver;
  setObserver(effect);

  let result: React.ReactElement | null = null;

  try {
    result = render();
  } finally {
    setObserver(prevObserver);
  }

  return result;
}

/**
 * Runs a reactive side-effect that automatically re-executes whenever its
 * pulse dependencies change. No dependency array needed.
 */
export function useEffectPulse(fn: () => void) {
  useEffect(() => {
    const effect = new EffectNode(fn);
    return () => effect.dispose();
  }, []);
}


//   Creates a Scope tied to the component's lifecycle.
//   All reactive nodes created inside the scope are disposed on unmount.

export function useScope(): Scope {
  const scopeRef = useRef<Scope | null>(null);

  if (!scopeRef.current) {
    scopeRef.current = createScope();
  }

  useEffect(() => {
    return () => {
      if (scopeRef.current) {
        scopeRef.current.dispose();
        scopeRef.current = null;
      }
    };
  }, []);

  return scopeRef.current!;
}

/**
 * Same as React's useTransition, implemented with concurrent lanes.
 * Pulse writes inside startTransition() are buffered and committed after the
 * callback completes. isPending is true while a transition is in flight.
 */
export function useLaneXTransition(): [boolean, (fn: () => void) => void] {
  const [isPending, setIsPending] = useState(false);
  const laneRef = useRef<Lane | null>(null);

  const startTransition = useCallback((fn: () => void) => {
    if (laneRef.current && laneRef.current.status === "active") {
      laneRef.current.abort();
    }

    setIsPending(true);

    const lane = forkLane("transition");
    laneRef.current = lane;

    lane.run(fn);

    // Commit on the next microtask so React can render the pending state first.
    Promise.resolve().then(() => {
      if (laneRef.current === lane && lane.status === "active") {
        lane.commit();
        setIsPending(false);
        laneRef.current = null;
      }
    });
  }, []);

  useEffect(() => {
    return () => {
      if (laneRef.current && laneRef.current.status === "active") {
        laneRef.current.abort();
      }
    };
  }, []);

  return [isPending, startTransition];
}

/**
 * Creates a concurrent lane tied to the component's lifecycle.
 * The lane is aborted on unmount if still active.
 */
export function useLane(priority: Priority = "transition"): Lane {
  const laneRef = useRef<Lane | null>(null);

  if (!laneRef.current) {
    laneRef.current = forkLane(priority);
  }

  useEffect(() => {
    return () => {
      if (laneRef.current && laneRef.current.status === "active") {
        laneRef.current.abort();
      }
    };
  }, []);

  return laneRef.current!;
}
