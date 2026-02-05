FROM node:20

WORKDIR /app
# Backend
COPY node/package*.json ./node/
RUN cd node && npm install

# Frontend
COPY web/package*.json ./web/
RUN cd web && npm install

# Copy source last (better caching)
COPY node ./node
COPY web ./web

EXPOSE 3000 5173

CMD ["sh", "-c", "cd /app/web && npm run dev"]
