'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';

export default function ManagerNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  // Сохраняем параметры для передачи между страницами
  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    const org = searchParams.get('org');
    const employeeID = searchParams.get('employeeID');
    const token = searchParams.get('token');
    
    if (org) params.set('org', org);
    if (employeeID) params.set('employeeID', employeeID);
    if (token) params.set('token', token);
    
    const str = params.toString();
    return str ? `?${str}` : '';
  }, [searchParams]);

  const links = [
    { href: `/manager${queryString}`, label: 'Заказы', match: '/manager' },
    { href: `/manager/labels${queryString}`, label: 'Маркировка', match: '/manager/labels' },
  ];

  return (
    <nav className="bg-neutral-900 border-b border-white/10 px-4 py-3">
      <div className="flex items-center gap-2">
        <div className="text-white/70 text-sm font-semibold mr-4">Manager Console:</div>
        {links.map((link) => {
          const isActive = pathname === link.match || pathname.startsWith(link.match + '/');
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-yellow-500 text-black'
                  : 'bg-neutral-800 text-white/80 hover:bg-neutral-700 hover:text-white'
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
