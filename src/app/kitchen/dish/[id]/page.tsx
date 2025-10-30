'use client';

import { useEffect, useState } from 'react';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';
import { fetchJSON } from '@/lib/api';
import UploadClient from './upload-client';

type DishResp = {
  ok: boolean;
  dish?: {
    id: string;
    name?: string;
    description?: string;
    dishURL?: string;
    howToCook?: string;
    photos?: { url: string; filename?: string; id?: string }[];
  };
  error?: string;
};

export default function DishPage({ params }: { params: { id: string } }) {
  const id = params.id;
  const [data, setData] = useState<DishResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      try {
        setLoading(true); setErr('');
        const url = new URL('/api/dish', window.location.origin);
        url.searchParams.set('id', id);
        const r = await fetchJSON<DishResp>(url.toString());
        setData(r);
      } catch (e:any) {
        setErr(e.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const d = data?.dish;

  return (
    <main>
      <Panel title={d?.name || 'Блюдо'}>
        {loading && <div className="text-white/70">Загрузка…</div>}
        {(err || data?.error) && <div className="text-red-400 text-sm">{err || data?.error}</div>}

        {d && (
          <div className="space-y-4">
            <div>
              <div className="text-white/60 text-sm mb-1">Состав</div>
              <div className="whitespace-pre-wrap">{d.description || '—'}</div>
            </div>
            <div>
              <div className="text-white/60 text-sm mb-1">Ссылка на рецепт</div>
              {d.dishURL ? (
                <a className="text-blue-400 underline break-all" href={d.dishURL} target="_blank" rel="noreferrer">
                  {d.dishURL}
                </a>
              ) : '—'}
            </div>
            <div>
              <div className="text-white/60 text-sm mb-1">Технология приготовления</div>
              <div className="whitespace-pre-wrap">{d.howToCook || '—'}</div>
            </div>

            <div>
              <div className="text-white/60 text-sm mb-2">Фото</div>
              {(d.photos?.length ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {d.photos!.map(p => (
                    <a key={p.id ?? p.url} href={p.url} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt={p.filename ?? 'photo'} className="rounded-xl border aspect-video object-cover" />
                    </a>
                  ))}
                </div>
              ) : <div className="text-white/70 text-sm">Фото пока нет.</div>)}
            </div>

            <UploadClient dishId={id} />
            <div><Button variant="ghost" onClick={()=>history.back()}>Назад</Button></div>
          </div>
        )}
      </Panel>
    </main>
  );
}
