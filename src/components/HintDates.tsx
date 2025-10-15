'use client';
import React from 'react';

export default function HintDates({ isManager = false }: { isManager?: boolean }) {
  return (
    <div className="mt-2 text-xs sm:text-sm text-white/70 leading-relaxed">
      <p>
        Нажмите на дату, чтобы оформить заказ.{' '}
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm bg-yellow-400 align-middle" />
          <span>— свободно</span>
        </span>
        {'  '}
        <span className="inline-flex items-center gap-1 ml-3">
          <span className="inline-block w-3 h-3 rounded-sm bg-neutral-500 align-middle" />
          <span>— уже заказано</span>
        </span>
        .
      </p>
      <p className="mt-1">
        Нажав на дату, на которую уже сделан заказ, вы увидите состав заказа и кнопки <b>ОК</b>, <b>Изменить</b> и <b>Отменить</b>.
        {' '}
        {isManager
          ? 'Заказ текущего дня менеджер может редактировать до согласованного времени.'
          : 'Заказ на следующий день можно изменить/отменить до 22:00 текущего дня'}
      </p>
    </div>
  );
}
