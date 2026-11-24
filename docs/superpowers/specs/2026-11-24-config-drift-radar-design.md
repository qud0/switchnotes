# Config Drift Radar & 2-Way Sync: Интеллектуальный радар расхождения конфигураций

**Дата:** 2026-11-24  
**Статус:** На согласовании (Design Doc)  
**Автор / Tech Lead:** Senior Product Engineer  

---

## 1. Контекст и Проблема (Intent & The Why)

### Текущая ситуация
Сетевые инженеры часто вносят оперативные правки на коммутаторах в спешке или во время аварий («на лету» через SSH/CLI или Winbox): меняют Native VLAN, добавляют статический маршрут, гасят порт или отключают Spanning Tree.
В результате:
1. **Config Drift (Рассинхронизация):** Реальная конфигурация на оборудовании (`running-config`) начинает расходиться с документацией в SwitchBook и утвержденным эталоном.
2. **Скрытые аварии при перезагрузке:** Если инженер забыл выполнить `write` / `save`, при отключении питания коммутатор сбрасывается к старой версии, и сеть падает.
3. **Неизвестно, кто и что изменил:** Нет наглядного инструмента, который мгновенно покажет: «10 минут назад на порту 14 убрали VLAN 30 и добавили VLAN 100».

### Решение: Config Drift Radar & 2-Way Sync
Система проактивного контроля конфигураций:
1. **Golden Baseline (Эталонная версия):** Для каждого коммутатора в базе фиксируется эталонная конфигурация (`isGolden: true`).
2. **Конвейер нормализации (Zero False-Positives):** Очистка running-config от динамических меток времени, тактов NTP и метаданных вендоров перед расчетом хеша и Diff.
3. **Event-Driven & Scheduled Drift Scanning:**
   * **По событию (Instant):** Интеграция с демоном **Live Event Pulse**. При получении Syslog-события выхода из конфигурации (`%SYS-5-CONFIG_I` на SNR или `system,info configuration changed` на MikroTik), Drift Radar через очередь (с debounce 10 секунд) запрашивает свежий running-config по SSH.
   * **По расписанию (Periodic):** Фоновый опрос по расписанию через `backupScheduler`.
4. **Визуальный Diff Radar:**
   * Автоматический расчет SHA-256 хеша нормализованной конфигурации и построчный LCS Diff.
   * Если хеш не совпадает — статус коммутатора меняется на `DRIFT_DETECTED` (оранжевый индикатор на карточке и в шапке).
5. **2-Way Reconciliation (Двустороннее устранение расхождений с защитой от сбоев):**
   * **Вариант А («Принять в базу»):** Если изменения санкционированы, оператор нажимает «Принять как новый эталон» -> SwitchBook обновляет ревизию и актуализирует базу данных.
   * **Вариант Б («Откатить на свитче»):** Если изменения были ошибочными или несанкционированными, система формирует обратный скрипт отката (`no ...`, восстановление удаленных строк) и с контролем ошибок накатывает его обратно на коммутатор с защитой Management IP.

---

## 2. Цели, Не-цели и Анти-цели (Goals, Non-Goals, Anti-Goals)

### Цели (Goals):
1. **Концепция Golden Baseline:**
   * Возможность пометить любую ревизию бэкапа как «Эталон (Golden)» (`isGolden: true`).
   * Если эталон не назначен явно — последняя сохраненная ревизия автоматически считается базовой.
2. **Конвейер нормализации конфигураций (`normalizeConfig`):**
   * **MikroTik RouterOS:** вырезание строк `# nov/24/2026 14:25:31 by RouterOS...`, полей сертификатов `expires-after`, `invalid-after/before`, системных комментариев модели и серийного номера.
   * **SNR-OS / Cisco:** вырезание `! Current configuration : ...`, `! Last configuration change at ...`, `! NVRAM config last updated at ...`, `! Time: ...`, и фазовой частоты NTP `ntp clock-period <digits>`.
   * Нормализация пробелов и переводов строк (`\r\n` -> `\n`).
3. **Очередь задач сканирования (Drift Task Queue):**
   * Ограничение параллельных SSH-сессий: `concurrency: 2`.
   * Debounce 10 секунд после получения Syslog-события (ожидание завершения серии правок инженера).
   * Cooldown 30 секунд на один коммутатор для исключения DoS-нагрузки.
   * Дедупликация задач в очереди.
4. **Иерархия SSH-аутентификации:**
   * 1. Параметры самого коммутатора (`sw.sshUsername`, `sw.sshPassword`, `sw.sshPort`).
   * 2. Глобальные настройки планировщика (`backupSchedule.credentials`).
   * 3. Переменные окружения (`DEFAULT_SWITCH_USER`, `DEFAULT_SWITCH_PASS`).
   * Если реквизиты отсутствуют — безопасный пропуск со статусом `DRIFT_CHECK_SKIPPED` без попыток брутфорса пустыми паролями.
5. **Безопасный откат (Fail-Fast Rollback & Guardrails):**
   * Построчный анализ вывода CLI: при обнаружении `% Error`, `% Invalid` или `failure:` — немедленная остановка без выполнения команды сохранения `write`.
   * Защитные ограничения (Guardrails): блокировка автоматического удаления строк, содержащих Management IP коммутатора, default gateway или порты управления.
6. **2-Way Sync Actions (API & UI):**
   * `POST /api/drift/:switchId/reconcile-accept` — утверждение дрифта (текущий running-config становится новым эталоном).
   * `POST /api/drift/:switchId/reconcile-rollback` — безопасное применение скрипта отката по SSH.
