# Ropa Americana - Deployment Package

Це готовий до розгортання пакет Node.js/Express додатку.

## Структура

```
deploy/
├── server.js          # Основний сервер
├── package.json       # Залежності
├── .env.example       # Приклад змінних середовища
├── .env               # Ваші реальні змінні (створити з .env.example)
├── store.db           # База даних SQLite (створиться автоматично)
└── public/
    ├── index.html     # Головна сторінка магазину
    ├── admin.html     # Адмін панель
    ├── uploads/       # Завантажені фото товарів
    └── images/        # Статичні зображення
```

## Швидкий старт (локально)

```bash
cd deploy
npm install
copy .env.example .env
# Відредагуйте .env - поставте свій SESSION_SECRET
npm start
```

Відкрийте: http://localhost:3000
Адмінка: http://localhost:3000/admin (login: 123 / 123)

---

## Розгортання на популярних платформах

### 1. Railway (найпростіше, безкоштовний tier)
1. Завантажте цю папку в GitHub репозиторій
2. На railway.app → New Project → Deploy from GitHub repo
3. Додайте змінні середовища в Settings → Variables:
   - `PORT` = 3000
   - `NODE_ENV` = production
   - `SESSION_SECRET` = ваш довгий випадковий рядок
4. Railway автоматично виявить Node.js і запустить `npm start`

### 2. Render (безкоштовний tier)
1. Створіть Web Service на render.com
2. Підключіть GitHub репозиторій
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Додайте Environment Variables (як вище)

### 3. Fly.io
```bash
fly launch --no-deploy
# Відредагуйте fly.toml якщо потрібно
fly deploy
```

### 4. VPS (Ubuntu/Debian) з PM2
```bash
# На сервері
sudo apt update && sudo apt install -y nodejs npm nginx

# Завантажте проект (git clone або scp)
cd /var/www/ropa-americana
npm install --production

# PM2
sudo npm install -g pm2
pm2 start server.js --name ropa-americana
pm2 save
pm2 startup

# Nginx реверс-проксі
# /etc/nginx/sites-available/ropa-americana:
# server {
#     listen 80;
#     server_name ваш-домен.com;
#     location / {
#         proxy_pass http://localhost:3000;
#         proxy_http_version 1.1;
#         proxy_set_header Upgrade $http_upgrade;
#         proxy_set_header Connection 'upgrade';
#         proxy_set_header Host $host;
#         proxy_cache_bypass $http_upgrade;
#     }
# }
# sudo ln -s /etc/nginx/sites-available/ropa-americana /etc/nginx/sites-enabled/
# sudo nginx -t && sudo systemctl reload nginx
```

### 5. Docker (будь-де)
```dockerfile
# Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
docker build -t ropa-americana .
docker run -d -p 3000:3000 --env-file .env --name ropa ropa-americana
```

---

## Важливі зауваження

1. **SESSION_SECRET** — обов'язково змініть на довгий випадковий рядок (32+ символи) в `.env`
2. **База даних** — `store.db` створюється автоматично при першому запуску. Для продакшну краще використовувати PostgreSQL (потрібно змінити код server.js)
3. **Завантажені файли** — зберігаються в `public/uploads/`. На платформах з ефемерною файловою системою (Railway, Render) файли пропадають при редеплої. Використовуйте S3/Cloudinary або volume.
4. **HTTPS** — налаштовується на рівні реверс-проксі (Nginx, Cloudflare, платформа хостингу)

---

## Команди

```bash
npm install        # встановити залежності
npm start          # запуск (development)
npm run prod       # запуск (production)
```

---

## Підтримка

- Логін адмінки: `123` / `123` (змініть після першого входу в коді server.js)
- Порт: 3000 (зміниться через PORT в .env)