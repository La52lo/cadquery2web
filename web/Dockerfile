FROM node:23.6.1-alpine3.20

WORKDIR /app
COPY ./package.json main.js index.html  main.css vite.config.js
RUN npm install
EXPOSE 5173

