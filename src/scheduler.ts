import type { Node } from "./node"
import { LaneTypes } from "./lanetypes"

// deterministic scheduler phases
const phaseQueue: Record<number, Node[]> = {
  [LaneTypes.SYNC]: [],
  [LaneTypes.USER]: [],
  [LaneTypes.TRANSITION]: [],
  [LaneTypes.BACKGROUND]: []
}

let flushing = false

export function schedule(node: Node) {

  const lane = node.lane
  if (phaseQueue[lane] != null) {
    phaseQueue[lane].push(node)
  }

  if (!flushing) {
    flushing = true
    queueMicrotask(flush)
  }
}

function runQueue(queue: Node[]) {

  for (let i = 0; i < queue.length; i++) {
    const node = queue[i]
    if (node) {
      node.run()
    }
  }

  queue.length = 0
}

function flush() {

  // deterministic phase order
  runQueue(phaseQueue[LaneTypes.SYNC] as Node[])
  runQueue(phaseQueue[LaneTypes.USER] as Node[])
  runQueue(phaseQueue[LaneTypes.TRANSITION] as Node[])
  runQueue(phaseQueue[LaneTypes.BACKGROUND] as Node[])

  flushing = false
}
// update T10:19:46 30432
