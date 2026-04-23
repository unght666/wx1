FROM node:18-alpine

WORKDIR /app

COPY package*.json /app/
RUN npm ci --only=production

COPY . /app

EXPOSE 3000

CMD ["node", "index.js"]