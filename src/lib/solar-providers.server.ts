import type { ElectricalDevice, SolarReading } from "./solar-monitor";
import { plantKindFromType } from "./solar-fault-codes";
async function call(env: { base: string; secret: string; appkey: string }, path: string, body: object) {
  const res = await fetch(`${env.base}/openapi/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-access-key": env.secret, sys_code: "901" },
    body: JSON.stringify({ appkey: env.appkey, lang: "_en_US", ...body }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Sungrow ${res.status}: ${text.slice(0, 200)}`);
  const j = JSON.parse(text);
  if (j.result_code !== "1") throw new Error(`Sungrow: ${j.result_msg ?? j.result_code}`);
  return j.result_data;
}

export async function fetchSungrow(
  env: { base: string; secret: string; appkey: string; user: string; pass: string },
  plantId: string,
  cap: number,
  detail = false,
  session?: SungrowSession,
): Promise<SolarReading> {
  const { token, plants } = session ?? await sungrowSession(env);
  const list = { pageList: plants };
  const key = String(plantId).trim().toLowerCase();
  const ps = (list?.pageList ?? []).find((p: any) =>
    String(p.ps_id) === key || String(p.ps_name ?? "").trim().toLowerCase() === key);
  if (!ps) throw new Error("لم يتم العثور على المحطة في حساب سن غرو");
  const num = (v: any) => Number(v?.value ?? v) || 0;
  const power = num(ps.curr_power);
  const unitW = ps.curr_power?.unit === "W";
  const kw = unitW ? power / 1000 : power;
  const today = num(ps.today_energy);
  const todayKwh = ps.today_energy?.unit === "MWh" ? today * 1000 : ps.today_energy?.unit === "Wh" ? today / 1000 : today;
  const total = num(ps.total_energy);
  const totalKwh = ps.total_energy?.unit === "MWh" ? total * 1000 : ps.total_energy?.unit === "Wh" ? total / 1000 : total;
  const faulty = Number(ps.ps_fault_status) === 1 || Number(ps.ps_fault_status) === 2;
  const offline = Number(ps.online_status) === 0;
  // Only problem stations get the extra device lookup, keeping provider call volume low.
  const deviceAlarms = faulty || offline ? await sungrowDeviceAlarms(env, token, String(ps.ps_id)) : [];
  // Electrical telemetry costs extra provider calls, so only on-demand refreshes request it.
  const electrical = detail && !offline ? await sungrowElectrical(env, token, String(ps.ps_id)) : [];
  return {
    at: new Date().toISOString(),
    power_kw: kw,
    capacity_kwp: cap || sgCap(ps),
    today_kwh: todayKwh,
    month_kwh: num(ps.month_energy) * (ps.month_energy?.unit === "MWh" ? 1000 : 1),
    total_kwh: totalKwh,
    status: faulty ? "fault" : Number(ps.online_status) === 0 ? "offline" : kw > 0 ? "running" : "standby",
    curve: [],
    alarms: deviceAlarms.length ? deviceAlarms : faulty ? [{ code: String(ps.ps_fault_status), text: "عطل مبلّغ من المحطة", at: new Date().toISOString() }] : [],
    source: "sungrow",
    ...(electrical.length ? { electrical } : {}),
    extra: {
      plant_kind: plantKindFromType(ps.ps_type),
      today_income: num(ps.today_income) || undefined,
      total_income: num(ps.total_income) || undefined,
      currency: ps.today_income?.unit || ps.total_income?.unit || undefined,
      co2_kg: (() => { const c = num(ps.co2_reduce_total ?? ps.co2_reduce); const u = (ps.co2_reduce_total ?? ps.co2_reduce)?.unit; return c ? (u === "t" ? c * 1000 : c) : undefined; })(),
      equivalent_hours: num(ps.equivalent_hour) || ((cap || sgCap(ps)) ? +(todayKwh / (cap || sgCap(ps))).toFixed(2) : undefined),
      alarm_count: Number(ps.alarm_count ?? 0) || 0,
      fault_count: Number(ps.fault_count ?? 0) || 0,
      grid: Number(ps.online_status) === 0 ? "disconnected" : "connected",
      install_date: ps.install_date ? String(ps.install_date) : undefined,
      location: ps.ps_location ? String(ps.ps_location) : undefined,
    },
  };
}

