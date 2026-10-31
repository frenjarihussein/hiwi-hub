import { supabase } from "@/integrations/supabase/client";
import { offlineTransport } from "./offline-transport";

/** Wrap query fetchers without altering the managed auth client or transport. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function offlineQuery<T extends object>(builder: T): T {
  // PostgREST creates fresh builders at select/filter boundaries; follow the chain.
  return new Proxy(builder, {
    get(target, key, receiver) {
      if (key === "then") {
        const q = target as T & { fetch: typeof fetch };
        const original = q.fetch;
        q.fetch = offlineTransport(original);
        const then = Reflect.get(target, key, receiver);
        return typeof then === "function" ? then.bind(target) : then;
      }
      const value = Reflect.get(target, key, receiver);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        const result = value.apply(target, args);
        return result && typeof result === "object" && "then" in result && "url" in result ? offlineQuery(result) : result;
      };
    },
  });
}
export const offlineDb = new Proxy(supabase, {
  get(target, key) {
    if (key === "from" || key === "rpc") {
      return (...args: unknown[]) => {
        const fn = Reflect.get(target, key) as (...parameters: unknown[]) => object;
        return offlineQuery(Reflect.apply(fn, target, args));
      };
    }
    const value = Reflect.get(target, key);
    return typeof value === "function" ? value.bind(target) : value;
  },
});