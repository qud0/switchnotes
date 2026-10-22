# 🚀 Шпаргалка по развертыванию SwitchBook на боевом (Production) сервере

Данное руководство описывает варианты установки и промышленной эксплуатации системы **SwitchBook**.

---

## ⚡ Архитектура в Production

В продакшене **не нужен Vite**. Бэкенд на Node.js (`server/index.js`) выполняет одновременно две роли:
1. Раздает готовый скомпилированный фронтенд из папки `dist/` на порту `3050`.
2. Обслуживает все REST API запросы, фоновый SNMP-демон и WebSockets для Web-SSH терминала.

---

## 🐳 Вариант 1: Развертывание через Docker / Docker Compose (Рекомендуемый)

Самый быстрый и изолированный способ для любого Linux/Windows сервера.

### Шаг 1. Распаковка архива
```bash
unzip switchbook_backup_*.zip -d /opt/switchbook
cd /opt/switchbook
```

### Шаг 2. Запуск контейнера
```bash
docker compose up -d --build
```

### Шаг 3. Проверка статуса
```bash
docker compose ps
docker compose logs -f
```
Приложение сразу доступно по адресу: `http://<IP_СЕРВЕРА>:3050`
База данных `data/db.json` примонтирована на хост-машину, поэтому данные сохраняются при любых перезапусках и обновлениях контейнера.

---

## 🐧 Вариант 2: Развертывание на Linux (Ubuntu / Debian / CentOS) через PM2 и Nginx

Идеально для выделенных серверов или виртуальных машин без Docker.

### 1. Установка Node.js (версия 20 LTS или 22 LTS)
```bash
# Ubuntu / Debian
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs unzip git nginx
```

# 2. Распаковка и установка проекта
sudo mkdir -p /opt/switchbook
sudo chown -R $USER:$USER /opt/switchbook

# Распаковать бэкап
unzip switchbook_backup_*.zip -d /opt/switchbook
cd /opt/switchbook

# Установка зависимостей и сборка
npm install
npm run build

### 3. Автозапуск через Systemd (Рекомендуется для Linux)
В дистрибутив уже включен готовый файл службы `switchbook.service`.
```bash
# 1. Создать системного пользователя switchbook (без входа в шелл)
sudo useradd -r -s /bin/false switchbook || true
sudo chown -R switchbook:switchbook /opt/switchbook

# 2. Скопировать файл юнита в systemd
sudo cp switchbook.service /etc/systemd/system/

# 3. Перечитать юниты и включить автозапуск
sudo systemctl daemon-reload
sudo systemctl enable switchbook
sudo systemctl start switchbook

# 4. Проверить статус службы
sudo systemctl status switchbook
sudo journalctl -u switchbook -f
```

### Альтернатива: Автозапуск через менеджер процессов PM2
```bash
sudo npm install -g pm2
pm2 start server/index.js --name "switchbook"
pm2 startup
pm2 save
```

### 4. Настройка Nginx с поддержкой SSL и WebSockets (Web-SSH)
Создайте конфигурационный файл `/etc/nginx/sites-available/switchbook`:
```nginx
server {
    listen 80;
    server_name switchbook.company.local; # или IP сервера

    # Редирект на HTTPS (если есть SSL):
    # return 301 https://$host$request_uri;

    client_max_body_size 50M;

    # Основной трафик интерфейса и API
    location / {
        proxy_pass http://127.0.0.1:3050;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # КРИТИЧНО: Проксирование WebSocket для Web-SSH терминала
    location /ws/ssh {
        proxy_pass http://127.0.0.1:3050/ws/ssh;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

Активация конфига Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/switchbook /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 🪟 Вариант 3: Развертывание на Windows Server как служба (Windows Service)

Если боевой сервер работает под управлением Windows Server.

### 1. Установите Node.js
Скачайте и установите **Node.js LTS** с официального сайта [nodejs.org](https://nodejs.org).

### 2. Распакуйте проект
Например в папку `C:\SwitchBook`.

В терминале PowerShell в папке `C:\SwitchBook`:
```powershell
npm install
npm run build
```

### 3. Регистрация как системная служба Windows (через NSSM)
1. Скачайте бесплатную утилиту **NSSM** (Non-Sucking Service Manager) с [nssm.cc](https://nssm.cc/download).
2. Запустите в командной строке от Администратора:
```cmd
nssm install SwitchBook "C:\Program Files\nodejs\node.exe" "C:\SwitchBook\server\index.js"
nssm set SwitchBook AppDirectory "C:\SwitchBook"
nssm set SwitchBook Description "SwitchBook Network Management Platform"
nssm set SwitchBook Start SERVICE_AUTO_START
nssm start SwitchBook
```
Служба будет автоматически запускаться при старте Windows и перезапускаться в случае сбоев.

---

## 💾 Резервное копирование и сохранность данных (Бэкапы)

Вся база данных хранится в одном JSON-файле:
- **Основной файл:** `data/db.json`
- **Автоматические бэкапы системы:** планировщик SwitchBook делает ежедневные копии в `data/` каждые 24 часа.

### Как настроить внешний Cron-бэкап на Linux (в /backup или на сетевое хранилище):
```bash
# Добавить в crontab -e:
0 3 * * * cp /var/www/switchbook/data/db.json /mnt/backup/switchbook_db_$(date +\%Y\%m\%d).json
```

---

## 🛡️ Безопасность и Firewall

Для работы всех функций убедитесь, что на сервере разрешены:
- **Входящий порт 80 / 443 / 3050 TCP** — для доступа администраторов к веб-интерфейсу.
- **Исходящий порт 161 UDP** — для SNMP-мониторинга коммутаторов в локальной сети.
- **Исходящий порт 22 TCP** — для SSH-подключения к коммутаторам из Web-SSH терминала и бэкапов конфигураций.
- **Исходящий порт 443 TCP в Интернет** (опционально) — для отправки оповещений в Telegram Bot API.

---

## ❓ Быстрые команды управления

| Задача | Команда |
|---|---|
| Проверка работы API | `curl http://localhost:3050/api/monitoring/health` |
| Перезапуск через PM2 | `pm2 restart switchbook` |
| Просмотр логов PM2 | `pm2 logs switchbook` |
| Перезапуск в Docker | `docker compose restart` |
| Просмотр логов Docker | `docker compose logs -f switchbook` |
| Ручная пересборка фронтенда | `npm run build` |
