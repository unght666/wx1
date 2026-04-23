FROM alpine:3.13

WORKDIR /app

COPY package*.json /app/


COPY . /app

EXPOSE 3000

CMD ["start"]