// src/components/ui/Input.tsx
import React from 'react';
export function Field({ label, hint, children }:{ label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block mb-4">
      <div className="text-xs uppercase tracking-wider text-white/60 mb-1">{label}</div>
      {children}
      {hint ? <div className="text-xs text-white/40 mt-1">{hint}</div> : null}
    </label>
  );
}
export default function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white
      placeholder:text-white/40 outline-none focus:ring-2 focus:ring-brand-500 ${props.className||''}`}
    />
  );
}