7. **UI Радар и Side-by-Side Diff:**
   * Индикатор статуса: `✓ Синхронизировано`, `⚠️ Drift (+N / -M строк)`, `⏳ Сканирование...`.
   * Модальное окно просмотра дрифта с Side-by-Side и Unified diff.

### Не-цели (Non-Goals):
1. Перехват и расшифровка бинарных RouterOS `.backup` файлов — работа ведется исключительно с текстовыми human-readable скриптами (`/export compact` и `show running-config`), совместимыми с Git.

### Анти-цели (Anti-Goals):
1. Никаких 100% false-positives из-за динамических временных меток вендоров.
2. Никаких «слепых» накатов отката, способных окирпичить свитч или изолировать его по сети при ошибке в синтаксисе.
3. Никаких штормов одновременных SSH-подключений при массовых событиях в сети.

---

## 3. Архитектура и Потоки Данных

```
   [Сетевой инженер / CLI / Winbox]
                 │
                 ▼
         (Изменил настройку)
                 │
                 ▼
          [Коммутатор]
                 │
                 ├── (1. Отправка Syslog %SYS-5-CONFIG_I / config changed)
                 │                   │
                 ▼                   ▼
    ┌──────────────────────────────────────────────┐
    │          eventPulseDaemon.js                 │
    │         (Live Event Pulse UDP)               │
    └────────────────────┬─────────────────────────┘
                         │
                         ▼ (2. Enqueue с Debounce 10s & Concurrency: 2)
    ┌──────────────────────────────────────────────┐
    │          configDriftService.js               │
    │  - Drift Task Queue (max 2 parallel SSH)     │
    │  - SSH /export или show running-config       │
    │  - normalizeConfig (удаление динамических)   │
    │  - SHA-256 Hash vs Golden Baseline           │
    │  - LCS Diff Calculation                      │
    └────────────────────┬─────────────────────────┘
                         │
                         ▼ (3. Если обнаружен Drift)
    ┌──────────────────────────────────────────────┐
    │             storage.js                       │
    │  - switch.driftStatus = 'drifted'            │
    │  - switch.lastDriftDiff = { added, removed } │
    │  - addAlert('warning', 'Обнаружен дрифт')    │
    └────────────────────┬─────────────────────────┘
                         │
                         ▼ (4. WebSocket Push в браузер)
    ┌──────────────────────────────────────────────┐
    │             Web UI (React)                   │
    │  - Оранжевый бейдж на коммутаторе            │
    │  - Всплывающий алерт: "Дрифт на SW-01"       │
    │  - Кнопки: [Принять в базу] / [Откатить]     │
    └──────────────────────────────────────────────┘
```

---

## 4. Детали Реализации

### 4.1. Нормализация конфигураций (`server/configNormalizer.js`)
* Функция `normalizeConfig(content, vendor)`:
  - **SNR / Cisco:**
    - `content.replace(/^!\s*(?:Current configuration|Last configuration change|NVRAM config last updated|Time:).*$/gmi, '')`
    - `content.replace(/^ntp clock-period\s+\d+.*$/gmi, '')`
    - `content.replace(/^!$/gm, '')`
  - **MikroTik:**
    - `content.replace(/^#\s+[a-z]{3}\/\d{1,2}\/\d{4}\s+\d{2}:\d{2}:\d{2}\s+by\s+RouterOS.*$/gmi, '')`
    - `content.replace(/\s+expires-after=\S+/gi, '')`
    - `content.replace(/\s+invalid-(?:after|before)="[^"]*"/gi, '')`
    - `content.replace(/^#\s+(?:software id|serial number|model)\s*=.*$/gmi, '')`
  - **Общие:** тримминг строк, удаление пустых дублей строк.

### 4.2. Сервис контроля дрифта (`server/configDriftService.js`)
* Класс `ConfigDriftService`:
  - `queue`: очередь задач на сканирование с лимитом `concurrency: 2`.
  - `resolveCredentials(switchItem)`: резолвит SSH-реквизиты свитча по цепочке (Свитч -> Global -> Env).
  - `checkSwitchDrift(switchId, options)`: выполняет SSH-выгрузку, нормализацию, сравнение с эталоном, сохранение статуса.
  - `reconcileAccept(switchId)`: утверждает текущую конфигурацию как новый эталон.
  - `reconcileRollback(switchId)`: выполняет безопасный построчный накат скрипта отката с fail-fast проверкой.

### 4.3. Интеграция с `eventPulseParser.js`
* Добавление правила парсинга Syslog для изменений конфигурации MikroTik:
  `system,info(?:,account)?.*?(?:configuration changed|logged in and changed)`
* Вызов `configDriftService.enqueueDriftCheck(switchId)` при получении события изменения конфига.

### 4.4. Интерфейс (UI)
* Индикатор дрифта на карточке свитча ([`SwitchCard.jsx`](file:///c:/devs/switchnotes/src/components/SwitchCard.jsx)) и тулбаре.
* Вкладка «Контроль расхождений (Drift Radar)» в окне бэкапов ([`ConfigBackupModal.jsx`](file:///c:/devs/switchnotes/src/components/ConfigBackupModal.jsx)) с отображением Side-by-Side Diff и кнопками 2-Way Sync.

---

## 5. План тестирования (TDD)
1. `test/configNormalizer.test.js`:
   * Проверка удаления динамических меток времени, NTP clock-period и дат генерации экспорта RouterOS / SNR-OS.
   * Проверка совпадения SHA-256 хешей для идентичных конфигураций с разными временными метками.
2. `test/configDriftService.test.js`:
   * Очередь задач с ограничением concurrency.
   * Обнаружение реального дрифта (добавление VLAN, сброс порта).
   * Защитные ограничения (Guardrails): отказ отката строк с IP управления.
3. Проверка полной сборки `npm run build` и интеграционных тестов.
