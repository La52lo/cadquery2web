FROM node:23.6.1-alpine3.20
WORKDIR /app
COPY package.json server.js RequestQueue.js groqFetch.js ./
RUN npm install
EXPOSE 3000
CMD ["node", "server.js"]
