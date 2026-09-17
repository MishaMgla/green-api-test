# green-api-test

Чат MAX на React через GREEN-API.

## Локальный запуск

Нужны Node.js 22.12+ (ветка 22) или 24+, npm и авторизованный инстанс GREEN-API для MAX.

В каталоге проекта выполните:

```sh
npm ci
npm run dev
```

Откройте адрес из терминала — обычно http://localhost:5173.
Введите `idInstance` и `apiTokenInstance` из личного кабинета GREEN-API.
API URL фиксирован: `https://3100.api.green-api.com`. Файл `.env` не нужен.
Данные входа хранятся только в памяти; после обновления страницы войдите заново.

## Получение сообщений

В настройках инстанса оставьте `webhookUrl` пустым, включите
`incomingWebhook` и `outgoingAPIMessageWebhook` (`yes`).
Используйте один клиент на инстанс: другие вкладки и приложения могут забирать уведомления.

## Проверка и сборка

```sh
npm test        # тесты
npm run build   # проверка типов и сборка в dist/
npm run preview # просмотр сборки локально
```

[Спецификация](specs/original-spec.md) · [Архитектура](docs/architecture.md)
