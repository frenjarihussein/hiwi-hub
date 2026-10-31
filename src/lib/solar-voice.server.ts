/** Speech-to-text for Telegram voice questions via Lovable AI Gateway (streamed SSE transcript). */
export async function transcribeVoice(audio: ArrayBuffer, signal?: AbortSignal): Promise<string> {
  const key = process.env['LOVABLE_API_KEY'];
  if (!key) throw new Error('خدمة الذكاء الاصطناعي غير مهيأة.');
  const form = new FormData();
  form.append('model', 'openai/gpt-transcribe');
  form.append('file', new File([audio], 'voice.ogg', { type: 'audio/ogg' }), 'voice.ogg');
  form.append('response_format', 'json');
  form.append('stream', 'true');
  form.append('languages', 'ar');
  const res = await fetch('https://ai.gateway.lovable.dev/v1/audio/transcriptions', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'X-Lovable-AIG-SDK': 'fetch' }, body: form, ...(signal ? { signal } : {}),
  });
  if (!res.ok || !res.body) {
    const raw = await res.json().catch(() => ({})) as { message?: string; error?: { message?: string } };
    throw new Error(raw.message || raw.error?.message || `تعذر تحويل الصوت إلى نص (${res.status})`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '', text = '', done = '';
  for (;;) {
    const { value, done: end } = await reader.read();
    if (end) break;
    buf += dec.decode(value, { stream: true });
    const frames = buf.split('\n\n'); buf = frames.pop() ?? '';
    for (const f of frames) {
      const line = f.split('\n').find((l) => l.startsWith('data:'));
      if (!line) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') continue;
      const ev = JSON.parse(payload) as { type?: string; delta?: string; text?: string; error?: { message?: string } };
      if (ev.type === 'transcript.text.delta' && ev.delta) text += ev.delta;
      else if (ev.type === 'transcript.text.done' && ev.text) done = ev.text;
      else if (ev.type === 'error' || ev.error) throw new Error(ev.error?.message || 'تعذر تحويل الصوت إلى نص.');
    }
  }
  return (done || text).trim();
}
