interface HintDatesProps {
  cutoffTime?: string;
  isManager?: boolean;
}

export default function HintDates({ cutoffTime = '18:00', isManager = false }: HintDatesProps) {
  if (isManager) {
    return (
      <p style={{ marginTop: '15px', fontSize: '12px', color: '#aaa' }}>
        Нажмите на дату, чтобы посмотреть заказы сотрудников на этот день.
      </p>
    );
  }

  return (
    <p style={{ marginTop: '15px', fontSize: '12px', color: '#aaa' }}>
      Нажмите на дату, чтобы оформить заказ. Заказ на следующий день можно изменить/отменить до {cutoffTime} текущего дня.
    </p>
  );
}
