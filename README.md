# Front_1KR - Практики 2-6 (Frontend + Backend)

Репозиторий реализует последовательность практических работ №2-№6 в одном проекте:
- backend: Express API (CRUD), CORS, Swagger
- frontend: React клиент интернет-магазина
- docs: коллекции Postman и шаблон отчета для практики 3

## Связь практик между собой

Практики **иерархически связаны** и выполнены как единый проект:
1. Практика 2: базовый CRUD API
2. Практика 3: тестирование API и внешние API через Postman
3. Практика 4: интеграция API + React (интернет-магазин)
4. Практика 5: документация API через Swagger (OpenAPI)
5. Практика 6: финальная проверка и оформление README

## Что реализовано

### Практика 2 (Node.js + Express)
- CRUD API для товаров: `GET/POST/PATCH/DELETE /api/products`
- Поля товара: `id`, `name`, `category`, `description`, `price`, `stock`, опционально `rating`, `imageUrl`
- Валидация входных данных

### Практика 3 (JSON + внешние API + Postman)
- Подготовлены коллекции Postman:
  - `docs/postman/practice3-local-api.postman_collection.json`
  - `docs/postman/practice3-external-api.postman_collection.json`
- Добавлен шаблон отчета:
  - `docs/PRACTICE_3_REPORT.md`
- Часть со скриншотами выполняется вручную в GUI Postman (инструкция есть)

### Практика 4 (API + React)
- React-клиент, связанный с backend через `axios`
- CRUD-операции с товарами через интерфейс
- Каталог из 10+ товаров на старте
- Поиск по товарам
- CORS-настройка на сервере для фронтенда

### Практика 5 (Swagger)
- Подключены `swagger-jsdoc` + `swagger-ui-express`
- Документация доступна на `http://localhost:3000/api-docs`
- Описаны схемы и CRUD-эндпоинты

### Практика 6 (подготовка к КР)
- Проверка запуска backend/frontend
- Подготовлен полноценный README
- Добавлены материалы, необходимые для сдачи

## Структура проекта

```txt
Front_1KR/
  backend/
    app.js
    package.json
  frontend/
    src/
      App.jsx
      App.css
      api.js
    package.json
  docs/
    PRACTICE_3_REPORT.md
    postman/
      practice3-local-api.postman_collection.json
      practice3-external-api.postman_collection.json
      screenshots/
```

## Быстрый старт

### 1) Backend

```bash
cd backend
npm install
npm run start
```

Backend URL: `http://localhost:3000`
Swagger URL: `http://localhost:3000/api-docs`

### 2) Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend URL: `http://localhost:3001`

## API (основные маршруты)

### Products
- `GET /api/products` - список товаров
- `GET /api/products/:id` - товар по id
- `POST /api/products` - создать товар
- `PATCH /api/products/:id` - обновить товар
- `DELETE /api/products/:id` - удалить товар

### Users (дополнительно, из учебного примера практик)
- `GET /api/users`
- `GET /api/users/:id`
- `POST /api/users`
- `PATCH /api/users/:id`
- `DELETE /api/users/:id`

## Мини-теория для защиты

### Основные термины
- **Node.js**: среда выполнения JavaScript на сервере.
- **Express.js**: фреймворк для серверных HTTP-приложений на Node.js.
- **REST API**: стиль API, где ресурсы доступны по URL и HTTP-методам.
- **CRUD**: Create, Read, Update, Delete.
- **JSON**: формат обмена данными `ключ: значение`.
- **Middleware**: промежуточная функция обработки запроса/ответа в Express.
- **CORS**: политика браузера для междоменных запросов, на сервере задаются разрешенные origins/методы/заголовки.
- **Swagger/OpenAPI**: стандарт и инструменты документирования REST API.
- **JSDoc-аннотации**: комментарии в коде, из которых генерируется OpenAPI спецификация.
- **HTTP-коды**:
  - `200` OK
  - `201` Created
  - `204` No Content
  - `400` Bad Request
  - `404` Not Found
  - `500` Internal Server Error

### Логика клиент-серверного взаимодействия
1. Frontend отправляет HTTP-запрос на backend.
2. Backend валидирует данные.
3. Выполняется CRUD-операция.
4. Backend возвращает JSON и статус-код.
5. Frontend обновляет состояние интерфейса.

### Почему нужен Swagger
- Быстро проверить API в браузере через `Try it out`.
- Документация актуальна, так как близка к коду.
- Упрощает работу тестировщикам и другим разработчикам.

## Что нужно сделать вручную перед сдачей

1. Выполнить Postman-запросы и добавить скриншоты в `docs/postman/screenshots`.
2. Загрузить репозиторий на GitHub и убедиться, что он публичный.
3. Вставить ссылку на репозиторий в СДО согласно требованиям практики.
