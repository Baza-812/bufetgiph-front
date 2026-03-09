# Платные дополнительные блюда

## Что реализовано

### 1. Frontend (`bufetgiph-front`)

#### Компоненты:
- **`src/components/PaidExtrasModal.tsx`** - модальное окно выбора платных блюд
  - Отображение всех категорий меню (Салаты, Супы, Основные, и т.д.)
  - Для каждого блюда: название, описание, цена, контроллер количества
  - Sticky footer с итоговой суммой
  - Кнопки "Готово", "Удалить все", "Отмена"

- **`src/app/order/quiz/QuizClient.tsx`** - расширен:
  - Добавлен state `paidExtras` для хранения выбранных платных блюд
  - Добавлен state `paidModalOpen` для управления модальным окном
  - Модифицирован `ConfirmStep`:
    - Блок "Дополнительные блюда" с зеленой рамкой и фоном
    - Зеленая кнопка "+ Добавить блюда дополнительно" / "Изменить дополнительные блюда"
    - Summary выбранных платных блюд с ценами
    - Итоговая сумма "К оплате сотрудником"
  - Модифицирован `submitOrder`:
    - Отправка `paidExtras` с ценами на backend
    - Поле `chargeToEmployee: true` для каждой платной позиции

- **`src/app/order/OrderClient.tsx`** - расширен:
  - Добавлен `PaidExtrasEditModal` - модальное окно для редактирования только платных блюд
  - В модалке просмотра заказа:
    - Показываются платные допы отдельным блоком
    - Зеленая кнопка "Доп блюда" для быстрого редактирования
    - Увеличена непрозрачность фона (`bg-black/90`)
  - Прямое редактирование платных допов **без прохождения всего квиза**

#### Изменения в UX:
- Основной flow квиза **не изменился** - все 6 шагов остались прежними
- Точка входа в платные блюда **только на шаге 6** (Подтверждение)
- По умолчанию блок платных блюд **ненавязчивый** - показывается только кнопка
- Финальная кнопка меняется:
  - Без платных блюд: "Подтвердить заказ"
  - С платными блюдами: "Оплатить и подтвердить"
- **Быстрое редактирование**: можно добавить/изменить платные допы из модалки просмотра заказа

### 2. Backend (`bufetgiph-api`)

#### Изменения в `lib/handlers/order.js`:
- Логика обработки `paidExtras`:
  - Создание Order Lines с типом `'Paid'`
  - **Важно**: Unit Price, Line Sum, Charge To Employee - это **formula fields** в Airtable
  - Backend записывает только: Order (линк), Item (линк), Quantity, Line Type='Paid'
  - Все остальное вычисляется автоматически формулами

#### Изменения в `lib/handlers/order_update.js`:
- Поддержка двух режимов обновления:
  1. **Полное обновление** (если передан `included`/`boxes`/`extras`):
     - Удаляет все Meal Boxes и Order Lines
     - Создает новые согласно payload
  2. **Частичное обновление** (если передан только `paidExtras`):
     - Удаляет только старые Paid Order Lines
     - Сохраняет Meal Boxes и Included Order Lines нетронутыми
     - Создает новые Paid Order Lines

#### Изменения в `lib/handlers/hr_orders.js`:
- Добавлена функция `pickPaidExtras()` для выборки платных Order Lines
- Модифицирована функция `pickExtras()` - теперь возвращает только Included Order Lines
- API `mode=single` теперь возвращает `paidExtras` в summary:
  ```json
  {
    "summary": {
      "fullName": "...",
      "mealBox": "...",
      "extra1": "...",
      "extra2": "...",
      "paidExtras": [
        { "name": "Борщ", "qty": 2, "unitPrice": 120, "lineSum": 240 }
      ]
    }
  }
  ```

### 3. Структура данных

#### Frontend → Backend:
```json
{
  "employeeID": "rec...",
  "org": "org001",
  "token": "...",
  "date": "2026-02-10",
  "included": {
    "mainId": "rec...",
    "sideId": "rec...",
    "extras": ["rec...", "rec..."]
  },
  "paidExtras": [
    {
      "itemId": "rec...",
      "qty": 2,
      "unitPrice": 150,
      "chargeToEmployee": true
    }
  ]
}
```

#### Backend → Airtable Order Lines:
| Field | Value (Included) | Value (Paid) |
|-------|------------------|--------------|
| Order | [orderId] | [orderId] |
| Item (Menu Item) | [itemId] | [itemId] |
| Quantity | 1 | qty |
| Line Type | 'Included' | 'Paid' |
| Unit Price | - | unitPrice |
| Line Sum | - | qty × unitPrice |
| Charge To Employee | false | true |

