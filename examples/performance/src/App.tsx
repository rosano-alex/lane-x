import React, {
  useState, useEffect, useRef, useCallback, memo
} from 'react';
import { PulseNode, ComputedNode, EffectNode } from 'zo';
import './App.css';

// Code was generated using claude

//  Constants 

const TICKERS = [
  // L1 — Layer 1 blockchains (20)
  'BTC', 'ETH', 'SOL', 'AVAX', 'ADA', 'DOT', 'ATOM', 'NEAR', 'ALGO', 'FTM',
  'HBAR', 'XLM', 'XRP', 'LTC', 'ICP', 'APT', 'SUI', 'TON', 'TRX', 'EOS',

  // // DeFi — Decentralized Finance (20)
  'UNI', 'AAVE', 'MKR', 'CRV', 'SNX', 'COMP', 'YFI', 'BAL', 'SUSHI', 'GMX',
  'DYDX', 'CVX', 'LDO', 'RPL', 'CAKE', 'SPELL', 'FXS', 'KNC', 'ZRX', 'ALPHA',

  // L2 — Layer 2 & Scaling (20)
  'MATIC', 'OP', 'ARB', 'IMX', 'METIS', 'BOBA', 'CELR', 'CELO', 'SKL', 'MOVR',
  'GLMR', 'KAVA', 'EVMOS', 'ROSE', 'CRO', 'RON', 'AURORA', 'MANTA', 'ZK', 'STRK',

  // / Meme — Meme coins (20)
  'DOGE', 'SHIB', 'PEPE', 'FLOKI', 'BONK', 'WIF', 'BOME', 'MEME', 'TURBO', 'NEIRO',
  'POPCAT', 'MEW', 'COQ', 'MYRO', 'WOJAK', 'LADYS', 'BENJI', 'APU', 'DEGEN', 'GIGA',

  //// AI — AI & Infrastructure (20)
  'LINK', 'GRT', 'RNDR', 'FET', 'OCEAN', 'AGIX', 'TAO', 'AKT', 'LPT', 'BAND',
  'API3', 'TRB', 'NMR', 'VET', 'THETA', 'AR', 'STORJ', 'BLZ', 'HOT', 'INJ',
];

const SECTORS = ['L1', 'DeFi', 'L2', 'Meme', 'AI'];
const SECTOR_SIZE = 20; // 5 categories × 20 coins each

function initPrices(): number[] {
  return TICKERS.map(() => +(80 + Math.random() * 920).toFixed(2));
}

// =======Shared types ==============

interface BenchTick { tick: number; vanillaMs: number; zoMs: number; }

interface BenchStats {
  ticks: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  renders: number;
}

/// STANDARD React demo

interface VanillaProps {
  prices: number[];
  onRender: (count: number) => void;
}

// Deterministic color per ticker (stable across renders)
const CRYPTO_BG_COLORS = [
  '#e8e6e1', // warm off-white
  '#a89258', // dark gold
  '#c4a08a', // dusty rose
  '#f8d4d4', // light pink
  '#f0a050', // orange
  '#f0d060', // yellow
  '#60e0f0', // cyan
];

function tickerBg(ticker: string): string {
  let h = 0;
  for (let i = 0; i < ticker.length; i++) h = ticker.charCodeAt(i) + ((h << 5) - h);
  return CRYPTO_BG_COLORS[Math.abs(h) % CRYPTO_BG_COLORS.length];
}

// Global render counter — incremented by every stock cell that mounts/updates
let vanillaRenderCount = 0;

