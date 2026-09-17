# GREEN-API: внешний контракт

Читать при работе с запросами к GREEN-API. Источник: https://green-api.com/docs/

## Доступ

Инстанс создаётся и авторизуется в консоли (console.green-api.com). Оттуда берутся
`apiUrl`, `idInstance`, `apiTokenInstance`. Общий хост — `https://api.green-api.com`,
но у части инстансов свой (`https://NNNN.api.green-api.com`), поэтому `apiUrl`
считаем параметром, а не константой.

Шаблон запроса:

```
{apiUrl}/waInstance{idInstance}/{method}/{apiTokenInstance}
```

## Нужные методы

| Метод | Запрос | Назначение |
|---|---|---|
| `getStateInstance` | GET | Проверить учётные данные. `stateInstance` = `authorized` / `notAuthorized` / `blocked` / `sleepMode` / `starting` |
| `sendMessage` | POST `{chatId, message}` | Отправить текст. Возвращает `idMessage` |
| `receiveNotification` | GET `?receiveTimeout=5..60` | Забрать событие из очереди |
| `deleteNotification` | DELETE `/{receiptId}` | Убрать событие из очереди |

## Приём сообщений (HTTP API)

`receiveNotification` — long-poll: держит соединение до `receiveTimeout` секунд и
отдаёт **пустой ответ**, если ничего не пришло. Очередь FIFO, события хранятся 24 часа.

Обработанное событие **обязательно** удаляется через `deleteNotification` по
`receiptId` — иначе очередь встанет на нём и новые сообщения не придут.

Форма ответа:

```json
{
  "receiptId": 1234567,
  "body": {
    "typeWebhook": "incomingMessageReceived",
    "senderData": { "chatId": "79001234567@c.us" },
    "messageData": {
      "typeMessage": "textMessage",
      "textMessageData": { "textMessage": "текст" }
    }
  }
}
```

Что учитывать:

- Текст лежит в `messageData.textMessageData.textMessage` либо, для сообщений с
  цитатой и ссылками, в `messageData.extendedTextMessageData.text`.
- В очередь падают не только сообщения: статусы доставки, файлы, звонки.
  Всё, что не текст, игнорируем.
- Свои же отправленные сообщения возвращаются как `outgoingAPIMessageReceived` —
  дедуплицируем по `idMessage`, иначе задвоятся в интерфейсе.
- `chatId` личного чата — `{цифры номера}@c.us`, группы — `{...}@g.us`.
