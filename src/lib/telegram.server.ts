import { faultLine, fmtSolarTime, plantKindLabel } from "./solar-fault-codes";
import { electricalLines, energyFlow, type ElectricalDevice } from "./solar-monitor";
/** Server-only Telegram Bot helpers. The bot token never leaves the server. */
import { isStale } from './solar-monitor';
export const TELEGRAM_BOT_USERNAME = "KFP_solar_bot";

import { telegramBotToken } from "./integrations.server";
const token = telegramBotToken;

/** Downloads a Telegram file (e.g. a voice note) server-side, capped at maxBytes. */
export async function telegramFile(fileId: string, maxBytes: number) {
  const info = await telegramCall('getFile', { file_id: fileId }) as { result?: { file_path?: string; file_size?: number } };
  const path = info.result?.file_path;
  if (!path || (info.result?.file_size ?? 0) > maxBytes) throw new Error('الملف الصوتي غير متاح أو كبير جداً.');
  const res = await fetch(`https://api.telegram.org/file/bot${await token()}/${path}`);
  if (!res.ok) throw new Error('تعذر تنزيل الرسالة الصوتية.');
  const buf = await res.arrayBuffer();
  if (buf.byteLength > maxBytes) throw new Error('الرسالة الصوتية طويلة جداً.');
  return buf;
}


/** Webhook secret derived from the bot token so only Telegram (registered with it) can call us. */
export async function webhookSecret() {
  const bytes = new TextEncoder().encode(`telegram-webhook:${await token()}`);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(hash, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function telegramCall(method: string, body: object) {
  const res = await fetch(`https://api.telegram.org/bot${await token()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) { const body = await res.text(); console.error('Telegram request failed', method, res.status, body); throw new Error(`Telegram request failed [${res.status}]: ${body}`); }
  const result = await res.json() as { ok: boolean; description?: string; result?: { name?: string; description?: string; short_description?: string } };
  if (!result.ok) throw new Error(`Telegram rejected the request: ${result.description || ''}`);
  return result;
}

export async function telegramPhoto(dataUrl: string) {
  if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) throw new Error('JPEG photo required');
  const bytes = Uint8Array.from(atob(dataUrl.split(',')[1] || ''), c => c.charCodeAt(0));
  if (bytes.length > 2_000_000 || bytes[0] !== 255 || bytes[1] !== 216) throw new Error('Invalid photo');
  const form = new FormData();
  form.set('photo', JSON.stringify({ type: 'static', photo: 'attach://picture' }));
  form.set('picture', new Blob([bytes], { type: 'image/jpeg' }), 'bot.jpg');
  const result = await fetch(`https://api.telegram.org/bot${await token()}/setMyProfilePhoto`, { method: 'POST', body: form });
  const body = await result.text();
  if (!result.ok || !JSON.parse(body).ok) throw new Error(`Telegram photo failed [${result.status}]: ${body}`);
}

export async function sendTelegram(chatId: number, text: string, keyboard?: { text: string; callback_data: string }[][]) {
  // Telegram caps message text at 4096; splitting preserves complete project reports.
  const chunks = text.split('\n\n');
  let part = '';
  for (const chunk of chunks) {
    if (part.length + chunk.length > 3800 && part) {
      await telegramCall('sendMessage', { chat_id: chatId, text: part, parse_mode: 'HTML' });
      part = '';
    }
    part += (part ? '\n\n' : '') + chunk;
  }
  await telegramCall('sendMessage', { chat_id: chatId, text: part || text, parse_mode: 'HTML', disable_web_page_preview: true, ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}) });
}

const STATUS_AR: Record<string, string> = { running: "🟢 يعمل", standby: "🟡 استعداد", offline: "⚪ غير متصل", fault: "🔴 عطل" };
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] ?? c);

type Row = { name: string; demo: boolean; last_sync: string | null; data: Record<string, unknown> | null };

export const REPORT_KINDS = ["status", "today", "alarms", "top", "attention", "finance"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];
const n = (v: unknown) => Number(v ?? 0) || 0;
const ex = (d: Record<string, unknown>) => (d["extra"] ?? {}) as Record<string, unknown>;
const eqh = (d: Record<string, unknown>) => n(ex(d)["equivalent_hours"]) || (n(d["capacity_kwp"]) ? n(d["today_kwh"]) / n(d["capacity_kwp"]) : 0);

