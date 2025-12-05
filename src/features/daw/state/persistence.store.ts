// src/lib/stores/persistence.store.ts

import { ProjectDecl } from "@/core/audio-engine/types";


const DB_NAME = "web-daw-v2";
const DB_VERSION = 1;
const STORE = "projects";
const KEY = "current";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveProject(proj: ProjectDecl): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const req = store.put(proj, KEY);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function loadProject(): Promise<ProjectDecl | null> {
  const db = await openDb();
  return await new Promise<ProjectDecl | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const req = store.get(KEY);
    req.onsuccess = () => resolve((req.result as ProjectDecl) ?? null);
    req.onerror = () => reject(req.error);
  });
}

// Throttled auto-save utility (singleton)
let _pending: ProjectDecl | null = null;
let _timer: number | null = null;
export function scheduleSave(proj: ProjectDecl, delayMs = 800) {
  _pending = proj;
  if (_timer != null) return;
  _timer = window.setTimeout(async () => {
    const p = _pending; _pending = null; _timer = null;
    if (p) {
      try { await saveProject(p); } catch {}
    }
  }, delayMs);
}

export async function clearProject(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const req = store.delete(KEY);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
