# Интеграция с ЮKassa

## Архитектура

### Обзор
Система поддерживает прием платежей от сотрудников разных организаций через **разные аккаунты ЮKassa**. Каждая организация в Airtable связана с записью в таблице **Banks**, которая содержит реквизиты ЮKassa и юридическую информацию для отображения на странице оплаты.

### Структура данных в Airtable

#### Таблица Banks
Содержит реквизиты для приема платежей:
- **MerchantID** - Shop ID от ЮKassa
- **APIKey** - Secret Key от ЮKassa
- **ENVPrefix** - префикс для переменных окружения (например, "YOOKASSA")
- **CredentialsSource** - где хранятся ключи:
  - `"ENV"` - читать из переменных окружения (`{ENVPrefix}_SHOP_ID`, `{ENVPrefix}_SECRET_KEY`)
  - `"Airtable"` - читать из полей MerchantID и APIKey
- **AcquiringProvider** - провайдер эквайринга (должен быть "YOOKASSA")
- **IsActive** - активен ли банк для приема платежей

**Реквизиты для отображения** (требование 54-ФЗ):
- **LegalName** - полное юридическое название организации
- **INN** - ИНН
- **KPP** - КПП
- **BIC** - БИК банка
- **Account** - расчетный счет
- **FooterText** - дополнительный текст для footer (адрес, контакты)
- **ContactPhone** - контактный телефон

#### Таблица Organizations
- **Bank** (Link) - связь с таблицей Banks

#### Таблица Orders
- **Payment** (Link) - связь с таблицей Payments

#### Таблица Payments
Хранит информацию о транзакциях:
- **ExternalID** - ID платежа от ЮKassa (payment.id)
- **Provider** (Link) - связь с Banks
- **Orders** (Link) - связь с Orders
- **Employee** (Link) - кто оплачивал
- **Organization** (Link) - организация
- **Amount** (Currency) - сумма платежа
- **Currency** - валюта (RUB)
- **Status** - статус:
  - `"pending"` - ожидает оплаты
  - `"waiting_for_capture"` - ожидает подтверждения
  - `"succeeded"` - успешно оплачен
  - `"canceled"` - отменен
- **PaymentLink** - URL для оплаты (confirmation_url от ЮKassa)
- **PaymentMethod** - способ оплаты (bank_card, yoo_money, и т.д.)
- **PaidAt** (Date) - дата фактической оплаты
- **Notes** - примечания

## Payment Flow

### 1. Создание заказа с платными допами
```
Сотрудник проходит квиз → ConfirmStep → нажимает "Оплатить и подтвердить"
   ↓
Frontend: QuizClient.submitOrder()
   ↓
1. Создает/обновляет Order через /api/order или /api/order_update
   - Сохраняет Meal Boxes и Order Lines (включая Paid Order Lines)
   - Получает orderId
   ↓
2. Вызывает /api/payment/create:
   - orderId
   - amount (сумма платных допов)
   - employeeID, org, token
   ↓
Backend: payment_create.js
   ↓
3. Получает Organization → Bank
4. Получает Bank credentials (из ENV или Airtable)
5. Создает запись в Payments (Status='pending')
6. Вызывает ЮKassa API: POST https://api.yookassa.ru/v3/payments
   - amount: { value: "150.00", currency: "RUB" }
   - capture: true (деньги списываются сразу)
   - confirmation: { type: "redirect", return_url: "https://orders.baza.menu/payment/result?..." }
   - description: "Дополнительные блюда к заказу"
   - metadata: { orderId, employeeID, org, paymentRecordId }
7. Получает от ЮKassa:
   - payment.id (ExternalID)
   - confirmation_url (PaymentLink)
   - status (обычно 'pending')
8. Обновляет Payment record с ExternalID и PaymentLink
9. Линкует Order → Payment
10. Возвращает Frontend: { paymentUrl: confirmation_url }
   ↓
Frontend: window.location.href = paymentUrl
   ↓
Сотрудник на странице ЮKassa оплачивает
   ↓
ЮKassa редиректит на return_url: https://orders.baza.menu/payment/result?paymentId=...&orderId=...
```