#### Backend → Airtable Orders:
| Field | Value |
|-------|-------|
| Employee Payable Total | sum(пла тных Line Sum) |

## Как тестировать в develop

### 1. Получите preview URL от Vercel

После push на `develop` Vercel автоматически создаст preview deployment:
- Backend: `https://bufetgiph-api-<hash>-baza-812.vercel.app`
- Frontend: `https://bufetgiph-front-<hash>-baza-812.vercel.app`

### 2. Откройте квиз заказа

Перейдите по URL:
```
https://bufetgiph-front-<hash>-baza-812.vercel.app/order/quiz?org=ORG_ID&employeeID=EMP_ID&token=TOKEN&date=2026-02-10
```

### 3. Пройдите квиз до шага 6

1. Шаг 1: Витрина меню → Далее
2. Шаг 2: Выберите салат (или пропустите для Light)
3. Шаг 3: Выберите суп
4. Шаг 4: Выберите основное блюдо
5. Шаг 5: Выберите гарнир (если нужно)
6. Шаг 6: **Подтверждение**

### 4. На шаге 6 проверьте:

#### Без платных блюд:
- ✅ Отображается корпоративный набор
- ✅ Блок "Дополнительные блюда" с пояснением
- ✅ Кнопка "+ Добавить блюда дополнительно"
- ✅ Основная кнопка: "Подтвердить заказ"

#### Нажмите на "+ Добавить блюда дополнительно":
- ✅ Открывается модальное окно
- ✅ Заголовок: "Дополнительные блюда"
- ✅ Подзаголовок с пояснением об оплате
- ✅ Категории блюд (Салаты, Супы, Основные, и т.д.)
- ✅ Для каждого блюда: название, описание, цена, контроллер количества
- ✅ Footer: "Выбрано позиций: X" и "К оплате: XXX ₽"

#### Добавьте несколько блюд:
- ✅ Кнопки +/- работают
- ✅ Сумма пересчитывается
- ✅ Можно добавить несколько разных блюд
- ✅ Можно выбрать qty > 1

#### Нажмите "Готово":
- ✅ Модальное окно закрывается
- ✅ На ConfirmStep появляется summary платных блюд
- ✅ Показаны все выбранные позиции с ценами
- ✅ Показана итоговая сумма "К оплате сотрудником: XXX ₽"
- ✅ Основная кнопка изменилась на: "Оплатить и подтвердить"
- ✅ Кнопка теперь: "Изменить дополнительные блюда"

### 5. Нажмите "Оплатить и подтвердить"

Проверьте в Airtable:

#### В таблице Orders:
- ✅ Создан новый Order
- ✅ Поле **Employee Payable Total** = сумма платных блюд

#### В таблице Order Lines:
- ✅ Созданы строки с `Line Type` = 'Included' (корпоративные extras)
- ✅ Созданы строки с `Line Type` = 'Paid' (платные блюда)
- Для платных строк проверьте:
  - ✅ `Quantity` = выбранное количество
  - ✅ `Unit Price` = вычислено формулой (из Menu.Price)
  - ✅ `Line Sum` = вычислено формулой (Quantity × Unit Price)
  - ✅ `Charge To Employee` = вычислено формулой (true для 'Paid')

### 6. Проверьте граничные случаи

#### Без платных блюд:
- ✅ Заказ создается как обычно
- ✅ `Employee Payable Total` не заполняется или = 0
- ✅ Order Lines только типа 'Included'

#### С платными блюдами без цены:
- ✅ Блюда без цены показывают "Цена не указана"
- ✅ Не учитываются в итоговой сумме

### 6. Тестирование быстрого редактирования платных допов

1. Создайте заказ с платными блюдами (через квиз)
2. Вернитесь на главный экран выбора даты
3. Кликните на дату с заказом
4. В модальном окне проверьте:
   - ✅ Показан основной заказ (Meal Box, Экстра 1, Экстра 2)
   - ✅ Показаны платные допы отдельным блоком с зеленой рамкой
   - ✅ Для каждого: название × количество — сумма
   - ✅ Итоговая "К оплате: XXX ₽"
5. Нажмите зеленую кнопку "Доп блюда"
6. Проверьте:
   - ✅ Открывается модальное окно выбора (не весь квиз!)
   - ✅ Текущие платные допы предзаполнены
7. Измените количество или добавьте новые блюда
8. Нажмите "Готово"
9. Проверьте в Airtable:
   - ✅ Основной заказ **не изменился** (те же Meal Box и Included Order Lines)
   - ✅ Платные Order Lines **обновились** согласно новому выбору
   - ✅ `Employee Payable Total` пересчитан

## Что НЕ реализовано (следующие этапы)