export type SungrowSession = { token: string; plants: any[] };
/** One login + one plant list serves every station of the account (fleet sync stays within runtime limits). */
export async function sungrowSession(env: { base: string; secret: string; appkey: string; user: string; pass: string }): Promise<SungrowSession> {
  const login = await call(env, "login", { user_account: env.user, user_password: env.pass });
  const token = login?.token;
  if (!token) throw new Error("فشل تسجيل الدخول إلى iSolarCloud");
  return { token, plants: await sungrowPlants(env as any, token) };
}

// Sungrow spells the installed-capacity field "total_capcity"; fall back to installed_power.
function sgCap(ps: any): number {
  const v = ps?.total_capcity ?? ps?.installed_power;
  const n = Number(v?.value ?? v) || 0;
  return v?.unit === "MWp" || v?.unit === "MW" ? n * 1000 : v?.unit === "Wp" || v?.unit === "W" ? n / 1000 : n;
}

type Sma = { id: string; secret: string; base: string; auth: string };
export async function fetchSma(env: Sma, plantId: string, cap: number): Promise<SolarReading> {
  const tok = await fetch(env.auth, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: env.id, client_secret: env.secret }),
  });
  if (!tok.ok) throw new Error(`SMA auth ${tok.status}`);
  const { access_token } = (await tok.json()) as { access_token?: string };
  if (!access_token) throw new Error("فشل تسجيل الدخول إلى SMA");
  const get = async (path: string) => {
    const r = await fetch(`${env.base}/monitoring/v1/${path}`, { headers: { authorization: `Bearer ${access_token}` } });
    if (!r.ok) throw new Error(`SMA ${r.status}`);
    return r.json() as Promise<any>;
  };
  const day = new Date().toISOString().slice(0, 10);
  const live = await get(`plants/${encodeURIComponent(plantId)}/measurements/sets/EnergyAndPowerPv/Recent`);
  const dayData = await get(`plants/${encodeURIComponent(plantId)}/measurements/sets/EnergyAndPowerPv/Day?Date=${day}`);
  if (!Array.isArray(live?.set) || live.set.length === 0 || !Array.isArray(dayData?.set)) throw new Error("SMA measurement data unavailable");
  const set = (live?.set ?? [])[0] ?? {};
  const kw = (Number(set.pvGeneration ?? set.power ?? 0) || 0) / 1000;
  const pts = (dayData?.set ?? []) as any[];
  const curve = pts.map((p) => ({ t: String(p.time ?? "").slice(11, 16), kw: +((Number(p.pvGeneration ?? 0) * 4) / 1000).toFixed(2) }));
  const today = pts.reduce((a, p) => a + (Number(p.pvGeneration ?? 0) || 0), 0) / 1000;
  return {
    at: new Date().toISOString(), power_kw: kw, capacity_kwp: cap, today_kwh: +today.toFixed(1),
    month_kwh: 0, total_kwh: 0, status: kw > 0 ? "running" : "standby", curve, alarms: [], source: "sma",
  };
}


