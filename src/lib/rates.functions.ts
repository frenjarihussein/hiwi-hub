import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Fetches Damascus sell prices (old SYP per 1 unit) from sp-today.com. */
export const fetchLiveRates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<{ rates: Record<string, number>; updatedAt: string | null; error?: string }> => {
    try {
      const res = await fetch("https://sp-today.com/en/currencies", { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!res.ok) return { rates: {}, updatedAt: null, error: "تعذر الوصول إلى موقع الليرة اليوم" };
      const t = (await res.text()).replace(/\\"/g, '"');
      const rates: Record<string, number> = {};
      const re = /\{"code":"([A-Z]{3})","slug[^{]*"cities":\{"damascus":\{"buy":([\d.]+),"sell":([\d.]+)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(t))) {
        const sell = Number(m[3]);
        if (sell > 0 && rates[m[1]!] === undefined) rates[m[1]!] = sell;
      }
      const up = /"updated_at":"([^"]+)"/.exec(t)?.[1] ?? null;
      if (!Object.keys(rates).length) return { rates, updatedAt: null, error: "لم يتم العثور على أسعار في الموقع" };
      return { rates, updatedAt: up };
    } catch (e) {
      console.error("fetchLiveRates", e);
      return { rates: {}, updatedAt: null, error: "تعذر جلب الأسعار" };
    }
  });