const VanillaStockCell = memo(function VanillaStockCell({
  ticker, price, prev
}: { ticker: string; price: number; prev: number }) {
  vanillaRenderCount++;
  const pct = prev === 0 ? 0 : ((price - prev) / prev) * 100;
  const cls = price > prev ? 'up' : price < prev ? 'down' : 'neutral';
  const flash = price > prev ? 'flash-up' : price < prev ? 'flash-down' : '';
  return (
    <div className={`stock-cell ${flash}`} style={{ background: tickerBg(ticker) }}>
      <div className="stock-ticker">{ticker}</div>
      <div className="stock-price">${price.toFixed(2)}</div>
      <div className={`stock-change ${cls}`}>
        {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
      </div>
    </div>
  );
});

function VanillaDemo({ prices, onRender }: VanillaProps) {
  const prevRef = useRef<number[]>(prices.slice());

  useEffect(() => {
    vanillaRenderCount = 0;
  }, []);

  useEffect(() => {
    onRender(vanillaRenderCount);
    prevRef.current = prices.slice();
  });

  const total = prices.reduce((s, p) => s + p, 0);
  const sectorAvgs = SECTORS.map((_, i) => {
    const slice = prices.slice(i * SECTOR_SIZE, (i + 1) * SECTOR_SIZE);
    return slice.reduce((s, p) => s + p, 0) / SECTOR_SIZE;
  });

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div>
          <div className="dashboard-title">
            <span className="highlight-STANDARD">STANDARD React</span> — Portfolio
          </div>
          <div className="render-counter">All {TICKERS.length} coins re-render on every tick</div>
        </div>
        <div className="portfolio-total">${total.toFixed(0)}</div>
      </div>

      <div className="sectors">
        {SECTORS.map((s, i) => (
          <div className="sector-card" key={s}>
            <div className="sector-name">{s}</div>
            <div className={`sector-avg ${sectorAvgs[i] > 500 ? 'up' : 'neutral'}`}>
              ${sectorAvgs[i].toFixed(0)}
            </div>
          </div>
        ))}
      </div>

      <div className="stock-grid">
        {TICKERS.map((t, i) => (
          <VanillaStockCell
            key={t}
            ticker={t}
            price={prices[i]}
            prev={prevRef.current[i]}
          />
        ))}
      </div>
    </div>
  );
}

// =======Zo demo 

// Module-level pulses — one per coin, created once
const stockPulses: PulseNode<number>[] = initPrices().map(p => new PulseNode(p));
const prevPulses: PulseNode<number>[] = stockPulses.map(p => new PulseNode(p.value));

const sectorComputeds: ComputedNode<number>[] = SECTORS.map((_, i) =>
  new ComputedNode(() => {
    let sum = 0;
    for (let j = i * SECTOR_SIZE; j < (i + 1) * SECTOR_SIZE; j++) {
      sum += stockPulses[j].get();
    }
    return sum / SECTOR_SIZE;
  })
);

const totalComputed = new ComputedNode<number>(() =>
  stockPulses.reduce((s, p) => s + p.get(), 0)
);

let zoRenderCount = 0;

