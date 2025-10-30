'use client';
import { useState } from 'react';
import Button from '@/components/ui/Button';

export default function UploadClient({ dishId }: { dishId: string }) {
  const [file, setFile] = useState<File|null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string| null>(null);

  async function onUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true); setMsg(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('dishId', dishId);
      const res = await fetch('/api/dishes/upload-photo', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Upload failed');
      setMsg('Фото загружено. Обновите страницу, чтобы увидеть результат.');
      setFile(null);
    } catch (err:any) {
      setMsg(`Ошибка: ${err.message || String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onUpload} className="space-y-2">
      <input type="file" accept="image/*" onChange={e=>setFile(e.target.files?.[0]||null)} />
      <div>
        <Button type="submit" disabled={!file || busy}>
          {busy ? 'Загрузка…' : (file ? 'Загрузить' : 'Выберите файл')}
        </Button>
      </div>
      {msg && <div className="text-white/70 text-sm">{msg}</div>}
    </form>
  );
}
