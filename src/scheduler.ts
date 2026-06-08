import type { Node } from "./node";
import { LaneTypes } from "./lanetypes";

const statusQueue: Record<number, Node[]> = {
  [LaneTypes.SYNC]: [],
  [LaneTypes.USER]: [],
  [LaneTypes.TRANSITION]: [],
  [LaneTypes.BACKGROUND]: [],
};

let flushing = false;

export function schedule(node: Node) {
  statusQueue[node.lane].push(node);

  if (!flushing) {
    flushing = true;
    queueMicrotask(flush);
  }
}

function runQueue(queue: Node[]) {
  for (let i = 0; i < queue.length; i++) {
    queue[i]?.run();
  }
  queue.length = 0;
}

const hasWork = (): boolean =>
  Object.values(statusQueue).some((q) => q.length > 0);

function flush() {
  // Effects can schedule more effects, so keep running phases until
  // the queues drain — capped to stop runaway cyclic effects.
  let iterations = 0;
  do {
    runQueue(statusQueue[LaneTypes.SYNC]);
    runQueue(statusQueue[LaneTypes.USER]);
    runQueue(statusQueue[LaneTypes.TRANSITION]);
    runQueue(statusQueue[LaneTypes.BACKGROUND]);

    if (++iterations > 100) break;
  } while (hasWork());

  flushing = false;
}
