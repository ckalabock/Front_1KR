# Front_1KR - Практики 19-24


Проект теперь объединяет:

- `PostgreSQL` CRUD для пользователей
- `MongoDB` CRUD для пользователей
- `Redis`-кэширование маршрутов из RBAC-приложения
- `JWT`-аутентификацию и разграничение ролей
- балансировку нагрузки через `Nginx`
- альтернативный пример балансировки через `HAProxy`
- контейнеризацию через `Dockerfile` и `docker-compose.yml`
- отдельный отчётный файл [PRACTICE_13_18_REPORT.md](PRACTICE_13_18_REPORT.md)

## Что реализовано по практикам

### Практика 19. PostgreSQL

- серверный CRUD для пользователей на маршрутах:
  - `POST /api/postgres/users`
  - `GET /api/postgres/users`
  - `GET /api/postgres/users/:id`
  - `PATCH /api/postgres/users/:id`
  - `DELETE /api/postgres/users/:id`
- сущность пользователя содержит поля:
  - `id`
  - `first_name`
  - `last_name`
  - `age`
  - `created_at`
  - `updated_at`
- для работы используется `Sequelize`

### Практика 20. MongoDB

- серверный CRUD для пользователей на маршрутах:
  - `POST /api/mongo/users`
  - `GET /api/mongo/users`
  - `GET /api/mongo/users/:id`
  - `PATCH /api/mongo/users/:id`
  - `DELETE /api/mongo/users/:id`
- сущность пользователя содержит те же поля, что и в практике 19
- для работы используется `Mongoose`

### Практика 21. Redis

- реализован backend с `JWT` и ролями `admin`, `manager`, `user`
- добавлены маршруты:
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `POST /api/auth/refresh`
  - `POST /api/auth/logout`
  - `GET /api/me`
- реализовано кэширование через `Redis`:
  - `GET /api/users` - `1 минута`
  - `GET /api/users/:id` - `1 минута`
  - `GET /api/products` - `10 минут`
  - `GET /api/products/:id` - `10 минут`
- при изменении пользователей и товаров кэш очищается
- ответы кэшируемых маршрутов содержат поле `source` со значением `server` или `cache`

### Практика 22. Балансировка нагрузки

- backend отвечает на `GET /` JSON-объектом с `server`
- подготовлены локальные конфиги:
  - `infra/nginx/nginx.local.conf`
  - `infra/haproxy/haproxy.local.cfg`
- добавлены скрипты для запуска нескольких backend-инстансов:
  - `npm run dev:backend1`
  - `npm run dev:backend2`
  - `npm run dev:backend3`

### Практика 23. Docker

- добавлен `backend/Dockerfile`
- добавлен `docker-compose.yml`
- в compose-стек включены:
  - `postgres`
  - `mongo`
  - `redis`
  - `backend1`
  - `backend2`
  - `backend3`
  - `nginx`
- подготовлены docker-конфиги:
  - `infra/nginx/nginx.conf`
  - `infra/haproxy/haproxy.docker.cfg`

### Практика 24. Подготовка к контрольной

- проект структурирован под демонстрацию всех практик `19-23`
- подготовлен `README.md`
- подготовлен подробный отчёт `PRACTICE_13_18_REPORT.md`

## Структура проекта

```text
backend/
  app.js
  Dockerfile
  scripts/start-instance.js
frontend/
  index.html
  app.js
  styles.css
infra/
  nginx/
    nginx.conf
    nginx.local.conf
  haproxy/
    haproxy.docker.cfg
    haproxy.local.cfg
docker-compose.yml
PRACTICE_13_18_REPORT.md
README.md
```

## Установка зависимостей

```bash
npm install
```

## Локальный запуск одного backend

```bash
npm run dev
```

После запуска доступны:

- `http://localhost:3000/` - корневой маршрут для проверки `serverId`
- `http://localhost:3000/app` - упрощённый интерфейс проекта

## Локальный запуск нескольких backend для практики 22

Откройте три терминала и выполните:

```bash
npm run dev:backend1
npm run dev:backend2
npm run dev:backend3
```

В результате поднимутся три экземпляра:

- `http://localhost:3001`
- `http://localhost:3002`
- `http://localhost:3003`

Далее можно использовать:

- `infra/nginx/nginx.local.conf` для `Nginx`
- `infra/haproxy/haproxy.local.cfg` для `HAProxy`

## Запуск полного стека через Docker Compose

```bash
docker compose up --build
```

После запуска:

- `http://localhost/` - балансировщик `Nginx`
- `http://localhost/app` - интерфейс проекта через балансировщик
- `http://localhost:3001/` - `backend1`
- `http://localhost:3002/` - `backend2`
- `http://localhost:3003/` - `backend3`

## Тестовые учётные записи

- `admin / admin123`
- `manager / manager123`
- `user / user123`

## Как проверить практики

### Практики 19-20

1. Откройте `http://localhost:3000/app` или `http://localhost/app`.
2. В блоках `PostgreSQL` и `MongoDB` создайте несколько пользователей.
3. Проверьте обновление и удаление записей.
4. Убедитесь, что данные сохраняются через соответствующие API-маршруты.

### Практика 21

1. Войдите под `admin`.
2. Нажмите `Получить пользователей`.
3. Нажмите `Получить товары`.
4. Нажмите `Повторить товары для кэша`.
5. Убедитесь, что в ответе поле `source` меняется с `server` на `cache`.
6. Добавьте товар и повторно запросите список, чтобы увидеть инвалидацию кэша.

### Практики 22-23

1. Выполните несколько запросов:

```bash
curl http://localhost/
curl http://localhost/
curl http://localhost/
```

2. Убедитесь, что поле `server` меняется между backend-инстансами.
3. Остановите один backend и повторите проверку.
4. Убедитесь, что `Nginx` продолжает направлять трафик на рабочие экземпляры.

## Ограничения

- если `PostgreSQL`, `MongoDB` или `Redis` не запущены, соответствующие разделы возвращают `503`
- данные RBAC-приложения хранятся в памяти backend и сбрасываются после его перезапуска
- для полной демонстрации практик `22-23` нужен установленный `Nginx` локально или запуск через `Docker Compose`

## Что сдавать

Для сдачи контрольной работы `№4` достаточно приложить ссылку на открытый репозиторий с этим проектом и, при необходимости, показать:

- CRUD в `PostgreSQL`
- CRUD в `MongoDB`
- кэширование через `Redis`
- смену `source: server/cache`
- ответы разных backend-инстансов через балансировщик
- запуск полного стека через `Docker Compose`
