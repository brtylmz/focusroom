FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/

RUN npm ci

COPY . .

ENV PORT=5173 \
    CLIENT_ORIGIN=http://localhost:5173

EXPOSE 5173

CMD ["npm", "run", "start"]
