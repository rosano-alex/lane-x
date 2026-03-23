<p style="text-align: Left;"><img src="img/wacho.png" width="350"></p>

A minimal, high-performance fine-grained reactive runtime.

Wacho queues reactive work through a priority-lane pipeline (SYNC → USER → TRANSITION → BACKGROUND) and dispatches it via `queueMicrotask`, keeping the main thread responsive while guaranteeing a stable, predictable update order. It draws from Solid, MobX, Angular, and React's scheduler priorities — distilled into a small, framework-agnostic engine.

## Install

```bash
npm install wacho
# or
yarn add wacho
```

## Quick Start Guide

```ts
import { pulse, computed, effect } from "wacho";

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

wacho builds a reactive dependency graph from three node types — `PulseNode` (mutable state), `ComputedNode` (derived values), and `EffectNode` (side effects). Dependencies are tracked automatically at read time. When a pulse changes, only the affected subgraph is invalidated and re-evaluated, scheduled through deterministic priority lanes.

## Example: Derived State

```ts
const price = pulse(10);
const qty = pulse(2);

const subtotal = computed(() => price.get() * qty.get());
const tax = computed(() => subtotal.get() * 0.07);
const total = computed(() => subtotal.get() + tax.get());

effect(() => console.log("total =", total.get()));
```

## Docs

**[Getting Started →](./docs/getting-started.md)**

## License

MIT
