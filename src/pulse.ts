import { activeObserver } from "./context";
import { tick } from "./clock";
import { NodeFlags, type Node } from "./node";

export class PulseNode<T> {
  value: T;
  version = 0;

  observers: Node[] = [];

  constructor(value: T) {
    this.value = value;
  }

  get(): T {
    const obs = activeObserver;

    if (obs && this.observers.indexOf(obs) === -1) {
      this.observers.push(obs);
    }

    return this.value;
  }

  set(next: T) {
    if (Object.is(this.value, next)) return;

    this.value = next;
    this.version++;

    tick();

    const observers = this.observers;
    let write = 0;

    for (let i = 0; i < observers.length; i++) {
      const obs = observers[i];
      if (obs !== undefined) {
        if (obs.flags & NodeFlags.DISPOSED) continue;
        observers[write++] = obs;
        obs.mark();
      }
    }

    if (write < observers.length) observers.length = write;
  }
}
