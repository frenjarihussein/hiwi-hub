import { useRef, useState } from 'react';
import { Sparkles, Square } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
export function FaultAnalysisButton({ projectId,index }: { projectId:string; index:number }) {
  const [open,setOpen] = useState(false), [busy,setBusy] = useState(false), [text,setText] = useState(''), [error,setError] = useState('');
  const abort = useRef<AbortController | null>(null);
  async function analyze() {
    setOpen(true); setBusy(true); setText(''); setError('');
    const controller = new AbortController(); abort.current = controller;
    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) throw new Error('يجب تسجيل الدخول.');
      const response = await fetch('/api/solar-fault',{ method:'POST',headers:{ 'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}` },body:JSON.stringify({ projectId,index }),signal:controller.signal });
      if (!response.ok) { const result = await response.json(); throw new Error(result.error || 'تعذر التحليل.'); }
      const reader = response.body?.getReader(); if (!reader) throw new Error('تعذر قراءة التحليل.');
      const decoder = new TextDecoder(); let pending = '';
      while (true) {
        const chunk = await reader.read(); if (chunk.done) break;
        pending += decoder.decode(chunk.value,{ stream:true });
        const lines = pending.split('\n'); pending = lines.pop() || '';
        for (const line of lines) { if (!line) continue; const value = JSON.parse(line); if (value.error) throw new Error(value.error); if (value.text) setText(t => t+value.text); }
      }
    } catch (e) { setError(controller.signal.aborted ? 'تم إيقاف التحليل.' : e instanceof Error ? e.message : 'تعذر التحليل.'); }
    finally { setBusy(false); abort.current = null; }
  }
  return <><Button size="sm" variant="outline" onClick={analyze} disabled={busy}><Sparkles className="size-4" />تحليل العطل</Button><Dialog open={open} onOpenChange={value => { setOpen(value); if (!value) abort.current?.abort(); }}><DialogContent className="max-h-[85dvh] overflow-auto sm:max-w-2xl"><DialogHeader><DialogTitle>تحليل العطل</DialogTitle></DialogHeader><p className="text-sm text-warning">تشخيص أولي، وليس بديلاً عن دليل المصنع أو فني مؤهل.</p>{busy && <div className="flex items-center justify-between gap-2 text-sm"><span>جارٍ تحليل البيانات…</span><Button size="icon" variant="outline" aria-label="إيقاف التحليل" title="إيقاف التحليل" onClick={() => abort.current?.abort()}><Square className="size-4" /></Button></div>}<div className="whitespace-pre-wrap text-sm leading-7">{text}</div>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</DialogContent></Dialog></>;
}