# Node 20 (原生 fetch 稳定)
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY src/ ./src/
EXPOSE 3000
CMD ["npm", "start"]
