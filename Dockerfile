FROM node:18-alpine

WORKDIR /app


RUN npm ci --only=production

COPY package*.json /app/


COPY . /app

EXPOSE 3000

CMD ["node", "index.js"]