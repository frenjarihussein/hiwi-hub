import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { getTelegramIdentity, saveTelegramIdentity } from '@/lib/solar-fleet.functions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Save, RefreshCw, ImagePlus } from 'lucide-react';

export function BotIdentitySettings() {
  const load = useServerFn(getTelegramIdentity), save = useServerFn(saveTelegramIdentity);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [shortDescription, setShortDescription] = useState('');
  const [photo, setPhoto] = useState<string>();
  const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<void>) { setBusy(true); try { await action(); } catch (e) { toast.error(e instanceof Error ? e.message : 'تعذر تحديث البوت'); } finally { setBusy(false); } }
  async function choosePhoto(file?: File) {
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('اختر صورة'); return; }
    const image = await createImageBitmap(file);
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 640;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const side = Math.min(image.width, image.height);
    ctx.drawImage(image, (image.width-side)/2, (image.height-side)/2, side, side, 0, 0, 640, 640);
    setPhoto(canvas.toDataURL('image/jpeg', 0.85)); image.close();
  }
  return <section className="space-y-4 border-y py-5">
    <div className="flex items-center justify-between"><h2 className="font-semibold">هوية البوت</h2><Button variant="outline" size="sm" disabled={busy} onClick={() => run(async () => { const value = await load(); setName(value.name); setDescription(value.description); setShortDescription(value.shortDescription); })}><RefreshCw className="size-4" />جلب الإعدادات الحالية</Button></div>
    <div className="grid gap-4 sm:grid-cols-2"><label className="space-y-1 text-sm">اسم البوت<Input maxLength={64} value={name} onChange={e => setName(e.target.value)} /></label><label className="space-y-1 text-sm">نبذة قصيرة<Input maxLength={120} value={shortDescription} onChange={e => setShortDescription(e.target.value)} /></label><label className="space-y-1 text-sm sm:col-span-2">وصف البوت<Textarea maxLength={512} value={description} onChange={e => setDescription(e.target.value)} /></label></div>
    <div className="flex flex-wrap items-center gap-3">{photo && <img src={photo} alt="صورة البوت الجديدة" className="size-20 rounded object-cover" />}<label className="flex items-center gap-2 text-sm"><ImagePlus className="size-4" />صورة البوت<Input type="file" accept="image/*" className="max-w-60" onChange={e => void choosePhoto(e.target.files?.[0])} /></label><Button disabled={busy || !name.trim()} onClick={() => run(async () => { await save({ data: { name, description, shortDescription, ...(photo ? { photo } : {}) } }); toast.success('تم تحديث هوية البوت'); })}><Save className="size-4" />حفظ هوية البوت</Button></div>
  </section>;
}