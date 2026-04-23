FROM node:18-alpine

WORKDIR /app

COPY package*.json package-lock.json ./

RUN npm ci --only=production

COPY package*.json /app/


COPY . /app

EXPOSE 3000

CMD ["node", "index.js"]