export function sungrowEnvironment() {
  const appkey = process.env['SUNGROW_APP_KEY'];
  const secret = process.env['SUNGROW_APP_SECRET'] || process.env['SUNGROW_SECRET_KEY'];
  const user = process.env['SUNGROW_USER'] || process.env['SUNGROW_USERNAME'];
  const pass = process.env['SUNGROW_PASSWORD'];
  if (!appkey || !secret || !user || !pass) throw new Error('Sungrow connection settings are incomplete.');
  return { appkey, secret, user, pass, base: process.env['SUNGROW_BASE_URL'] || 'https://gateway.isolarcloud.com.hk' };
}
async function sungrowPlants(env: ReturnType<typeof sungrowEnvironment>, token: string) {
  const plants: any[] = [];
  for (let page = 1; page <= 100; page++) {
    const result = await call(env, 'getPowerStationList', { token, curPage: page, size: 100 });
    const rows = result?.pageList;
    if (!Array.isArray(rows)) throw new Error('Invalid Sungrow station list');
    plants.push(...rows);
    if (rows.length < 100 || (Number(result.totalCount) > 0 && plants.length >= Number(result.totalCount))) return plants;
  }
  throw new Error('Station list exceeded supported pagination; no partial import was saved.');
}
export async function discoverStations(provider: 'sungrow' | 'sma', sgEnv?: ReturnType<typeof sungrowEnvironment>, smaEnv?: Sma) {
  if (provider === 'sungrow') {
    const env = sgEnv ?? sungrowEnvironment();
    const login = await call(env, 'login', { user_account: env.user, user_password: env.pass });
    if (!login?.token) throw new Error('Sungrow login failed');
    return (await sungrowPlants(env, login.token)).map(p => ({ plant_id: String(p.ps_id), name: String(p.ps_name || p.ps_id), capacity_kwp: sgCap(p), plant_kind: plantKindFromType(p.ps_type) }));
  }
  const id = smaEnv?.id || process.env['SMA_CLIENT_ID'], secret = smaEnv?.secret || process.env['SMA_CLIENT_SECRET'];
  if (!id || !secret) throw new Error('SMA credentials and plant-owner consent are required.');
  const auth = await fetch(smaEnv?.auth || process.env['SMA_AUTH_URL'] || 'https://auth.smaapis.de/oauth2/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret }) });
  if (!auth.ok) throw new Error(`SMA authorization failed [${auth.status}]`);
  const { access_token } = await auth.json() as { access_token?: string };
  if (!access_token) throw new Error('SMA token unavailable');
  const response = await fetch(`${smaEnv?.base || process.env['SMA_BASE_URL'] || 'https://monitoring.smaapis.de'}/monitoring/v1/plants`, { headers: { authorization: `Bearer ${access_token}` } });
  if (!response.ok) throw new Error(`SMA station list failed [${response.status}]`);
  const result = await response.json() as { plants?: { plantId?: string; id?: string; name?: string; plantName?: string; peakPower?: number }[] };
  if (!Array.isArray(result.plants)) throw new Error('Invalid SMA station list');
  return result.plants.map(p => {
    const plantId = p.plantId || p.id;
    if (!plantId) throw new Error('SMA station ID unavailable');
    return { plant_id: plantId, name: p.name || p.plantName || plantId, capacity_kwp: Number(p.peakPower) || 0 };
  });
}

const DIAG_TEXT: Record<string, string> = { '10': 'انقطاع شبكة AC (جهد الشبكة 0V)', '2': 'ارتفاع جهد الشبكة', '39': 'انخفاض مقاومة العزل', '36': 'ارتفاع حرارة الإنفرتر' };
/** Maps live inverter points to a Sungrow fault code: AC 0V with DC present → 10, AC >253V → 2, insulation <50kΩ → 39, temp >85°C → 36. */
export function diagnoseInverter(g: (point: number) => number | null): string | null {
  const ac = [g(18), g(19), g(20)].filter((v): v is number => v != null);
  const dc = Math.max(g(5) ?? 0, g(7) ?? 0);
  const ins = g(89), temp = g(4);
  if (ins != null && ins > 0 && ins < 50) return '39';
  if (temp != null && temp > 85) return '36';
  if (ac.length && ac.every((v) => v < 1) && dc > 200) return '10';
  if (ac.some((v) => v > 253)) return '2';
  return null;
}

/** Device list of one station: names inverters/loggers that report fault or offline state. Failures yield no extra detail. */
async function sungrowDeviceAlarms(env: { base: string; secret: string; appkey: string }, token: string, psId: string) {
  try {
    const r = await call(env, 'getDeviceList', { token, ps_id: psId, curPage: 1, size: 100 });
    const at = new Date().toISOString();
    const devs = (r?.pageList ?? []) as any[];
    // Alarm endpoints are not authorised for these accounts, so faulty inverters are diagnosed from live telemetry (one call).
    const faultyInv = devs.filter((d) => Number(d.device_type) === 1 && Number(d.dev_fault_status) === 1).slice(0, 20);
    const diag = new Map<string, string>();
    if (faultyInv.length) {
      try {
        const t = await call(env, 'getDeviceRealTimeData', { token, device_type: 1, ps_key_list: faultyInv.map((d) => d.ps_key), point_id_list: ['4', '5', '7', '18', '19', '20', '89'] });
        for (const raw of ((t?.device_point_list ?? []) as any[])) {
          const p = raw?.device_point ?? raw;
          const code = diagnoseInverter((n) => { const v = Number(p?.[`p${n}`]); return Number.isFinite(v) ? v : null; });
          if (code) diag.set(String(p.ps_key), code);
        }
      } catch { /* diagnosis is best-effort */ }
    }
    return devs.flatMap((d) => {
      const dx = diag.get(String(d.ps_key));
      if (dx) return [{ code: dx, text: `${DIAG_TEXT[dx]} — ${String(d.device_name || d.device_sn || 'إنفرتر')}${d.device_sn ? ` (${d.device_sn})` : ''}`, at }];
      const name = String(d.device_name || d.device_sn || d.ps_key || 'جهاز');
      const sn = d.device_sn ? ` (${d.device_sn})` : '';
      const fault = Number(d.dev_fault_status) === 1 || Number(d.dev_fault_status) === 2;
      const off = Number(d.dev_status) === 0;
      if (!fault && !off) return [];
      return [{ code: fault ? `DEV-${d.dev_fault_status}` : 'DEV-OFFLINE', text: `${fault ? (Number(d.dev_fault_status) === 2 ? 'تنبيه في' : 'عطل في') : 'انقطاع اتصال'} ${name}${sn}${d.device_model_code ? ` · ${d.device_model_code}` : ''}`, at }];
    });
  } catch { return []; }
}

/** Best-effort Sungrow live points (inverter type 1, meter type 7). Point IDs follow iSolarCloud OpenAPI; failures yield nothing. */
async function sungrowElectrical(env: { base: string; secret: string; appkey: string }, token: string, psId: string): Promise<ElectricalDevice[]> {
  try {
    const list = ((await call(env, 'getDeviceList', { token, ps_id: psId, curPage: 1, size: 100 }))?.pageList ?? []) as any[];
    const inv = list.filter((d) => Number(d.device_type) === 1).slice(0, 20);
    const met = list.filter((d) => Number(d.device_type) === 7).slice(0, 5);
    const num = (v: any) => { const n = Number(v?.value ?? v); return Number.isFinite(n) && v !== null && v !== '' && v !== undefined ? n : null; };
    const fetchPts = async (devs: any[], type: number, pts: string[]) => {
      if (!devs.length) return [] as any[];
      const r = await call(env, 'getDeviceRealTimeData', { token, device_type: type, ps_key_list: devs.map((d) => d.ps_key), point_id_list: pts });
      return ((r?.device_point_list ?? []) as any[]).map((x) => x?.device_point ?? x);
    };
    const name = (p: any, devs: any[]) => String(p.device_name || devs.find((d) => d.ps_key === p.ps_key)?.device_name || p.ps_key || 'جهاز');
    // Point IDs verified against a live SG125CX-P2: MPPT1-3 = p5..p10, MPPT4-10 = p45..p58,
    // string currents p70..p85, string voltages p96.., PF p26, DC power p14, reactive p25.
    const MPPT: [number, number][] = [[5,6],[7,8],[9,10],[45,46],[47,48],[49,50],[51,52],[53,54],[55,56],[57,58],[59,60],[61,62]];
    const invPts = [...new Set(['1','3','4','14','18','19','20','21','22','23','24','25','26','27','44','86','89','90', ...MPPT.flat().map(String), ...Array.from({ length: 16 }, (_, i) => String(70 + i)), ...Array.from({ length: 24 }, (_, i) => String(96 + i))])];
    const [ip, mp] = await Promise.all([
      fetchPts(inv, 1, invPts),
      fetchPts(met, 7, ['8001','8002','8003','8014','8018','8064']),
    ]);
    const kw = (w: number | null) => (w == null ? undefined : +(w / 1000).toFixed(3));
    const out: ElectricalDevice[] = ip.map((p) => {
      const g = (n: number) => num(p[`p${n}`]);
      const dc = MPPT.map(([v, i]) => ({ v: g(v) ?? 0, i: g(i) ?? 0 })).filter((m) => m.v > 0 || m.i > 0);
      const strings = Array.from({ length: 16 }, (_, k) => ({ v: g(96 + k) ?? 0, i: g(70 + k) ?? 0 })).filter((s) => s.v > 0 || s.i > 0);
      const dev = inv.find((d) => d.ps_key === p.ps_key);
      return { device: name(p, inv), kind: 'inverter', model: dev?.device_model_code ?? undefined, sn: dev?.device_sn ?? undefined,
        ac_v: [g(18), g(19), g(20)], ac_i: [g(21), g(22), g(23)], active_kw: kw(g(24)), dc_kw: kw(g(14)), reactive_var: g(25) ?? undefined,
        freq_hz: g(27) ?? undefined, temp_c: g(4) ?? undefined, pf: g(26) ?? undefined, today_kwh: g(1) != null ? +(g(1)! / 1000).toFixed(1) : undefined,
        grid_hours: g(3) ?? undefined, day_minutes: g(44) ?? undefined, insulation_kohm: g(89) ?? undefined, neg_ground_v: g(90) ?? undefined, kw_per_kwp: g(86) ?? undefined,
        dc, strings };
    });
    mp.forEach((p) => out.push({ device: name(p, met), kind: 'meter', active_kw: kw(num(p.p8018)), ac_v: [num(p.p8001), num(p.p8002), num(p.p8003)], pf: num(p.p8014) ?? undefined, freq_hz: num(p.p8064) ?? undefined }));
    return out;
  } catch { return []; }
}