### 2. Страница результата оплаты
```
/payment/result?paymentId={paymentRecordId}&orderId={orderId}
   ↓
Frontend: PaymentResultPage
   ↓
1. Показывает loader "Проверяем статус платежа..."
2. Polling (каждые 3 секунды, макс 20 раз):
   - Вызывает /api/payment/status?paymentId=...
   - Frontend API читает Payment из Airtable
   - Получает статус и сумму
   - Получает Bank info (реквизиты) через Provider линк
3. Отображает:
   - ✅ "Оплата успешна!" (status='succeeded')
   - ⏳ "Ожидание оплаты" (status='pending')
   - ❌ "Оплата отменена" (status='canceled')
   - Сумма платежа
   - Footer с реквизитами получателя (LegalName, ИНН, КПП, FooterText)
4. Кнопка "Вернуться на главную"
```

### 3. Webhook от ЮKassa
```
ЮKassa отправляет уведомление при смене статуса:
POST https://api.baza.menu/api/payment_webhook
{
  "type": "notification",
  "event": "payment.succeeded",
  "object": {
    "id": "...",
    "status": "succeeded",
    "paid": true,
    "amount": { "value": "150.00", "currency": "RUB" },
    "captured_at": "2026-02-10T12:34:56.789Z",
    ...
  }
}
   ↓
Backend: payment_webhook.js
   ↓
1. Находит Payment record по ExternalID (payment.id)
2. Обновляет Payment.Status и Payment.PaidAt
3. Если status='succeeded':
   - Обновляет Orders.Status = 'Confirmed'
4. Возвращает { ok: true } (всегда 200, чтобы ЮKassa не ретраил)
```

### 4. Редактирование платных допов из модалки
```
Сотрудник на главной странице → клик на дату с заказом → "Доп блюда"
   ↓
Открывается PaidExtrasModal (без прохождения всего квиза)
   ↓
Сотрудник изменяет количество → "Готово"
   ↓
Frontend: PaidExtrasEditModal.handleSave()
   ↓
1. Вызывает /api/order_update с только paidExtras (основной заказ не трогается)
2. Если totalAmount > 0:
   - Вызывает /api/payment/create
   - Редиректит на ЮKassa
3. Если totalAmount = 0 (все удалены):
   - Просто закрывает модалку
```

## Переменные окружения

### Backend (`bufetgiph-api`)

Если в Banks.CredentialsSource = "ENV", то ключи берутся из переменных:
```env
# Для Banks с ENVPrefix = "YOOKASSA"
YOOKASSA_SHOP_ID=123456
YOOKASSA_SECRET_KEY=live_abcd...

# Для других Banks (например, ENVPrefix = "YOOKASSA_TEST")
YOOKASSA_TEST_SHOP_ID=654321
YOOKASSA_TEST_SECRET_KEY=test_xyz...

# URL для возврата после оплаты
PAYMENT_RETURN_URL=https://orders.baza.menu/payment/result
```

### Frontend (`bufetgiph-front`)

Для доступа к Airtable (в API routes):
```env
AIRTABLE_BASE_ID=app...
AIRTABLE_API_KEY=key...

TBL_PAYMENTS=Payments
TBL_BANKS=Banks
```

## Настройка webhook в ЮKassa

В личном кабинете ЮKassa:
1. Перейти в раздел "Настройки" → "Уведомления"
2. Добавить URL webhook:
   ```
   https://api.baza.menu/api/payment_webhook
   ```
3. Выбрать события:
   - `payment.succeeded` - успешная оплата
   - `payment.canceled` - отмена платежа
4. Сохранить настройки

**Важно**: Webhook должен быть настроен **для каждого** аккаунта ЮKassa (для каждого Banks record).

## Тестирование

### 1. Тестовый режим ЮKassa

Для тестирования используйте тестовые данные:
- **Тестовая карта**: `5555 5555 5555 4444`
- **CVC**: любой (например, 123)
- **Срок действия**: любая будущая дата
- **3D-Secure код**: `12345` или `password`

Документация: https://yookassa.ru/developers/payment-acceptance/testing-and-going-live/testing

### 2. Создание тестовой записи в Banks

В Airtable создайте тестовую запись Banks:
- **MerchantID**: ID тестового магазина от ЮKassa
- **APIKey**: тестовый Secret Key
- **AcquiringProvider**: "YOOKASSA"
- **IsActive**: true
- **CredentialsSource**: "Airtable" (или "ENV")
- Заполните реквизиты (ИНН, КПП, LegalName и т.д.)

