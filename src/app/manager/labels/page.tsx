'use client';

import { useState, useEffect } from 'react';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';
import ManagerNav from '@/components/ManagerNav';

type OrgOption = { id: string; name: string };

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin', ...init });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${init?.method || 'GET'} ${url} -> ${res.status}: ${text}`);
  }
  return res.json();
}

export default function LabelsPage() {
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Загружаем список организаций
  useEffect(() => {
    (async () => {
      try {
        // Используем существующий API для получения списка организаций
        const response = await fetch('/api/debug/airtable?table=Organizations&maxRecords=100');
        const data = await response.json();
        
        if (data.ok && data.records) {
          const orgList = data.records.map((r: any) => ({
            id: r.fields?.OrgID || r.fields?.['OrgID'] || r.id,
            name: r.fields?.Name || r.fields?.['Name'] || `Org ${r.id}`,
          }));
          setOrgs(orgList);
          if (orgList.length > 0) setSelectedOrg(orgList[0].id);
        }
      } catch (e: any) {
        console.error('Failed to load organizations:', e);
        setError('Не удалось загрузить список организаций');
      }
    })();
  }, []);

  // Устанавливаем завтрашнюю дату по умолчанию
  useEffect(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setSelectedDate(tomorrow.toISOString().slice(0, 10));
  }, []);

  const handleDownload = async () => {
    if (!selectedOrg || !selectedDate) {
      setError('Выберите организацию и дату');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const url = `/api/labels/export?org=${encodeURIComponent(selectedOrg)}&date=${encodeURIComponent(selectedDate)}`;
      const response = await fetch(url);

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      // Скачиваем файл
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      
      // Извлекаем имя файла из заголовка Content-Disposition
      const disposition = response.headers.get('Content-Disposition');
      let filename = `Маркировка_${selectedDate}.xlsx`;
      if (disposition) {
        const match = disposition.match(/filename\*=UTF-8''(.+)/);
        if (match) {
          filename = decodeURIComponent(match[1]);
        }
      }
      
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);

      setSuccess(`Файл ${filename} успешно скачан!`);
    } catch (e: any) {
      console.error('Download error:', e);
      setError(e.message || 'Ошибка при скачивании файла');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <ManagerNav />
      <main className="p-4 space-y-6">
        <Panel title="Маркировка — Выгрузка наклеек">
        <div className="space-y-4">
          <div className="text-sm text-white/70 mb-4">
            Выберите организацию и дату для выгрузки маркировки в формате XLSX.
            <br />
            Каждое блюдо будет представлено отдельной строкой.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-white/70 mb-2">Организация</label>
              <select
                className="w-full bg-neutral-800 text-white rounded px-3 py-2 border border-white/10"
                value={selectedOrg}
                onChange={(e) => setSelectedOrg(e.target.value)}
                disabled={loading || !orgs.length}
              >
                {orgs.length === 0 && (
                  <option value="">Загрузка...</option>
                )}
                {orgs.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-white/70 mb-2">Дата</label>
              <input
                type="date"
                className="w-full bg-neutral-800 text-white rounded px-3 py-2 border border-white/10"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded text-rose-400">
              {error}
            </div>
          )}

          {success && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded text-emerald-400">
              {success}
            </div>
          )}

          <div className="pt-2">
            <Button
              onClick={handleDownload}
              disabled={loading || !selectedOrg || !selectedDate}
            >
              {loading ? 'Формирование файла...' : 'Скачать маркировку'}
            </Button>
          </div>
        </div>
      </Panel>

      <Panel title="Автоматическая выгрузка">
        <div className="space-y-3">
          <div className="text-sm text-white/70">
            Настройка расписания автоматической выгрузки находится в разработке.
          </div>
          <div className="text-xs text-white/50">
            В будущем здесь будет возможность настроить автоматическую отправку маркировки по расписанию.
          </div>
        </div>
      </Panel>
      </main>
    </>
  );
}
