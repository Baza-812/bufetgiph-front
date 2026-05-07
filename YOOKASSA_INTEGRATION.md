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

### 3. Сверка «зависших» платежей, если пользователь не вернулся на сайт

Нормальный путь после оплаты: ЮKassa перенаправляет пользователя на `return_url` (страница `/payment/result`), фронт опрашивает `/api/payment/status`, статус в Airtable обновляется. Дополнительно приходит **webhook** `payment.succeeded` — он обновляет `Payments` и `Orders`.

**Проблема:** если пользователь **закрыл вкладку** или нажал «Выйти из оплаты» и **не попал** на `/payment/result`, фронт не выполняет опрос статуса. Обычно всё равно срабатывает **webhook** от ЮKassa, и данные в Airtable становятся корректными. Если уведомление задержалось или временно не доставилось, в Airtable может остаться `pending`, хотя в личном кабинете ЮKassa платёж уже успешен.

**Решение в коде:** периодический вызов backend-эндпоинта **`GET /api/payment_reconcile`**, который для пачки записей `Payments` со статусом `pending` / `waiting_for_capture` запрашивает актуальный статус в API ЮKassa и синхронизирует Airtable (та же логика, что и при ручной проверке статуса).

#### Что такое cron

**Cron** (или «задача по расписанию») — это механизм **автоматического** вызова вашего URL **без участия пользователя**, например каждые 10 минут. Это не часть браузера и не кнопка в интерфейсе: расписание настраивает администратор на хостинге или во внешнем сервисе.

Примеры, где настраивается расписание:

- **Отдельный сервис cron** (cron-job.org, EasyCron, UptimeRobot и т.п.) — указываете URL и периодичность.
- **GitHub Actions** с триггером `schedule:` — в workflow вызываете `curl` к вашему API.
- **Vercel Cron Jobs** — если reconcile крутится **на том же** Vercel-проекте, что и API; секрет нельзя прописать в открытом виде в `vercel.json`, поэтому чаще для вызова **внешнего** API используют внешний cron или `curl` с секретом из хранилища (см. ниже).

#### Пошаговая настройка

1. **Придумайте секрет** — длинная случайная строка (рекомендуется не короче 32 символов). Это общий «пароль» к эндпоинту сверки; его нельзя публиковать и светить пользователям.

2. **Добавьте переменную окружения в проект API (`bufetgiph-api`)**

   - Панель хостинга (например Vercel: проект API → **Settings** → **Environment Variables**).
   - Имя: **`PAYMENT_RECONCILE_KEY`**
   - Значение: ваш секрет.
   - Включите нужные окружения: Production (и при необходимости Preview / Development).
   - Сохраните и выполните **пересборку/деплой** API, чтобы переменная попала в serverless-функции.

3. **Проверьте вызов вручную один раз**

   Подставьте реальный домен вашего API (как в проде: например `https://api.baza.menu`) и значение ключа.

   Через query-параметр:

   ```bash
   curl "https://ВАШ_API_ДОМЕН/api/payment_reconcile?key=ВАШ_СЕКРЕТ"
   ```

   Либо через заголовок (удобно, если не хотите ключа в URL в логах прокси — всё равно используйте HTTPS):

   ```bash
   curl -H "X-Reconcile-Key: ВАШ_СЕКРЕТ" "https://ВАШ_API_ДОМЕН/api/payment_reconcile"
   ```

   Ожидаемый успешный ответ: JSON с `"ok": true`, полем `processed` (сколько платежей обработано) и массивом `results`. Если **`PAYMENT_RECONCILE_KEY` не задан** в env, эндпоинт ответит, что ключ не настроен (ошибка конфигурации). Если ключ неверный — `403 forbidden`.

4. **Настройте расписание (cron)**

   Нужно, чтобы **ваш backend** по расписанию вызывал **именно** URL вида  
   `https://ВАШ_API_ДОМЕН/api/payment_reconcile` с тем же секретом, что в `PAYMENT_RECONCILE_KEY`.

   Практичный вариант: **внешний cron-сервис**, в настройках задачи указать:

   - метод: **GET**;
   - URL: `https://ВАШ_API_ДОМЕН/api/payment_reconcile?key=...` **или** URL без query, но с добавлением заголовка `X-Reconcile-Key` (если сервис это поддерживает);
   - периодичность: каждые **5–15 минут** (чаще обычно не требуется).

   Альтернатива: **GitHub Actions** по расписанию с секретом в **repository secrets** и шагом `curl` — ключ не хранится в коде репозитория.

5. **Фронтенд (`bufetgiph-front`)**

   Для работы reconcile **отдельные переменные на фронте не нужны**: запрос идёт **на API-проект**. Главное, чтобы cron или CI вызывали **прямой URL backend**, а не страницу Next.js.

#### Кратко

