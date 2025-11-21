// Dev-only performance monitor singleton.
// Gated by NEXT_PUBLIC_PERF_MONITOR. Minimal overhead when disabled.

export type PerfSample = {
  count: number;
  totalMs: number;
  maxMs: number;
  lastMs: number;
};

class PerfMonitorImpl {
  private enabled: boolean;
  private samples: Record<string, PerfSample>;
  private lastTransportTs: number | null;
  private transportJitterAccum: number;
  private transportJitterSamples: number;
  private expectedIntervalMs: number | null;

  constructor() {
    // Enable rules (in order):
    // 1) Query param ?perf=1 (also persisted to localStorage)
    // 2) localStorage.getItem('perf') === '1'
    // 3) Env NEXT_PUBLIC_PERF_MONITOR=1 (build-time)
    this.enabled = false;
    if (typeof window !== 'undefined') {
      try {
        const qs = new URLSearchParams(window.location.search);
        const fromQs = qs.get('perf') === '1';
        const fromLs = window.localStorage?.getItem('perf') === '1';
        const fromEnv = process.env.NEXT_PUBLIC_PERF_MONITOR === '1';
        this.enabled = !!(fromQs || fromLs || fromEnv);
        if (fromQs) {
          // Persist choice to avoid needing the query param on subsequent navigations
          window.localStorage?.setItem('perf', '1');
        }
      } catch {
        // noop — keep disabled if storage/search not accessible
      }
      if (this.enabled) {
        (window as Window & { __PERF_MONITOR__?: PerfMonitorImpl }).__PERF_MONITOR__ = this; // expose for console debugging
      }
    }
    this.samples = {};
    this.lastTransportTs = null;
    this.transportJitterAccum = 0;
    this.transportJitterSamples = 0;
    this.expectedIntervalMs = null;
  }

  isEnabled() { return this.enabled; }

  recordDuration(key: string, ms: number) {
    if (!this.enabled) return;
    const s = this.samples[key] || { count: 0, totalMs: 0, maxMs: 0, lastMs: 0 };
    s.count += 1;
    s.totalMs += ms;
    s.lastMs = ms;
    if (ms > s.maxMs) s.maxMs = ms;
    this.samples[key] = s;
  }

  recordEvent(key: string) {
    if (!this.enabled) return;
    const s = this.samples[key] || { count: 0, totalMs: 0, maxMs: 0, lastMs: 0 };
    s.count += 1;
    s.lastMs = 0;
    this.samples[key] = s;
  }

  // Transport jitter measurement: call on each scheduler tick with current timestamp
  recordTransportTick(nowMs: number, nominalIntervalMs: number) {
    if (!this.enabled) return;
    if (this.lastTransportTs != null) {
      const delta = nowMs - this.lastTransportTs;
      // expected interval from first tick or provided nominal
      const expected = this.expectedIntervalMs ?? nominalIntervalMs;
      const jitter = Math.abs(delta - expected);
      this.transportJitterAccum += jitter;
      this.transportJitterSamples += 1;
    }
    this.lastTransportTs = nowMs;
    if (this.expectedIntervalMs == null) this.expectedIntervalMs = nominalIntervalMs;
  }

  // Reset jitter accumulation (e.g. after tempo / scheduler interval change)
  resetTransportJitter(nextNominalIntervalMs?: number) {
    if (!this.enabled) return;
    this.transportJitterAccum = 0;
    this.transportJitterSamples = 0;
    this.lastTransportTs = null;
    if (nextNominalIntervalMs != null) this.expectedIntervalMs = nextNominalIntervalMs;
  }

  getTransportJitterAvg() {
    if (!this.enabled || this.transportJitterSamples === 0) return 0;
    return this.transportJitterAccum / this.transportJitterSamples;
  }

  getSnapshot() {
    const out: Array<{ key: string; avgMs: number; maxMs: number; lastMs: number; count: number }> = [];
    for (const [k, v] of Object.entries(this.samples)) {
      out.push({ key: k, avgMs: v.count ? v.totalMs / v.count : 0, maxMs: v.maxMs, lastMs: v.lastMs, count: v.count });
    }
    out.sort((a, b) => b.avgMs - a.avgMs);
    return {
      samples: out,
      transportJitterAvg: this.getTransportJitterAvg(),
    };
  }
}

let instance: PerfMonitorImpl | null = null;
export function PerfMonitor() {
  if (!instance) instance = new PerfMonitorImpl();
  return instance;
}
