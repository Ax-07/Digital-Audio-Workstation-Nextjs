// Simple rAF-based scheduler with per-fps channels.
// subscribe(cb, fps) → returns unsubscribe. Reuses a single loop per fps.

type Loop = {
  callbacks: Set<() => void>;
  running: boolean;
  last: number;
  frameId: number | null;
  intervalMs: number; // 1000/fps
};

const loops = new Map<number, Loop>();

function ensureLoop(fps: number): Loop {
  const key = Math.max(1, Math.floor(fps));
  let loop = loops.get(key);
  if (!loop) {
    loop = { callbacks: new Set(), running: false, last: 0, frameId: null, intervalMs: 1000 / key };
    loops.set(key, loop);
  }
  if (!loop.running) startLoop(loop);
  return loop;
}

function startLoop(loop: Loop) {
  loop.running = true;
  const tick = (t: number) => {
    if (!loop.running) return;
    const dt = t - loop.last;
    if (dt >= loop.intervalMs || loop.last === 0) {
      loop.last = t;
      // Copy to array to avoid mutation during iteration
      const cbs = Array.from(loop.callbacks);
      for (const cb of cbs) {
        try { cb(); } catch {}
      }
    }
    loop.frameId = typeof requestAnimationFrame !== "undefined" ? requestAnimationFrame(tick) : null;
  };
  if (typeof requestAnimationFrame !== "undefined") {
    loop.frameId = requestAnimationFrame(tick);
  }
}

function stopLoop(fps: number) {
  const loop = loops.get(fps);
  if (!loop) return;
  loop.running = false;
  if (loop.frameId != null && typeof cancelAnimationFrame !== "undefined") {
    try { cancelAnimationFrame(loop.frameId); } catch {}
  }
  loop.frameId = null;
  loops.delete(fps);
}

export function subscribe(cb: () => void, fps: number = 60): () => void {
  const key = Math.max(1, Math.floor(fps));
  const loop = ensureLoop(key);
  loop.callbacks.add(cb);
  return () => {
    const l = loops.get(key);
    if (!l) return;
    l.callbacks.delete(cb);
    if (l.callbacks.size === 0) stopLoop(key);
  };
}

export function hasSubscribers(fps: number): boolean {
  const key = Math.max(1, Math.floor(fps));
  return loops.get(key)?.callbacks.size ? loops.get(key)!.callbacks.size > 0 : false;
}
