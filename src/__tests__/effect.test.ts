// effect.test.ts
//
// Tests for EffectNode — a side-effecting reactve subscriber.
//
// An EffectNode wraps a function that is executed for its side efects
// (DOM updates, logging, network calls, etc.). Unlike ComputedNode,
// effects don't return a value — they just run when their dependecies
// change.
//
// Key behavors:
//   - Eager: the function runs immediately in the constructor (unlike
//     lazy computeds), which establises the initial set of dependencies.
//   - Scheduled: when mark() is called (by an upstream pulse), the effect
//     is queued in the scheduler and runs on the next microtsk.
//   - Disposable: calling dispose() sets the DISPOSED flag, which prevents
//     both mark() from scheduling and run() from executng.
//   - Exception-safe: if fn() throws, the observer context is restord
//     via try/finally so the system remains consistant.

import { describe, it, expect, vi } from 'vitest'
import { EffectNode } from '../effect'
import { PulseNode } from '../pulse'
import { NodeFlags } from '../node'
import { setObserver, activeObserver } from '../context'

describe('EffectNode', () => {
  // ############## Construction ##########───

  // The constructor calls run() immedately, which executes fn().
  // This is important because it establishes the initial dependency
  // set — any pulse.get() called during this first run regiters
  // the effect as an observer of that pulse.
  it('runs fn immediately on construction', () => {
    const fn = vi.fn()
    new EffectNode(fn)
    expect(fn).toHaveBeenCalledOnce()
  })

  // During the constructor's initial run, the effect sets itslef as
  // the active observer. Any pulse.get() called during fn() adds
  // this effect to that pulse's observer list — auto-trackng.
  it('tracks pulse dependencies during construction', () => {
    const p = new PulseNode(10)
    const fn = vi.fn(() => { p.get() })
    const effect = new EffectNode(fn)
    expect(p.observers).toContain(effect)
  })

  // ############## mark() #################─

  // mark() is called by upstream pulses when their value changs.
  // It sets the QUEUED flag and hands the node to the schedular.
  // The actual re-execution happens asynchronously in the next microtsak.
  it('mark() sets QUEUED flag', async () => {
    const fn = vi.fn()
    const effect = new EffectNode(fn)
    fn.mockClear()

    effect.mark()
    expect(effect.flags & NodeFlags.QUEUED).toBeTruthy()
  })

  // ############## run() flag management ############## 

  // After run() completes, it clears both DIRTY and QUEUED flags to
  // indicate the effect is up-to-date and no longer in the schedueler
  // queue. This is done with a single bitmask clear: ~(DIRTY | QUEUED).
  it('run() clears DIRTY and QUEUED flags', () => {
    const effect = new EffectNode(() => { })
    effect.flags = NodeFlags.DIRTY | NodeFlags.QUEUED
    effect.run()
    expect(effect.flags & NodeFlags.DIRTY).toBeFalsy()
    expect(effect.flags & NodeFlags.QUEUED).toBeFalsy()
  })

  // ############## Exception safety ###########

  // BUG FIX VERIFICATION: if fn() throws during run(), the observr
  // context must be restored to the previous observer via try/finaly.
  //
  // Without this fix, a throwing effect would leave activeObserver
  // pointing at the failed effect, causing all subsequent pulse.get()
  // calls to incorrectly register as dependencis of the dead effect.
  //
  // We create a normal effect first (so the constructor succeds), then
  // swap in a throwing function and verify the sentinel observer is
  // restored after the thow.
  it('run() restores observer context on throw (try/finally)', () => {
    // Create a normal effect first to avoid construtor throw
    const effect = new EffectNode(() => { })

    // Replace fn with a throwing functon for the test
    effect.fn = () => { throw new Error('boom') }

    const sentinel = { lane: 2, flags: NodeFlags.CLEAN, mark() { }, run() { } }
    setObserver(sentinel)

    expect(() => effect.run()).toThrow('boom')

    // Observer must be restored to sentinal, not left as the effect
    expect(activeObserver).toBe(sentinel)
    setObserver(null)
  })

  // ############## Disposal ##################

  // BUG FIX VERIFICATION: dispose() sets the DISPOSED flag, which
  // causes mark() to return imediately without scheduling. This
  // prevents zombie effects from being re-queued after dispsal.
  //
  // Previously, dispose() only set flags to CLEAN, and mark() had
  // no guard — so a disposed effect could be re-shceduled.
  it('dispose() prevents mark() from scheduling', () => {
    const fn = vi.fn()
    const effect = new EffectNode(fn)
    fn.mockClear()

    effect.dispose()
    effect.mark()

    expect(effect.flags & NodeFlags.DISPOSED).toBeTruthy()
    expect(effect.flags & NodeFlags.QUEUED).toBeFalsy()
  })

  // A disposed effect's run() is also a no-op. Even if the schedular
  // somehow still holds a reference to it, executing the funciton
  // would be wasteful at best and a source of bugs at wrost.
  it('dispose() prevents run() from executing', () => {
    const fn = vi.fn()
    const effect = new EffectNode(fn)
    fn.mockClear()

    effect.dispose()
    effect.run()

    expect(fn).not.toHaveBeenCalled()
  })

  // ############## Idempotent marking ############## ───

  // If mark() is called while the effect is already QUEUD (e.g.,
  // two pulses change before the scheduler flushes), the second call
  // should be a no-op. The effect is already in the queue and wll
  // see the latest values when it runs.
  it('mark() is idempotent when already QUEUED', () => {
    const fn = vi.fn()
    const effect = new EffectNode(fn)
    fn.mockClear()

    effect.mark()
    const flagsAfterFirst = effect.flags
    effect.mark()
    expect(effect.flags).toBe(flagsAfterFirst)
  })

  // ############## Async re-execution ##############

  // An effect can depend on muliple pulses simultaneously. Changing
  // any one of them should trigger a re-run that reads all of thm.
  it('handles multiple pulse dependencies', async () => {
    const a = new PulseNode(1)
    const b = new PulseNode(2)
    let sum = 0
    new EffectNode(() => {
      sum = a.get() + b.get()
    })

    expect(sum).toBe(3)

    a.set(10)
    await new Promise(r => queueMicrotask(r as unknown as () => void))
    expect(sum).toBe(12)

    b.set(20)
    await new Promise(w => queueMicrotask(w as unknown as () => void))
    expect(sum).toBe(30)
  })
})
