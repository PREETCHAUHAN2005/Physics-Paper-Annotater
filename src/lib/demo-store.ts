import type { ActivityEvent, Draft, FinalRecord, Job, Unit } from "@/lib/types";

export type DemoUnit = Unit & { sourceLabel?: string };
export type DemoState = {
  version: 1;
  jobs: Job[];
  units: DemoUnit[];
  finals: FinalRecord[];
  drafts: Record<string, Draft[]>;
  events: ActivityEvent[];
};
const EMPTY: DemoState = { version: 1, jobs: [], units: [], finals: [], drafts: {}, events: [] };
let mutationQueue: Promise<unknown> = Promise.resolve();

async function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") throw new Error("Browser storage is unavailable. Open the demo in a normal browser window.");
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("annotateiq-demo", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("data");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Cannot open browser storage. Allow site data for this demo."));
    request.onblocked = () => reject(new Error("Close older AnnotateIQ tabs, then reload."));
  });
}

export async function readState(): Promise<DemoState> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction("data", "readonly");
      const request = transaction.objectStore("data").get("state");
      request.onsuccess = () => {
        const value = request.result as DemoState | undefined;
        if (value && value.version !== 1) reject(new Error("Saved demo version is unsupported. Export your results before resetting site data."));
        else resolve(value ?? structuredClone(EMPTY));
      };
      request.onerror = () => reject(new Error("Cannot read saved papers."));
    });
  } finally {
    database.close();
  }
}

async function writeState(state: DemoState): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("data", "readwrite");
      transaction.objectStore("data").put(state, "state");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error("Could not save results. Free some browser storage, then retry."));
      transaction.onabort = () => reject(new Error("Saving was interrupted. Your previous saved results are intact."));
    });
  } finally {
    database.close();
  }
}

/** Serialize writes, with a cross-tab lock where the browser supports Web Locks. */
export function mutateState<T>(fn: (state: DemoState) => T | Promise<T>): Promise<T> {
  const execute = async () => {
    const work = async () => {
      const state = await readState();
      const value = await fn(state);
      await writeState(state);
      return value;
    };
    if (typeof navigator !== "undefined" && navigator.locks) return navigator.locks.request("annotateiq-state", work);
    return work();
  };
  const task = mutationQueue.then(execute, execute);
  mutationQueue = task.then(() => undefined, () => undefined);
  return task;
}
