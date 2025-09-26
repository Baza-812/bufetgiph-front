// src/components/ui/Panel.tsx
import React from 'react';

export default function Panel({ title, right, children }:{
  title?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="bg-zinc-900/80 border border-white/10 rounded-2xl shadow-sm mb-6">
      {(title || right) && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h2 className="text-lg font-bold">{title}</h2>
          <div>{right}</div>
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}