### 1. Интеграция с ЮKassa
- Пока нет реального платежного flow
- Кнопка "Оплатить и подтвердить" создает заказ БЕЗ оплаты
- Нужно добавить:
  - Создание платежа в ЮKassa
  - Редирект на страницу оплаты
  - Обработка callback от ЮKassa
  - Обновление статуса заказа после оплаты

### 2. Привязка гарниров к платным основным блюдам
- Если заказывается несколько платных основных блюд с флагом `garnirnoe`
- Невозможно привязать конкретный гарнир к конкретному основному
- **Решение отложено** - требует изменения структуры Airtable (добавить Meal Box для платных пар)
- Текущее ограничение: платные гарниры выбираются независимо

### 3. Отмена/возврат платных блюд
- Логика отмены заказа с платными позициями
- Возврат средств через ЮKassa

## Следующие шаги

1. **Протестировать текущую версию** в develop environment
2. **Если все работает** → добавить интеграцию с ЮKassa:
   - Создать API endpoint для инициализации платежа
   - Добавить страницу обработки callback
   - Связать Orders с Payment ID
3. **После успешной оплаты** → расширить отображение заказов
4. **Merge в main** после полного тестирования

## История разработки и фиксы

### Проблема #1: Computed fields в Airtable
**Ошибка**: `422 INVALID_VALUE_FOR_COLUMN: "Unit Price" cannot accept a value because the field is computed`

**Решение**: Выяснилось, что следующие поля - **formula fields** в Airtable:
- `Unit Price` - вычисляется из Menu.Price
- `Line Sum` - вычисляется как Quantity × Unit Price
- `Charge To Employee` - вычисляется по Line Type='Paid'
- `Employee Payable Total` - вычисляется из суммы Line Sum платных Order Lines

Backend теперь записывает **только минимум**:
- Order (линк)
- Item (Menu Item) (линк)
- Quantity
- Line Type = 'Paid'

Все остальное рассчитывается автоматически формулами Airtable.

**Коммиты**:
- `493d629` - fix: remove write to computed fields (Unit Price, Line Sum)
- `c018955` - fix: remove Charge To Employee write

### Проблема #2: Платные Order Lines сохранялись в extra1/extra2
**Причина**: Функция `pickExtras()` возвращала **все** Order Lines без фильтрации по типу.

**Решение**:
- `pickExtras()` теперь фильтрует только `Line Type != 'Paid'`
- Новая функция `pickPaidExtras()` возвращает только `Line Type = 'Paid'`
- API возвращает `paidExtras` отдельным массивом

**Коммит**: `41f54e0` - feat: add paid extras to order summary API

### UI улучшения
1. **Прозрачность модального окна**: увеличена с `bg-black/60` → `bg-black/80` → `bg-black/90`
2. **Выделение блока допов**: добавлена зеленая рамка (`border-green-500/30`) и фон
3. **Зеленая кнопка**: кнопка "Добавить блюда дополнительно" теперь `bg-green-600`
4. **Кнопка "Удалить все"**: добавлена в footer PaidExtrasModal

**Коммит**: `3d53908` - fix: improve paid extras UI

### Прямое редактирование платных допов
**Функция**: Возможность добавить/изменить платные блюда из модалки просмотра заказа **без прохождения всего квиза**.

**Реализация**:
- В `OrderClient` добавлен новый компонент `PaidExtrasEditModal`
- Кнопка "Доп блюда" в модалке заказа открывает модальное окно выбора
- После сохранения - API `order_update` вызывается с `orderId` + `paidExtras` (без `included`)
- Backend поддерживает **частичное обновление**: удаляет только старые Paid Order Lines, сохраняя основной заказ

**Коммиты**:
- Backend: `bc24566` - feat: support partial update
- Frontend: `e7e1882` - feat: direct paid extras editing

## Все коммиты (хронологически)

### Backend (`bufetgiph-api`):
1. `b5da738` - Add paid extras support in order handlers
2. `493d629` - fix: remove write to computed fields
3. `c018955` - fix: remove Charge To Employee write
4. `41f54e0` - feat: add paid extras to order summary API
5. `bc24566` - feat: support partial update - edit paid extras without changing main order

### Frontend (`bufetgiph-front`):
1. `bee2148` - Add paid extras feature to order quiz
2. `3d53908` - fix: improve paid extras UI
3. `abf49a4` - feat: display paid extras in order modal
4. `e7e1882` - feat: direct paid extras editing from order modal

## Preview URLs

После деплоя на Vercel:
- Frontend develop: проверьте в Vercel Dashboard
- Backend develop: проверьте в Vercel Dashboard

Используйте preview URL для тестирования перед merge в main!
