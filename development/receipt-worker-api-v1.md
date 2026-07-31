# API обработки чеков для Mac Mini

## Назначение

Этот документ описывает уже реализованный в `i-finances` контракт первой версии.
Его может вызывать локальный .NET worker напрямую либо VPS broker от имени
worker-а.

Все суммы передаются целыми числами в копейках. Например, `12.34 BYN`
передаётся как `1234`.

## Авторизация

Каждый запрос к `/api/receipt-worker/*` передаёт:

```http
Authorization: Bearer <RECEIPT_WORKER_API_KEY>
```

Сгенерировать ключ:

```bash
pnpm receipt:worker-key
```

Полученное значение один раз записывается в переменную окружения
`RECEIPT_WORKER_API_KEY` на стороне `i-finances` и в секреты broker/worker.
Ключ нельзя записывать в репозиторий или обычные application logs.

В production используется HTTPS. API-ключ проверяет право доступа, но не шифрует
соединение.

## Жизненный цикл

1. Worker запрашивает следующее задание.
2. Вместе с заданием получает временный `leaseToken`, категории и адрес фото.
3. Скачивает байты фото.
4. Во время долгой обработки продлевает бронь задания.
5. Выполняет три этапа: OCR, JSON чека, категоризация.
6. Возвращает полностью готовый JSON либо безопасное описание ошибки.

## 1. Забрать следующее задание

```http
POST /api/receipt-worker/jobs/lease
Content-Type: application/json
Authorization: Bearer <api-key>

{
  "workerId": "friend-mac-mini"
}
```

Если задания нет, сервер отвечает `204 No Content`.

Успешный ответ:

```json
{
  "schemaVersion": 1,
  "processingJobId": "job-id",
  "receiptImportId": "receipt-id",
  "attempt": 1,
  "leaseToken": "temporary-secret",
  "leaseExpiresAt": "2026-07-29T18:20:00.000Z",
  "imageUrl": "/api/receipt-worker/jobs/job-id/image",
  "requestedPipelineVersion": "receipt-local-v1",
  "categoriesSnapshotVersion": "sha256",
  "categories": [
    {
      "id": "category-id",
      "name": "Продукты",
      "description": "Продукты для повседневного питания семьи",
      "keywords": ["молоко", "хлеб"]
    }
  ],
  "reviewComment": "",
  "previousResult": null
}
```

При повторной обработке `reviewComment` содержит замечания пользователя, а
`previousResult` — прошлый результат для сравнения.

## 2. Скачать фото

```http
GET /api/receipt-worker/jobs/{processingJobId}/image
Authorization: Bearer <api-key>
X-Receipt-Lease-Token: <leaseToken>
```

Ответ содержит исходные байты и заголовки:

- `Content-Type`;
- `Content-Length`;
- `Content-SHA256`;
- `Content-Disposition`.

Worker проверяет `Content-SHA256` до запуска моделей.

## 3. Сообщить, что обработка продолжается

```http
POST /api/receipt-worker/jobs/{processingJobId}/heartbeat
Content-Type: application/json
Authorization: Bearer <api-key>

{
  "leaseToken": "temporary-secret"
}
```

Ответ:

```json
{
  "ok": true,
  "leaseExpiresAt": "2026-07-29T18:25:00.000Z"
}
```

Сейчас бронь выдаётся на 10 минут. Heartbeat следует отправлять заметно раньше
истечения, например каждые 2–3 минуты.

## 4. Вернуть готовый результат

```http
POST /api/receipt-worker/jobs/{processingJobId}/complete
Content-Type: application/json
Authorization: Bearer <api-key>
```

Тело:

```json
{
  "leaseToken": "temporary-secret",
  "result": {
    "schemaVersion": 1,
    "rawOcrText": "Текст, полученный на первом этапе",
    "receipt": {
      "currency": "BYN",
      "happenedOn": "2026-07-29",
      "totalAmountMinor": 1200,
      "merchant": {
        "displayName": "Магазин",
        "legalName": "ООО Магазин",
        "unp": "190000000",
        "address": "Минск"
      },
      "items": [
        {
          "name": "Молоко",
          "quantity": 1,
          "unitPriceMinor": 500,
          "discountMinor": 0,
          "totalMinor": 500
        },
        {
          "name": "Шампунь",
          "quantity": 1,
          "unitPriceMinor": 700,
          "discountMinor": 0,
          "totalMinor": 700
        }
      ]
    },
    "categorizedItems": [
      {
        "itemIndex": 0,
        "categoryId": "category-id",
        "confidence": 0.98
      },
      {
        "itemIndex": 1,
        "categoryId": null,
        "confidence": 0.55
      }
    ],
    "processor": {
      "workerId": "friend-mac-mini",
      "pipelineVersion": "receipt-local-v1",
      "modelVersions": [
        "ocr-model-version",
        "json-model-version",
        "category-model-version"
      ],
      "startedAt": "2026-07-29T18:10:00.000Z",
      "finishedAt": "2026-07-29T18:12:00.000Z"
    },
    "warnings": []
  }
}
```

Правила:

- у каждой товарной строки ровно одна запись в `categorizedItems`;
- `itemIndex` ссылается на исходный элемент `receipt.items`;
- один товар нельзя отнести сразу к двум категориям;
- `categoryId` берётся только из `categories`, полученных вместе с заданием;
- `null` означает группу `Без категории`;
- категоризация не переписывает исходный товар;
- `processor.workerId` совпадает с worker-ом, который забрал задание.

При повторной отправке полностью одинакового результата сервер возвращает успех
и не создаёт второй результат.

## 5. Вернуть ошибку

```http
POST /api/receipt-worker/jobs/{processingJobId}/fail
Content-Type: application/json
Authorization: Bearer <api-key>

{
  "leaseToken": "temporary-secret",
  "error": "Не удалось безопасно декодировать изображение"
}
```

В `error` передаётся короткое безопасное описание без содержимого фото, ключей,
полного OCR-текста и stack trace.

## Коды ответа

- `200` — запрос выполнен;
- `204` — очередного задания нет;
- `401` — отсутствует или неверен API-ключ;
- `409` — бронь истекла либо состояние задачи уже изменилось;
- `422` — тело запроса или результат не прошли проверку;
- `503` — API-ключ интеграции не настроен на сервере.

## Граница текущей реализации

Сейчас очередь, временная бронь и результат хранятся непосредственно в БД
`i-finances`. Контракт уже можно использовать для локальной интеграции. Отдельный
VPS broker, гарантированная публикация через таблицу исходящих сообщений и
подписанный callback будут добавлены следующим этапом без изменения бизнес-экрана
проверки чеков.