function useSignal<T>(pulse: PulseNode<T> | ComputedNode<T>): T {
  const [, set] = useState(0);
  const valRef = useRef<T>(
    pulse instanceof PulseNode ? pulse.value : pulse.get()
  );

  useEffect(() => {
    let mounted = true;
    const effect = new EffectNode(() => {
      const v = pulse instanceof PulseNode ? pulse.get() : pulse.get();
      if (mounted) {
        valRef.current = v;
        set(n => n + 1);
      }
    });
    return () => { mounted = false; effect.dispose(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return pulse instanceof PulseNode ? pulse.value : (pulse as ComputedNode<T>).get();
}

const ZoStockCell = memo(function ZoStockCell({ index }: { index: number }) {
  zoRenderCount++;
  const price = useSignal(stockPulses[index]);
  const prev = useSignal(prevPulses[index]);
  const ticker = TICKERS[index];
  const pct = prev === 0 ? 0 : ((price - prev) / prev) * 100;
  const cls = price > prev ? 'up' : price < prev ? 'down' : 'neutral';
  const flash = price > prev ? 'flash-up' : price < prev ? 'flash-down' : '';
  return (
    <div className={`stock-cell ${flash}`} style={{ background: tickerBg(ticker) }}>
      <div className="stock-ticker">{ticker}</div>
      <div className="stock-price">${price.toFixed(2)}</div>
      <div className={`stock-change ${cls}`}>
        {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
      </div>
    </div>
  );
});

function ZoSectorCard({ index }: { index: number }) {
  const avg = useSignal(sectorComputeds[index]);
  return (
    <div className="sector-card">
      <div className="sector-name">{SECTORS[index]}</div>
      <div className={`sector-avg ${avg > 500 ? 'up' : 'neutral'}`}>
        ${avg.toFixed(0)}
      </div>
    </div>
  );
}

function ZoTotal() {
  const total = useSignal(totalComputed);
  return <div className="portfolio-total">${total.toFixed(0)}</div>;
}

function ZoDemo({ onRender }: { onRender: (count: number) => void }) {
  useEffect(() => {
    zoRenderCount = 0;
  }, []);

  // Report render count after each React commit
  useEffect(() => {
    onRender(zoRenderCount);
  });

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div>
          <div className="dashboard-title">
            <span className="highlight">Zo + React</span> — Portfolio
          </div>
          <div className="render-counter">Only changed cells re-render</div>
        </div>
        <ZoTotal />
      </div>

      <div className="sectors">
        {SECTORS.map((_, i) => <ZoSectorCard key={i} index={i} />)}
      </div>

      <div className="stock-grid">
        {TICKERS.map((_, i) => <ZoStockCell key={i} index={i} />)}
      </div>
    </div>
  );
}

// Benchmark engine 

function runVanillaUpdate(
  prices: number[],
  changedIndices: number[],
  newPrices: number[]
): number[] {
  const next = prices.slice();
  for (const i of changedIndices) next[i] = newPrices[i];
  return next;
}

function runZoUpdate(changedIndices: number[], newPrices: number[]) {
  for (const i of changedIndices) {
    prevPulses[i].set(stockPulses[i].value);
    stockPulses[i].set(newPrices[i]);
  }
}


// Scoreboard 

function Scoreboard({ STANDARD, zo }: { STANDARD: BenchStats; zo: BenchStats }) {
  const fmt = (n: number) => n.toFixed(2) + 'ms';
  const fmtR = (n: number) => n.toFixed(0);

  return (
    <div className="scoreboard">
      <h3>Benchmark Results</h3>
      <div className="score-grid">
        <div className="score-card STANDARD">
          <div className="score-card-header">STANDARD React</div>
          <div className="metric-row"><span className="metric-label">Avg render</span><span className="metric-val">{fmt(STANDARD.avgMs)}</span></div>
          <div className="metric-row"><span className="metric-label">Min / Max</span><span className="metric-val">{fmt(STANDARD.minMs)} / {fmt(STANDARD.maxMs)}</span></div>
          <div className="metric-row"><span className="metric-label">Total renders</span><span className="metric-val">{fmtR(STANDARD.renders)}</span></div>
          <div className="metric-row"><span className="metric-label">Renders/tick</span><span className="metric-val">{STANDARD.ticks > 0 ? fmtR(STANDARD.renders / STANDARD.ticks) : '—'}</span></div>
        </div>
        <div className="score-card zo">
          <div className="score-card-header">Zo + React</div>
          <div className="metric-row"><span className="metric-label">Avg render</span><span className="metric-val">{fmt(zo.avgMs)}</span></div>
          <div className="metric-row"><span className="metric-label">Min / Max</span><span className="metric-val">{fmt(zo.minMs)} / {fmt(zo.maxMs)}</span></div>
          <div className="metric-row"><span className="metric-label">Total renders</span><span className="metric-val">{fmtR(zo.renders)}</span></div>
          <div className="metric-row"><span className="metric-label">Renders/tick</span><span className="metric-val">{zo.ticks > 0 ? fmtR(zo.renders / zo.ticks) : '—'}</span></div>
        </div>
      </div>
    </div>
  );
}

// APP

export default function App() {
  const [running, setRunning] = useState(false);
  const [changesPerTick, setChangesPerTick] = useState(10);
  const [intervalMs, setIntervalMs] = useState(200);
  const [tickCount, setTickCount] = useState(0);

  // STANDARD state
  const [prices, setPrices] = useState<number[]>(initPrices);
  const [vanillaRenders, setVanillaRenders] = useState(0);

  // Zo render count
  const [zoRenders, setZoRenders] = useState(0);

  // Timing history
  const [ticks, setTicks] = useState<BenchTick[]>([]);
  const [vanillaStats, setVanillaStats] = useState<BenchStats>({ ticks: 0, avgMs: 0, minMs: Infinity, maxMs: 0, renders: 0 });
  const [zoStats, setZoStats] = useState<BenchStats>({ ticks: 0, avgMs: 0, minMs: Infinity, maxMs: 0, renders: 0 });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const vanillaTimeRef = useRef<number>(0);
  const zoTimeRef = useRef<number>(0);
  const tickRef = useRef(0);
  const vanillaCumulRenders = useRef(0);
  const zoCumulRenders = useRef(0);
  const vanillaTimings = useRef<number[]>([]);
  const zoTimings = useRef<number[]>([]);

  const doTick = useCallback(() => {
    // Pick random stocks to update
    const indices: number[] = [];
    while (indices.length < changesPerTick) {
      const i = Math.floor(Math.random() * TICKERS.length);
      if (!indices.includes(i)) indices.push(i);
    }

    const newPrices = stockPulses.map((p, i) => {
      if (indices.includes(i)) {
        const delta = (Math.random() - 0.48) * p.value * 0.03;
        return Math.max(1, +(p.value + delta).toFixed(2));
      }
      return p.value;
    });


    const zoStart = performance.now();
    vanillaRenderCount = 0;
    zoRenderCount = 0;
    runZoUpdate(indices, newPrices);
    const zoMs = performance.now() - zoStart;
    zoTimeRef.current = zoMs;

    // ── Measure STANDARD update ──
    const vStart = performance.now();
    vanillaRenderCount = 0;
    setPrices(prev => runVanillaUpdate(prev, indices, newPrices));
    const vMs = performance.now() - vStart;
    vanillaTimeRef.current = vMs;

    tickRef.current++;
    vanillaTimings.current.push(vMs);
    zoTimings.current.push(zoMs);

    const n = tickRef.current;
    setTickCount(n);
    setTicks(prev => {
      const next = [...prev, { tick: n, vanillaMs: vMs, zoMs }];
      return next.slice(-120); // keep last 120
    });

  }, [changesPerTick]);

  // After react commits, measure real render times
  const handleVanillaRender = useCallback((count: number) => {
    vanillaCumulRenders.current += count;
    const n = tickRef.current;
    if (n === 0) return;

    const vTimings = vanillaTimings.current;
    const avg = vTimings.reduce((s, t) => s + t, 0) / vTimings.length;
    const mn = Math.min(...vTimings);
    const mx = Math.max(...vTimings);

    setVanillaStats({
      ticks: n,
      avgMs: avg,
      minMs: mn,
      maxMs: mx,
      renders: vanillaCumulRenders.current,
    });
    setVanillaRenders(count);
  }, []);

  const handleZoRender = useCallback((count: number) => {
    zoCumulRenders.current += count;
    const n = tickRef.current;
    if (n === 0) return;

    const zTimings = zoTimings.current;
    const avg = zTimings.reduce((s, t) => s + t, 0) / zTimings.length;
    const mn = Math.min(...zTimings);
    const mx = Math.max(...zTimings);

    setZoStats({
      ticks: n,
      avgMs: avg,
      minMs: mn,
      maxMs: mx,
      renders: zoCumulRenders.current,
    });
    setZoRenders(count);
  }, []);

  const start = useCallback(() => {
    if (running) return;
    setRunning(true);
    intervalRef.current = setInterval(doTick, intervalMs);
  }, [running, doTick, intervalMs]);

  const stop = useCallback(() => {
    setRunning(false);
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }, []);

  const reset = useCallback(() => {
    stop();
    const fresh = initPrices();
    setPrices(fresh);
    fresh.forEach((p, i) => { stockPulses[i].set(p); prevPulses[i].set(p); });
    setTicks([]);
    setTickCount(0);
    vanillaRenderCount = 0; zoRenderCount = 0;
    vanillaCumulRenders.current = 0; zoCumulRenders.current = 0;
    vanillaTimings.current = []; zoTimings.current = [];
    tickRef.current = 0;
    setVanillaStats({ ticks: 0, avgMs: 0, minMs: Infinity, maxMs: 0, renders: 0 });
    setZoStats({ ticks: 0, avgMs: 0, minMs: Infinity, maxMs: 0, renders: 0 });
    setVanillaRenders(0); setZoRenders(0);
  }, [stop]);

  useEffect(() => () => stop(), [stop]);

  const reducedRenders = vanillaStats.renders > 0 && zoStats.renders > 0
    ? Math.round((1 - zoStats.renders / vanillaStats.renders) * 100)
    : null;

  return (
    <div className="app">
      <div className="header">
        <h1><span>Zo + React</span> Performance Demo</h1>
        <span className="badge">100 coins · 5 categories · 1 portfolio total</span>
        <span className="badge">tick #{tickCount}</span>
      </div>

      {/* Controls */}
      <div className="controls">
        <div className="control-group">
          <label>Changes/tick</label>
          <input type="range" min={1} max={50} value={changesPerTick}
            onChange={e => setChangesPerTick(+e.target.value)} disabled={running} />
          <span className="control-value">{changesPerTick}</span>
        </div>
        <div className="control-group">
          <label>Interval</label>
          <input type="range" min={50} max={1000} step={50} value={intervalMs}
            onChange={e => setIntervalMs(+e.target.value)} disabled={running} />
          <span className="control-value">{intervalMs}ms</span>
        </div>
        {!running && <button className="btn btn-run" onClick={start}>▶ Run Benchmark</button>}
        <button className="btn btn-reset" onClick={reset}>↺ Reset</button>
        {running && <div className="running-indicator"><div className="pulse-dot" />Live</div>}
      </div>

      {/* Scoreboard */}
      <Scoreboard STANDARD={vanillaStats} zo={zoStats} />

      {/* Dashboards */}
      <div className="main-layout">
        <div>
          <VanillaDemo prices={prices} onRender={handleVanillaRender} />
          <div style={{ height: 16 }} />
          <ZoDemo onRender={handleZoRender} />
        </div>

        <div className="side-panel">
          <div className="stat-panel">
            <h3>Live Stats</h3>
            <div className="stat-row">
              <span className="stat-label">Tick interval</span>
              <span className="stat-val">{intervalMs}ms</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Changes/tick</span>
              <span className="stat-val">{changesPerTick} / 100 coins</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">STANDARD renders/tick</span>
              <span className="stat-val bad">{vanillaRenders}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Zo + React renders/tick</span>
              <span className="stat-val good">{zoRenders}</span>
            </div>
            {reducedRenders !== null && (
              <div className="stat-row">
                <span className="stat-label">Renders avoided</span>
                <span className="stat-val good">{reducedRenders}%</span>
              </div>
            )}
            <div className="stat-row">
              <span className="stat-label">STANDARD avg</span>
              <span className="stat-val">{vanillaStats.avgMs.toFixed(2)}ms</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">Zo + React avg</span>
              <span className="stat-val">{zoStats.avgMs.toFixed(2)}ms</span>
            </div>
          </div>

          <div className="explanation">
            <h3>Why Zo + React wins</h3>
            <p>
              Each tick, <strong>{changesPerTick} of 100 coins</strong> change price.
            </p>
            <br />
            <p>
              <span className="highlight-STANDARD">STANDARD React</span> stores prices
              in a top-level <code>useState</code>. Any change to the array
              triggers a re-render of <strong>every</strong> coin cell — even
              the {100 - changesPerTick} that didn't move.
            </p>
            <br />
            <p>
              <span className="highlight">Zo + React</span> gives each coin its own
              <code> PulseNode</code>. A <code>PulseNode.set()</code> only marks
              <em> that node's</em> observers dirty. Only the {changesPerTick} affected
              cells re-render. The {100 - changesPerTick} untouched coins are never
              even called.
            </p>
            <br />
            <p>
              Category averages are <code>ComputedNode</code>s — they stay cached
              until a coin in their category changes. The portfolio total recomputes
              lazily only when read.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
