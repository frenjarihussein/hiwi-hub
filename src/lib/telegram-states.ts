import { isStale } from './solar-monitor';

/** Operating states used by the Telegram status filter; mirrors the project board classification. */
export const STATES = ['running', 'standby', 'idle', 'alarm', 'fault', 'offline', 'none'] as const;
export type BotState = (typeof STATES)[number];
export const STATE_LABEL: Record<BotState, string> = { running: '🟢 ينتج', standby: '🌙 استعداد', idle: '⚠️ لا ينتج', alarm: '🔔 إنذارات', fault: '🔴 عطل', offline: '📡 غير متصل', none: '— بلا قراءة' };

/** Damascus hour (UTC+3) decides whether zero output in daylight counts as "not producing". */
export function stateOf(data: Record<string, unknown> | null | undefined, lastSync: string | null, now = new Date()): BotState {
  if (!data) return 'none';
  if (isStale(lastSync, now, 60) || data['status'] === 'offline') return 'offline';
  if (data['status'] === 'fault') return 'fault';
  if (Array.isArray(data['alarms']) && data['alarms'].length) return 'alarm';
  if (data['status'] === 'standby' && !(Number(data['power_kw']) > 0)) {
    const h = (now.getUTCHours() + 3) % 24;
    return h >= 9 && h <= 16 ? 'idle' : 'standby';
  }
  return Number(data['power_kw']) > 0 ? 'running' : 'standby';
}
