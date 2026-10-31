export type WorkTask = { id: number; label: string; completed?: number | undefined; total?: number | undefined };
let serial = 0;
let tasks: WorkTask[] = [];
const listeners = new Set<() => void>();
const empty: WorkTask[] = [];
const emit = () => { for (const listener of listeners) listener(); };
export const subscribeWork = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getWork = () => tasks;
export const getServerWork = () => empty;

export function startWork(label = "جاري العمل", total?: number) {
  const id = ++serial;
  tasks = [...tasks, { id, label, total, completed: total ? 0 : undefined }];
  emit();
  let finished = false;
  return {
    update(label: string, completed?: number, total?: number) {
      if (finished) return;
      tasks = tasks.map((task) => task.id === id ? { ...task, label, completed, total: total ?? task.total } : task);
      emit();
    },
    finish() {
      if (finished) return;
      finished = true;
      tasks = tasks.filter((task) => task.id !== id);
      emit();
    },
  };
}

export function workPercent(task: WorkTask): number | undefined {
  if (!task.total || task.completed === undefined) return undefined;
  return Math.min(100, Math.max(0, Math.floor(task.completed / task.total * 100)));
}

/** Track actual application requests, not analytics, realtime or session refreshes. */
export function installRequestProgress() {
  const original = window.fetch;
  const tracked: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.href);
    const backend = import.meta.env['VITE_SUPABASE_URL'];
    const isBackend = backend && url.origin === new URL(backend).origin && /^\/(rest|storage)\/v1\//.test(url.pathname);
    const isApp = url.origin === window.location.origin && /^\/(api|_server|_serverFn)\//.test(url.pathname);
    if (!isBackend && !isApp) return original.call(window, input, init);
    const work = startWork();
    try { return await original.call(window, input, init); }
    finally { work.finish(); }
  };
  window.fetch = tracked;
  return () => { if (window.fetch === tracked) window.fetch = original; };
}