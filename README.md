# Lane-X
### A minimal, high-performance fine-grained reactive runtime.

Lane-x queues reactive work through a priority-lane pipeline (SYNC → USER → TRANSITION → BACKGROUND) and dispatches it via `queueMicrotask`, keeping the main thread responsive while guaranteeing a stable, predictable update order. It draws from Solid, MobX, Angular, and React's scheduler priorities — distilled into a small, framework-agnostic engine.

## Install

```bash
npm install @codigos/lane-x
# or
yarn add @codigos/lane-x
```

## Quick Start Guide

```ts
import { pulse, computed, effect } from "lane-x";

const count = pulse(0);
const doubled = computed(() => count.get() * 2);

effect(() => {
  console.log("count:", count.get(), "double:", doubled.get());
});

count.set(1);
// → count: 1 double: 2
```

## API

### `pulse(initialValue)`

Reactive mutable state. Reading a pulse inside a computed or effect automatically tracks it as a dependency.

```ts
const count = pulse(0);
count.get();  // read
count.set(1); // write
```

### `computed(fn)`

Derives state from pulses. Lazy, cached, and automatically re-evaluated when dependencies change.

```ts
const total = computed(() => price.get() * qty.get());
```

### `effect(fn)`

Runs side effects whenever its dependencies change.

```ts
effect(() => console.log(count.get()));
```

## How It Works

<p style="text-align: Left;"><img src="img/flow.png" width="430"></p>

lane-x builds a reactive dependency graph from three node types — `PulseNode` (mutable state), `ComputedNode` (derived values), and `EffectNode` (side effects). Dependencies are tracked automatically at read time. When a pulse changes, only the affected subgraph is invalidated and re-evaluated, scheduled through deterministic priority lanes.

## Example: Derived State

```ts
const price = pulse(10);
const qty = pulse(2);

const subtotal = computed(() => price.get() * qty.get());
const tax = computed(() => subtotal.get() * 0.07);
const total = computed(() => subtotal.get() + tax.get());

effect(() => console.log("total =", total.get()));
```

## React Usage Example

Lane-x ships with first-class React hooks. Here's a temperature converter that demonstrates reactive state, derived computations, scoped error handling, concurrent transitions, and reactive side-effects in a single compact component.

```tsx
import React from "react";
import {
  PulseNode,
  ComputedNode,
  usePulse,
  useComputed,
  useEffectPulse,
  useScope,
  useLaneXTransition,
  ERROR,
} from "lane-x";

// lane-x Reactive state (Lives outside React)
const celsius = new PulseNode(0);
const unit = new PulseNode<"F" | "K">("F");

// Derived values — auto-tracked, lazy, cached >> Only recomputes when celsius or unit actually changes.
const converted = new ComputedNode(() => {
  const c = celsius.get();
  return unit.get() === "F" ? c * 1.8 + 32 : c + 273.15;
});

const label = new ComputedNode(() =>
  unit.get() === "F" ? "Fahrenheit" : "Kelvin"
);

// Component 
exports default function TempConverter() {
  const scope = useScope();
  scope.handle(ERROR, (err) => console.error("[TempConverter]", err));

  const c = usePulse(celsius);
  const result = useComputed(() => converted.get());
  const name = useComputed(() => label.get());

  // useLaneXTransition buffers the unit switch in a concurrent lane 
  // the input stays responsive during recomputation
  const [isPending, startTransition] = useLaneXTransition();

  // useEffectPulse automatically tracks dependencies. No dep array is needed.
  useEffectPulse(() => {
    document.title = `${celsius.get()}°C = ${converted.get().toFixed(1)}° ${label.get()}`;
  });

  return (
    <div>
      <h3>Temperature Converter</h3>
      <input
        type="number"
        value={c}
        onChange={(e) => celsius.set(Number(e.target.value))}
      />
      <span>°C</span>

      <select
        value={usePulse(unit)}
        onChange={(e) =>
          startTransition(() => unit.set(e.target.value as "F" | "K"))
        }
        style={{ opacity: isPending ? 0.5 : 1 }}
      >
        <option value="F">Fahrenheit</option>
        <option value="K">Kelvin</option>
      </select>

      <p>
        {c}°C = {result.toFixed(1)}° {name}
      </p>
    </div>
  );
}
```

### lane-x React Hooks

| Hook | Purpose |
|------|---------|
| `usePulse(pulse)` | Subscribe to a pulse and re-render on change |
| `useComputed(fn)` | Derive a value from reactive sources |
| `useObserver(renderFn)` | Track pulse reads inside a render function |
| `useEffectPulse(fn)` | Run a reactive side-effect (auto-tracked deps) |
| `useScope()` | Create a scope tied to the component lifecycle |
| `useLaneXTransition()` | Buffer pulse writes in a concurrent lane |
| `useLane(priority?)` | Create a concurrent lane tied to the component |

## Docs

**[Getting Started →](./docs/getting-started.md)**

## License

MIT

## Usage Example Diagram
<figure>
  <img src="img/arch.jpg" alt="Lane-x Usage Diagrtam">
</figure>
