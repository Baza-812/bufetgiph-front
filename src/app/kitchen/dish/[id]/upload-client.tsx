'use client';
import { useState } from 'react';

export default function UploadClient({ dishId, onUploaded }: { dishId: string; onUploaded?: (url:string)=>void }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append('dishId', dishId);
      fd.append('file', file);
      const res = await fetch('/api/dishes/upload-photo', { method: 'POST', body: fd });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || 'upload failed');
      onUploaded?.(j.url);
    } catch (e:any) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
      e.currentTarget.value = '';
    }
  }

  return (
    <div className="flex items-center gap-3">
      <label className="inline-flex items-center px-4 py-2 rounded-2xl bg-yellow-400 text-black cursor-pointer hover:opacity-90">
        {loading ? 'Загрузка...' : 'Загрузить фото'}
        <input type="file" accept="image/*" onChange={onChange} className="hidden" />
      </label>
      {err && <span className="text-red-600 text-sm">{err}</span>}
    </div>
  );
}
