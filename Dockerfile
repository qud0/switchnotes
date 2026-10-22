# 1. Этап сборки фронтенда
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
# В package.json lucide-react и react указаны в devDependencies, поэтому ставим все
RUN npm ci
COPY . .
RUN npm run build

# 2. Этап выполнения на боевом сервере
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3050

# Системные утилиты для сетевой диагностики (ping, traceroute, arp)
RUN apk add --no-cache iputils iproute2 bind-tools ca-certificates

# Установка production зависимостей
COPY package*.json ./
RUN npm ci --omit=dev

# Копирование исходников бэкенда и собранного фронтенда
COPY server/ ./server/
COPY --from=builder /app/dist ./dist

# Создание директории данных
RUN mkdir -p /app/data

# Volume для персистентного хранения базы данных и бэкапов
VOLUME ["/app/data"]

EXPOSE 3050

CMD ["node", "server/index.js"]
