# Front_1KR - Практики 7-12

Проект объединяет практические занятия `№7-№12` по дисциплине "Фронтенд и бэкенд разработка" в одном приложении:

- `backend` - Express API с авторизацией, JWT, refresh cookie, RBAC и Swagger
- `frontend` - React-интерфейс для входа, проверки сессий, ролей и работы с каталогом товаров
- `docs` - ранее подготовленные материалы по прошлым практикам

## Что реализовано

### Практика 7. Базовая аутентификация

- регистрация пользователя: `POST /api/auth/register`
- вход: `POST /api/auth/login`
- пароль хранится только в виде `bcrypt hash`
- сущность пользователя приведена к требованиям практики:
  - `id`
  - `email`
  - `first_name`
  - `last_name`
  - `password` -> хранится как `passwordHash`

### Практика 8. JWT и защищенные маршруты

- при логине сервер выдает `access token`
- реализован маршрут `GET /api/auth/me`
- защищен маршрут `GET /api/products/:id`
- также защищены операции изменения товаров

### Практика 9. Cookie и кэширование

- `refresh token` хранится в `HttpOnly cookie`
- cookie настраивается с `SameSite=lax`
- в production предусмотрен `secure`
- `access token` хранится только в памяти клиента, не в `localStorage`

### Практика 10. Refresh token и сессии

- реализован маршрут `POST /api/auth/refresh`
- refresh token ротируется при обновлении
- есть список пользовательских сессий: `GET /api/auth/sessions`
- есть завершение текущей сессии: `POST /api/auth/logout`
- есть завершение всех сессий: `POST /api/auth/logout-all`

### Практика 11. RBAC и blacklist

- роли: `user`, `moderator`, `admin`
- права:
  - `user` может входить и читать свои защищенные данные
  - `moderator` может создавать и редактировать товары
  - `admin` может делать все, включая удаление товаров и просмотр admin-статистики
- реализован blacklist для access token: `POST /api/auth/blacklist`
- при logout access token помечается отозванным
- отозванные/скомпрометированные сессии блокируются

### Практика 12. Подготовка к защите

- единый интерфейс для демонстрации всех сценариев
- Swagger доступен по адресу `http://localhost:3000/api-docs`
- README описывает запуск, проверку, ограничения и ручные действия перед сдачей

## Демо-аккаунты

Используй эти аккаунты для показа ролей преподавателю:

- `admin@1kr.local / Admin123!`
- `moderator@1kr.local / Moderator123!`
- `user@1kr.local / User12345!`

## API

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `GET /api/auth/me`
- `GET /api/auth/sessions`
- `POST /api/auth/logout`
- `POST /api/auth/logout-all`
- `POST /api/auth/blacklist` - только `admin`

### Products

- `GET /api/products` - публичный каталог
- `GET /api/products/:id` - только после авторизации
- `POST /api/products` - `admin`, `moderator`
- `PUT /api/products/:id` - `admin`, `moderator`
- `PATCH /api/products/:id` - `admin`, `moderator`
- `DELETE /api/products/:id` - только `admin`

### Role-based маршруты

- `GET /api/admin/overview` - только `admin`
- `GET /api/moderation/overview` - `admin`, `moderator`

## Интерфейс frontend

Во frontend реализовано:

- форма входа/регистрации
- отображение текущего пользователя и роли
- просмотр access token, который хранится только в памяти
- просмотр списка сессий
- logout текущей сессии и logout всех сессий
- admin-панель blacklist
- каталог товаров
- создание/редактирование/удаление товаров по ролям
- проверка защищенного `GET /api/products/:id`

## Как запустить

### Установка

```bash
npm install
```

### Запуск всего проекта

```bash
npm run dev
```

После запуска:

- backend: `http://localhost:3000`
- Swagger: `http://localhost:3000/api-docs`
- frontend: `http://localhost:3001`

### Отдельный запуск backend

```bash
cd backend
npm run start
```

### Отдельный запуск frontend

```bash
cd frontend
npm run dev
```

## Что было проверено

Локально проверены следующие сценарии:

- логин под `admin`
- получение `GET /api/auth/me`
- получение `GET /api/auth/sessions`
- публичный `GET /api/products`
- защищенный `GET /api/products/:id`
- создание товара под `admin`
- обновление access token через `POST /api/auth/refresh`
- удаление товара под `admin`
- запрет на создание товара под `user` (`403`)
- запрет на `GET /api/admin/overview` под `moderator` (`403`)
- сборка frontend: `npm run build`
- линт frontend: `npm run lint`
- синтаксическая проверка backend: `node --check app.js`

## Что нужно сделать вручную перед сдачей

Это уже с моей стороны не автоматизируется, поэтому сделай сам:

1. Сделай скриншоты для отчета/защиты:
   - frontend после входа под `admin`
   - список сессий
   - Swagger `/api-docs`
   - пример `403` для пользователя без прав
   - пример успешного refresh/logout
2. Если преподаватель просит Postman, повтори в Postman сценарии:
   - `login`
   - `me`
   - `refresh`
   - `sessions`
   - `blacklist`
3. Загрузи проект в GitHub и вставь ссылку в СДО.

## Известные ограничения и проблемы

- все данные хранятся в памяти сервера:
  - после перезапуска backend пропадут зарегистрированные пользователи
  - сбросятся сессии
  - очистится blacklist
  - вернется исходный список товаров
- `HttpOnly cookie` в dev работает без `secure`, потому что проект запускается по `http://localhost`
- для production нужно вынести JWT secrets в `.env` и включить HTTPS
- файлы `№9-№12` из методички содержали только тему занятия и ссылку на рабочую тетрадь в СДО, поэтому реализация выполнена как логичное полное продолжение практик `№7-№8`:
  - cookie
  - refresh token
  - сессии
  - RBAC
  - blacklist

## Что показать преподавателю

Быстрый сценарий демонстрации:

1. Открой frontend и Swagger.
2. Войди под `user` и покажи, что создание товара запрещено.
3. Войди под `moderator` и покажи создание/редактирование товара.
4. Войди под `admin` и покажи:
   - список сессий
   - admin overview
   - blacklist токена
   - удаление товара
5. Обнови страницу и покажи, что сессия восстанавливается через refresh cookie.
