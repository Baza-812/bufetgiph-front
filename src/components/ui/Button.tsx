// src/components/ui/Button.tsx
import React from 'react';
type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
};

export default function Button({ variant='primary', size='md', className='', ...rest }: Props) {
  const base = 'inline-flex items-center justify-center rounded-2xl font-semibold transition focus:outline-none';
  const sizes = {
    sm: 'h-9 px-4 text-sm',
    md: 'h-11 px-5 text-sm',
    lg: 'h-12 px-6 text-base'
  }[size];
  const variants = {
    primary: 'bg-yellow-400 text-black hover:brightness-110 active:brightness-95',
    ghost:   'bg-white/5 text-white hover:bg-white/10',
    danger:  'bg-red-500 text-white hover:bg-red-600'
  }[variant];

  return <button {...rest} className={`${base} ${sizes} ${variants} ${className}`} />;
}
