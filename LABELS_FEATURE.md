# Система маркировки наклеек

## Что было реализовано

### 1. Backend API (`bufetgiph-api`)
- **Файл**: `lib/handlers/labels.js`
- **Endpoint**: `GET /api/labels?org=<OrgID>&date=<YYYY-MM-DD>`
- **Функция**: Получает все заказы организации на указанную дату и разворачивает каждое блюдо в отдельную строку
- **Формат ответа**:
  ```json
  {
    "ok": true,
    "orgName": "Название организации",
    "dateLabel": "2026-02-06",
    "rows": [
      {
        "fullName": "Иванов Иван Иванович",
        "orderDate": "2026-02-06",
        "dishName": "Котлета + Картофель",
        "dishDescription": "Состав основного | Состав гарнира"
      }
    ]
  }
  ```

### 2. Frontend API (`bufetgiph-front`)
- **Файл**: `src/app/api/labels/export/route.ts`
- **Endpoint**: `GET /api/labels/export?org=<OrgID>&date=<YYYY-MM-DD>`
- **Функция**: Вызывает backend API, генерирует XLSX файл и отдает его для скачивания
- **Имя файла**: `Маркировка_НазваниеОрганизации_YYYY-MM-DD.xlsx`

### 3. XLSX генератор
- **Файл**: `src/lib/xlsx.ts`
- **Функция**: `renderLabelsXLSX()`
- **Структура XLSX**:
  - Колонки: `FullName`, `Order Date`, `Наименование блюда`, `Состав блюда`
  - Каждое блюдо (Meal Box, Extra1, Extra2) в отдельной строке
  - Для Meal Box название объединяется: "Основное + Гарнир"
  - Автофильтр, границы ячеек, адаптивная ширина колонок

### 4. Manager Console
- **Страница**: `/manager/labels`
- **Компоненты**:
  - `src/app/manager/labels/page.tsx` - форма для ручной выгрузки
  - `src/components/ManagerNav.tsx` - навигация между разделами Manager Console
- **Функционал**:
  - Выбор организации из списка
  - Выбор даты
  - Кнопка "Скачать маркировку"
  - Placeholder для автоматической выгрузки (в разработке)

### 5. Навигация
- Добавлена навигационная панель в Manager Console
- Две вкладки: "Заказы" и "Маркировка"
- Сохранение параметров `org`, `employeeID`, `token` при переходах

## Как протестировать

### Локально (develop ветка)

1. **Backend**:
   ```bash
   cd bufetgiph-api
   vercel dev
   # или используйте существующий деплой на develop
   ```

2. **Frontend**:
   ```bash
   cd bufetgiph-front
   npm run dev
   ```

3. **Доступ к Manager Console**:
   - Перейдите на: `http://localhost:3000/manager?org=<ORG_ID>&employeeID=<EMP_ID>&token=<TOKEN>`
   - Кликните на вкладку "Маркировка"
   - Выберите организацию и дату
   - Нажмите "Скачать маркировку"

### На production (после деплоя)

1. Зайдите на: `https://вашдомен.com/manager/labels?org=<ORG_ID>&employeeID=<EMP_ID>&token=<TOKEN>`
2. Выберите организацию и дату
3. Скачайте XLSX файл

## Как задеплоить

### Backend (bufetgiph-api)

```bash
cd bufetgiph-api
git add .
git commit -m "Add labels export API endpoint"
git push origin develop
# После тестирования:
git checkout main
git merge develop
git push origin main
```

Vercel автоматически задеплоит изменения.

### Frontend (bufetgiph-front)

```bash
cd bufetgiph-front
git add .
git commit -m "Add labels management page to Manager Console"
git push origin develop
# После тестирования:
git checkout main
git merge develop
git push origin main
```

Vercel автоматически задеплоит изменения.

## Автоматическая выгрузка (TODO)

Для реализации автоматической выгрузки по расписанию:

### Вариант 1: Vercel Cron Jobs

1. Создать endpoint `POST /api/labels/schedule`
2. Добавить в `vercel.json`:
   ```json
   {
     "crons": [{
       "path": "/api/labels/schedule",
       "schedule": "0 18 * * *"
     }]
   }
   ```

### Вариант 2: Внешний планировщик

1. Использовать существующий Google Apps Script
2. Модифицировать скрипт для вызова нового API endpoint
3. Отправка файлов по email через Apps Script

### Вариант 3: Airtable Automations

1. Создать Automation в Airtable
2. Trigger: время (например, 18:00 каждый день)
3. Action: webhook на `/api/labels/export`
4. Обработка и отправка файлов

## Структура файлов

```
bufetgiph-api/
  api/router.js                  # Добавлен маршрут 'labels'
  lib/handlers/labels.js         # Новый handler для выгрузки данных

bufetgiph-front/
  src/
    app/
      api/labels/export/route.ts  # API endpoint для генерации XLSX
      manager/
        labels/page.tsx            # Страница маркировки
        ManagerDatesClient.tsx     # Добавлена навигация
    components/
      ManagerNav.tsx               # Новый компонент навигации
    lib/
      xlsx.ts                      # Добавлена функция renderLabelsXLSX()
```

## Примечания

- XLSX файл совместим с NiceLabel
- Каждое блюдо в отдельной строке (не сгруппировано по сотрудникам)
- Для Meal Box название и описание комбинируются: "Main + Side"
- Формат имени файла: `Маркировка_НазваниеОрганизации_YYYY-MM-DD.xlsx`
- UTF-8 кодировка для корректного отображения кириллицы
