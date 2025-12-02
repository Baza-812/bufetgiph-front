interface HintDatesProps {
  cutoffTime?: string;
}

export default function HintDates({ cutoffTime = '18:00' }: HintDatesProps) {
  return (
    <p style={{ marginTop: '15px', fontSize: '12px', color: '#aaa' }}>
      Нажмите на дату, чтобы оформить заказ. Заказ на следующий день можно изменить/отменить до {cutoffTime} текущего дня.
    </p>
  );
}
