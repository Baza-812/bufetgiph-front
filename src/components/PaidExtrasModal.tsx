'use client';

import { useState, useMemo } from 'react';
import Button from '@/components/ui/Button';
import { MenuItem } from '@/lib/api';

type PaidExtra = {
  itemId: string;
  qty: number;
};

type Props = {
  menu: MenuItem[];
  initialExtras: PaidExtra[];
  onSave: (extras: PaidExtra[]) => void;
  onClose: () => void;
};

function QtyStepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-stretch rounded-lg overflow-hidden border border-white/15 bg-neutral-850">
      <button
        type="button"
        onClick={() => onChange(Math.max(0, value - 1))}
        className="px-3 py-1 text-lg bg-neutral-800 text-white active:scale-95"
        aria-label="Уменьшить"
      >
        −
      </button>
      <div className="w-12 text-center bg-neutral-900 text-white py-1 flex items-center justify-center">
        {value}
      </div>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className="px-3 py-1 text-lg bg-neutral-800 text-white active:scale-95"
        aria-label="Увеличить"
      >
        +
      </button>
    </div>
  );
}

function ruCat(cat: string) {
  const map: Record<string, string> = {
    Zapekanka: 'Запеканки и блины',
    Salad: 'Салаты',
    Soup: 'Супы',
    Main: 'Основные',
    Side: 'Гарниры',
    Pastry: 'Выпечка',
    Fruit: 'Фрукты',
    Drink: 'Напитки',
  };
  return map[cat] || cat;
}

export default function PaidExtrasModal({ menu, initialExtras, onSave, onClose }: Props) {
  const [quantities, setQuantities] = useState<Map<string, number>>(() => {
    const map = new Map<string, number>();
    for (const ex of initialExtras) {
      if (ex.qty > 0) map.set(ex.itemId, ex.qty);
    }
    return map;
  });

  const updateQty = (itemId: string, qty: number) => {
    setQuantities((prev) => {
      const newMap = new Map(prev);
      if (qty <= 0) {
        newMap.delete(itemId);
      } else {
        newMap.set(itemId, qty);
      }
      return newMap;
    });
  };

  const byCategory = useMemo(() => {
    const cats: Record<string, MenuItem[]> = {};
    for (const item of menu) {
      const cat = item.category || 'Other';
      if (!cats[cat]) cats[cat] = [];
      cats[cat].push(item);
    }
    return cats;
  }, [menu]);

  const categoryOrder = ['Salad', 'Soup', 'Main', 'Side', 'Pastry', 'Fruit', 'Drink', 'Zapekanka'];
  const displayCategories = categoryOrder.filter((cat) => byCategory[cat]?.length > 0);

  const totalItems = useMemo(() => {
    let count = 0;
    quantities.forEach((qty) => {
      count += qty;
    });
    return count;
  }, [quantities]);

  const totalPrice = useMemo(() => {
    let sum = 0;
    quantities.forEach((qty, itemId) => {
      const item = menu.find((m) => m.id === itemId);
      if (item?.price) {
        sum += item.price * qty;
      }
    });
    return sum;
  }, [quantities, menu]);

  const handleSave = () => {
    const extras: PaidExtra[] = [];
    quantities.forEach((qty, itemId) => {
      if (qty > 0) {
        extras.push({ itemId, qty });
      }
    });
    onSave(extras);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-3xl bg-neutral-900 rounded-xl shadow-xl border border-white/10 overflow-hidden flex flex-col max-h-[90vh]">
          {/* Заголовок */}
          <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between flex-shrink-0">
            <div>
              <div className="text-white font-semibold text-lg">Дополнительные блюда</div>
              <div className="text-white/60 text-sm mt-1">
                Эти позиции не входят в корпоративный набор и оплачиваются отдельно
              </div>
            </div>
            <button className="text-white/60 hover:text-white text-2xl" onClick={onClose}>
              ×
            </button>
          </div>

          {/* Контент с прокруткой */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="space-y-6">
              {displayCategories.map((cat) => {
                const items = byCategory[cat] || [];
                return (
                  <div key={cat}>
                    <h3 className="text-white/90 font-semibold mb-3 text-base">{ruCat(cat)}</h3>
                    <div className="space-y-3">
                      {items.map((item) => {
                        const qty = quantities.get(item.id) || 0;
                        const hasPrice = typeof item.price === 'number';
                        const priceLabel = hasPrice ? `${item.price} ₽` : 'Цена не указана';

                        return (
                          <div
                            key={item.id}
                            className="bg-neutral-800/50 rounded-lg p-4 border border-white/5"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="text-white font-medium">{item.name}</div>
                                {item.description && (
                                  <div className="text-white/60 text-sm mt-1">{item.description}</div>
                                )}
                                <div className="text-yellow-400 font-semibold mt-2">{priceLabel}</div>
                              </div>
                              <div className="flex-shrink-0">
                                <QtyStepper value={qty} onChange={(v) => updateQty(item.id, v)} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-white/10 bg-neutral-900/95 flex-shrink-0">
            <div className="flex items-center justify-between mb-3">
              <div className="text-white/80">
                Выбрано позиций: <span className="font-semibold text-white">{totalItems}</span>
              </div>
              <div className="text-xl font-bold text-yellow-400">
                К оплате: {totalPrice} ₽
              </div>
            </div>
            <div className="flex gap-3">
              <Button onClick={handleSave}>Готово</Button>
              <Button variant="ghost" onClick={onClose}>
                Отмена
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
