'use client';

import { useEffect } from 'react';
import Button from '@/components/ui/Button';

type Props = {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
};

export default function LegalDocModal({ title, children, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="legal-doc-title">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} role="presentation" />
      <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-2xl bg-neutral-900 rounded-xl shadow-xl border border-white/10 flex flex-col max-h-[85vh]"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <div className="px-5 py-3 border-b border-white/10 flex justify-between items-start gap-3 flex-shrink-0">
            <h2 id="legal-doc-title" className="text-white font-semibold text-base pr-2">
              {title}
            </h2>
            <button
              type="button"
              className="text-white/60 hover:text-white text-2xl leading-none shrink-0"
              onClick={onClose}
              aria-label="Закрыть"
            >
              ×
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4 text-white/80 text-sm leading-relaxed whitespace-pre-wrap">
            {children}
          </div>
          <div className="px-5 py-3 border-t border-white/10 flex-shrink-0">
            <Button type="button" variant="ghost" onClick={onClose}>
              Закрыть
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
