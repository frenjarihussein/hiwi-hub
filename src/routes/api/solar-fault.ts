import { createFileRoute } from '@tanstack/react-router';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '@/lib/app-database.types';
export const Route = createFileRoute('/api/solar-fault')({ server:{ handlers:{ POST:async ({ request }) => {
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');
  const url = process.env['SUPABASE_URL'], key = process.env['SUPABASE_PUBLISHABLE_KEY'];
  if (!token || !url || !key) return Response.json({ error:'يجب تسجيل الدخول.' },{ status:401 });
  const sb = createClient<Database>(url,key,{ global:{ headers:{ Authorization:`Bearer ${token}` } },auth:{ persistSession:false,autoRefreshToken:false } });
  const user = await sb.auth.getUser(token);
  if (!user.data.user || user.error) return Response.json({ error:'انتهت الجلسة.' },{ status:401 });
  const body = z.object({ projectId:z.string().uuid(),index:z.number().int().min(0).max(999) }).safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error:'طلب غير صالح.' },{ status:400 });
  const permitted = await sb.rpc('has_perm',{ _module:'projects',_action:'view' });
  const project = (await sb.from('projects').select('id,tenant_id').eq('id',body.data.projectId).maybeSingle()).data;
  if (!project || !permitted.data) return Response.json({ error:'المشروع غير متاح.' },{ status:403 });
  const monitor = (await sb.from('solar_monitoring').select('last_data,demo,provider').eq('project_id',project.id).maybeSingle()).data;
  if (!monitor) return Response.json({ error:'لا توجد بيانات مراقبة.' },{ status:404 });
  const { appDatabaseAdmin: supabaseAdmin } = await import('@/lib/app-database.server');
  const { faultAnalysis, FaultAnalysisError } = await import('@/lib/solar-fault.server');
  const iterator = faultAnalysis(supabaseAdmin,project.tenant_id,monitor,body.data.index,request.signal);
  let first: IteratorResult<string,void>;
  try { first = await iterator.next(); }
  catch(error) { return Response.json({ error:error instanceof Error ? error.message : 'تعذر التحليل.' },{ status:request.signal.aborted ? 499 : error instanceof FaultAnalysisError ? error.status : 500 }); }
  const encoder = new TextEncoder();
  const stream = new ReadableStream({ async start(controller) {
    const emit = (value: object) => controller.enqueue(encoder.encode(JSON.stringify(value)+'\n'));
    emit({ state:'started' });
    try { if (!first.done) emit({ text:first.value }); for await (const text of iterator) emit({ text }); emit({ state:'done' }); }
    catch (error) { emit({ error:error instanceof Error ? error.message : 'تعذر التحليل.' }); }
    finally { controller.close(); }
  } });
  return new Response(stream,{ headers:{ 'Content-Type':'application/x-ndjson','Cache-Control':'no-store' } });
} } } });