const kindTag = (r: Row) => { const k = ((r.data?.['extra'] ?? {}) as Record<string, unknown>)['plant_kind']; return k ? ` · ${plantKindLabel(k)}` : ''; };
export function formatReport(kind: ReportKind, rows: Row[]) {
  if (!rows.length) return "لا توجد مشاريع مرتبطة بمراقبة الإنفرترات بعد.";
  if (kind === "alarms") {
    const lines = rows.flatMap((r) => {
      const alarms = (r.data?.["alarms"] as { text?: string; message?: string }[] | undefined) ?? [];
      const fault = r.data?.["status"] === "fault";
      const offline = r.data?.['status'] === 'offline';
      if (!alarms.length && !fault && !offline) return [];
      return [`⚠️ <b>${esc(r.name)}</b>${r.demo ? ' (تجريبي)' : ''}${kindTag(r)}\n` + (alarms.length ? alarms.map((a) => faultLine({ code: (a as any).code, text: a.text ?? a.message ?? 'إنذار', at: (a as any).at }, esc)).join("\n") : offline ? '• المحطة غير متصلة' : "• حالة عطل") + `\nآخر قراءة: ${fmtSolarTime(r.last_sync)}`];
    });
    return lines.length ? lines.join("\n\n") : "✅ لا توجد إنذارات حالياً.";
  }
  const live = rows.filter((r) => r.data);
  if (kind === "top") {
    const top = [...live].sort((a, b) => n(b.data!["today_kwh"]) - n(a.data!["today_kwh"])).slice(0, 5);
    return "🏆 <b>أفضل المحطات أداءً اليوم</b>\n" + (top.map((r, i) => `${i + 1}. <b>${esc(r.name)}</b>: ${n(r.data!["today_kwh"]).toFixed(1)} kWh`).join("\n") || "لا توجد قراءات.");
  }
  if (kind === "attention") {
    const weak = rows.filter((r) => !r.data || r.data["status"] === "offline" || r.data["status"] === "fault" || (n(r.data["capacity_kwp"]) > 0 && eqh(r.data) < 1.5) || isStale(r.last_sync, new Date()));
    return "🔎 <b>محطات تحتاج انتباهاً</b>\n" + (weak.map((r) => {
      const d = r.data;
      const why = !d ? "لا توجد قراءة" : d["status"] === "fault" ? "عطل" : d["status"] === "offline" ? "غير متصلة" : isStale(r.last_sync, new Date()) ? "قراءة متأخرة" : "إنتاج منخفض";
      return `• <b>${esc(r.name)}</b>: ${why}`;
    }).join("\n") || "✅ كل المحطات تعمل بشكل طبيعي.");
  }
  if (kind === "finance") {
    let ti = 0, tot = 0, co2 = 0, cur = "";
    const body = live.map((r) => {
      const e = ex(r.data!);
      ti += n(e["today_income"]); tot += n(e["total_income"]); co2 += n(e["co2_kg"]) || n(r.data!["total_kwh"]) * 0.7;
      cur ||= String(e["currency"] ?? "");
      return `• <b>${esc(r.name)}</b>: اليوم ${n(e["today_income"]).toFixed(2)} · الكلي ${n(e["total_income"]).toFixed(0)}`;
    });
    return `💰 <b>العوائد والأثر البيئي</b>\n${body.join("\n")}\n\n<b>عائد اليوم:</b> ${ti.toFixed(2)} ${esc(cur)}\n<b>العائد الكلي:</b> ${tot.toFixed(0)} ${esc(cur)}\n<b>خفض CO₂:</b> ${(co2 / 1000).toFixed(1)} طن`;
  }
  let total = 0;
  const kOrder = (r: Row) => { const k = ex(r.data ?? {})['plant_kind']; return k === 'ess' ? 0 : k === 'ongrid' ? 1 : 2; };
  const body = [...rows].sort((a, b) => kOrder(a) - kOrder(b)).map((r) => {
    const d = r.data ?? {};
    if (!r.data) return `<b>${esc(r.name)}</b>: لا توجد قراءة صحيحة بعد.`;
    const today = n(d["today_kwh"]);
    total += today;
    const tag = (r.demo ? " (تجريبي)" : "") + kindTag(r);
    const when = r.last_sync ? fmtSolarTime(r.last_sync) : "—";
    const stale = isStale(r.last_sync, new Date()) ? ' ⚠️ قراءة متأخرة' : '';
    if (kind === "today") return `• <b>${esc(r.name)}</b>${tag}: ${today.toFixed(1)} kWh${stale}`;
    const e = ex(d);
    const money = n(e["today_income"]) ? `\nعائد اليوم ${n(e["today_income"]).toFixed(2)} ${esc(String(e["currency"] ?? ""))}` : "";
    const counts = `الإنذارات: ${n(e["alarm_count"]) || (Array.isArray(d['alarms']) ? d['alarms'].length : 0)} · الأعطال: ${n(e["fault_count"])}`;
    const grid = e["grid"] === "disconnected" ? " · ⚪ غير متصل بالإنترنت" : e["grid_mode"] === "zero_export" ? " · 🏭 استهلاك ذاتي (لا يورّد للشبكة)" : e["grid_mode"] === "feed_in" ? " · ⚡ يورّد للشبكة" : "";
    const invCount = Array.isArray(d['electrical']) ? (d['electrical'] as ElectricalDevice[]).filter(x => x.kind === 'inverter').length : 0;
    return `<b>${esc(r.name)}</b>${tag}\n${STATUS_AR[String(d["status"])] ?? "—"}${stale} · ${n(d["power_kw"]).toFixed(2)} kW${grid}\nاليوم ${today.toFixed(1)} kWh\nالإنتاج الكلي ${n(d['total_kwh']).toFixed(1)} kWh · عدد الإنفرترات ${invCount || 1}${money}${(() => { const fl = energyFlow(d['electrical'] as ElectricalDevice[] | undefined, n(d['power_kw'])); return fl ? `\n🏠 استهلاك ${fl.load_kw} kW · ${fl.grid_kw >= 0 ? 'سحب من الشبكة' : 'توريد للشبكة'} ${Math.abs(fl.grid_kw)} kW` : ''; })()}\n${counts}${Array.isArray(d['electrical']) && d['electrical'].length ? '\n⚡ ' + electricalLines(d['electrical'] as ElectricalDevice[]).map(esc).join('\n') : ''}\nآخر قراءة: ${when}`;
  });
  return (kind === "today" ? "☀️ <b>إنتاج اليوم</b>\n" : "📊 <b>حالة المحطات</b>\n\n") + body.join(kind === "today" ? "\n" : "\n\n") + `\n\n<b>إجمالي إنتاج اليوم:</b> ${total.toFixed(1)} kWh`;
}
