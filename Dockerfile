FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache python3 make g++ py3-setuptools
COPY package*.json ./
RUN npm install
RUN npm rebuild sqlite3 --build-from-source
COPY . .
EXPOSE 8080
CMD ["node", "server.js"]
