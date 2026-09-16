FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache python3 make g++ py3-setuptools
# 1) Csak a csomagfájlok másolása — réteg cache-hez
COPY package*.json ./
# 2) Függőségek telepítése + sqlite3 fordítás (csak package*.json változásnál fut újra)
RUN npm install
RUN npm rebuild sqlite3 --build-from-source
# 3) Forráskód másolása — kódmódosításnál ez a réteg cserélődik gyorsan
COPY . .
EXPOSE 8080
CMD ["node", "server.js"]
