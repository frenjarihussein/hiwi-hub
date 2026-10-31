export type StorageStatus = { supported: boolean; persisted: boolean; usage: number; quota: number };

export async function getStorageStatus(): Promise<StorageStatus> {
  const s = typeof navigator !== "undefined" ? navigator.storage : undefined;
  if (!s?.persisted) return { supported: false, persisted: false, usage: 0, quota: 0 };
  const [persisted, est] = await Promise.all([s.persisted(), s.estimate ? s.estimate() : Promise.resolve({} as StorageEstimate)]);
  return { supported: true, persisted, usage: est.usage ?? 0, quota: est.quota ?? 0 };
}

export async function requestPersistentStorage(): Promise<boolean> {
  const s = typeof navigator !== "undefined" ? navigator.storage : undefined;
  if (!s?.persist) return false;
  if (await s.persisted()) return true;
  return s.persist();
}