Привяжите к тестовой Organizations.

### 3. Тестовый сценарий

1. Зайдите в квиз заказа для тестовой организации
2. Пройдите до шага 6
3. Добавьте платные дополнительные блюда
4. Нажмите "Оплатить и подтвердить"
5. Проверьте:
   - Редирект на страницу ЮKassa
   - Оплата тестовой картой проходит
   - Редирект на `/payment/result`
   - Статус меняется на "Оплата успешна!"
   - В Airtable:
     - **Payments.Status** = 'succeeded'
     - **Payments.ExternalID** = ID от ЮKassa
     - **Orders.Payment** - линк на Payments
     - **Orders.Status** = 'Confirmed' (если webhook сработал)

## Безопасность

### 1. Хранение ключей

**Рекомендуется**: CredentialsSource = "ENV"
- Ключи хранятся в переменных окружения Vercel
- Не видны в Airtable
- Безопаснее для production

**Альтернатива**: CredentialsSource = "Airtable"
- Удобно для тестирования
- Нужно ограничить доступ к таблице Banks в Airtable
- Не рекомендуется для production с реальными ключами

### 2. Проверка webhook

Backend `payment_webhook.js` **не проверяет подпись** от ЮKassa. Для production рекомендуется добавить проверку:
- ЮKassa отправляет заголовок `X-YooKassa-Signature`
- Нужно проверить HMAC-SHA256 подпись с использованием Secret Key

Документация: https://yookassa.ru/developers/using-api/webhooks#notification-authentication

## Файлы

### Backend (`bufetgiph-api`)
- `lib/utils.js` - константы для Banks и Payments
- `lib/handlers/payment_create.js` - создание платежа
- `lib/handlers/payment_webhook.js` - обработка webhook от ЮKassa
- `api/router.js` - роуты `/payment_create` и `/payment_webhook`

### Frontend (`bufetgiph-front`)
- `src/app/payment/result/page.tsx` - страница результата оплаты
- `src/app/api/payment/create/route.ts` - proxy для создания платежа
- `src/app/api/payment/status/route.ts` - проверка статуса платежа
- `src/app/order/quiz/QuizClient.tsx` - интеграция оплаты в квиз
- `src/app/order/OrderClient.tsx` - интеграция оплаты при редактировании допов

## Логика работы с Order.Status

### Статусы заказа:
1. **Создан** - заказ создан, но не оплачен (если есть платные допы)
2. **Confirmed** - заказ подтвержден и оплачен (если были платные допы)
3. **Canceled** - заказ отменен

### Когда Order.Status меняется на 'Confirmed':
- Автоматически webhook от ЮKassa при `payment.succeeded`
- Только если платеж был успешно проведен

### Заказы без платных допов:
- Создаются сразу без Payment record
- Status не меняется автоматически (управляется HR/Manager)

## Следующие шаги

### Обязательные:
1. Настроить webhook URL в личном кабинете каждого ЮKassa аккаунта
2. Добавить переменную `PAYMENT_RETURN_URL` в Vercel для production:
   - develop: `https://dev-orders.baza.menu/payment/result`
   - main: `https://orders.baza.menu/payment/result`
3. Протестировать в develop с тестовыми ключами ЮKassa

### Опциональные (для production):
1. Добавить проверку подписи webhook (X-YooKassa-Signature)
2. Добавить логирование платежей в отдельную таблицу
3. Добавить обработку частичных возвратов
4. Добавить email/SMS уведомления об успешной оплате
5. Добавить страницу истории платежей в Manager Console

## Требования 54-ФЗ

На странице оплаты (`/payment/result`) в footer отображаются реквизиты организации-получателя платежа:
- Полное юридическое название
- ИНН
- КПП
- Дополнительная информация из FooterText (адрес, контакты)

Эти данные берутся из таблицы Banks через связь:
```
Order → Payment → Provider (Banks) → реквизиты
```

## Ссылки

- [Документация ЮKassa API](https://yookassa.ru/developers)
- [Быстрый старт](https://yookassa.ru/developers/payment-acceptance/getting-started/quick-start)
- [Webhook уведомления](https://yookassa.ru/developers/using-api/webhooks)
- [Тестирование](https://yookassa.ru/developers/payment-acceptance/testing-and-going-live/testing)
