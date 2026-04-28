FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN npm ci --omit=dev --workspace backend

COPY backend ./backend
COPY frontend ./frontend

WORKDIR /app/backend

ENV PORT=3000

CMD ["node", "app.js"]