| Шаг | Действие |
|-----|----------|
| 1 | Сгенерировать секрет |
| 2 | В проекте API: `PAYMENT_RECONCILE_KEY` = секрет, деплой |
| 3 | Проверить `curl` к `/api/payment_reconcile` |
| 4 | Включить cron (внешний или CI) каждые 5–15 минут |

#### Если ответ `PAYMENT_RECONCILE_KEY not configured`

Это значит, что **на сервере, который обработал запрос, переменная не подставилась** (пустая строка). Это **не** проверка совпадения ключа из URL: при неверном ключе будет **`403` и `forbidden`**.

Проверьте по шагам:

1. **Тот же проект Vercel.** Домен `dev-api.baza.menu` должен быть привязан к **тому же** проекту, куда вы добавили `PAYMENT_RECONCILE_KEY` (например `bufetgiph-api`). Если dev и prod — **два разных** проекта, переменную нужно завести **в каждом**.

2. **Новый деплой после сохранения env.** В Vercel переменные подхватываются при **сборке/деплое**. После добавления или изменения ключа откройте **Deployments** → последний деплой для нужной ветки → **Redeploy** (без кэша, если сомневаетесь). Пока действует старый деплой, функция может работать без новой переменной.

3. **Окружение (Production / Preview / Development).** У переменной в настройках указано, для каких окружений она доступна. Деплой с ветки `develop` обычно считается **Preview**. Если у ключа стоят только **Production** и **Preview**, этого достаточно для хостинга на Vercel. Опция **Development** нужна в основном для **`vercel dev`** локально, а не для `*.vercel.app` / кастомного домена в облаке.

4. **Имя переменной** — в точности `PAYMENT_RECONCILE_KEY` (как в коде). Допустим **запасной ключ** `RECONCILE_SECRET` с тем же значением: если в интерфейсе Vercel что-то мешает первому имени, заведите второе.

5. **Диагностика `/api/health`.** Откройте на том же хосте, что и reconcile, например `https://dev-api.baza.menu/api/health`. В JSON смотрите **`reconcile_key_configured`**: если `false`, секрет в **этом** деплое реально не виден (не совпадение пароля в URL). Сравните с URL вида `https://<project>.vercel.app/api/health`: если на `*.vercel.app` уже `true`, а на кастомном домене `false`, значит **домен смотрит не на тот проект/деплой** (DNS или другой Vercel-проект).

6. **Ответ 503 от `/api/payment_reconcile`** теперь может содержать объект **`deployment`** (`vercel_env`, `vercel_url`, `git_ref`) — по нему видно, **какой именно** деплой Vercel ответил (ветка preview/production).

### 4. Webhook от ЮKassa
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

### 5. Редактирование платных допов из модалки
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

# Секрет для GET /api/payment_reconcile (cron / ручная сверка pending-платежей с ЮKassa)
PAYMENT_RECONCILE_KEY=длинная_случайная_строка
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
- `lib/handlers/payment_reconcile.js` - пакетная сверка pending-платежей с ЮKassa (`GET /api/payment_reconcile`)
- `lib/yookassa_payment_sync.js` - общая синхронизация статуса платежа с ЮKassa и Airtable
- `api/router.js` - роуты `/payment_create`, `/payment_webhook`, `/payment_reconcile`

### Frontend (`bufetgiph-front`)
- `src/app/payment/result/page.tsx` - страница результата оплаты
- `src/app/api/payment/create/route.ts` - proxy для создания платежа
- `src/app/api/payment/status/route.ts` - проверка статуса платежа
- `src/app/order/quiz/QuizClient.tsx` - интеграция оплаты в квиз
- `src/app/order/OrderClient.tsx` - интеграция оплаты при редактировании допов

## Логика работы с Order.Status

### Статусы заказа (single select в Airtable, типичный набор):
- **New** — заказ создан; для обычных корпоративных сценариев часто означает «принят к обработке» без онлайн-оплаты основного набора.
- **AwaitingPayment** — заказ создан, но **онлайн-оплата основного обеда ещё не завершена** (используется для **TeamMember** в организациях с **ContractType = Ambassador** до успешного платежа). После `payment.succeeded` (webhook или сверка) статус переводится в **Confirmed**, как и для других оплачиваемых заказов.
- **Confirmed**, **In Kitchen**, **Ready**, **Delivered**, **Cancelled** — этапы жизненного цикла и отмена (как в вашей настройке Airtable).

### Когда Order.Status меняется на 'Confirmed':
- Автоматически webhook от ЮKassa при `payment.succeeded` (и при успешной сверке через `/api/payment_reconcile`), если к заказу привязан соответствующий платёж.

### Заказы без платных допов и без онлайн-оплаты основного обеда:
- Могут создаваться без записи в **Payments**; смена статуса тогда по внутренним правилам (HR/Manager), не через ЮKassa.

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
