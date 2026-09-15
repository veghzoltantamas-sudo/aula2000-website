#!/bin/bash
# Aula 2000 szinkronizálás oracle-vps → LXC 156 (192.168.50.102)
# Használat: bash sync-to-lxc.sh

set -e

REMOTE="root@192.168.50.102"
REMOTE_DIR="/var/www/aula2000"
SSH_PASS="Zoli1147"
SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=10"
LOCAL_DIR="/home/ubuntu/aula2000"

echo "🔄 Aula 2000 szinkronizálás indítása..."

# 1. Forráskód másolás (kivéve: node_modules, .git, data, uploads)
echo "📦 Forráskód másolása..."
rsync -avz -e "sshpass -p $SSH_PASS ssh $SSH_OPTS" \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude 'data' \
    --exclude 'public/uploads' \
    --exclude 'sync-to-lxc.sh' \
    "$LOCAL_DIR/" "$REMOTE:$REMOTE_DIR/"

# 2. Adatbázis és adatok szinkronizálása
echo "💾 Adatbázis szinkronizálás..."
rsync -avz -e "sshpass -p $SSH_PASS ssh $SSH_OPTS" \
    "$LOCAL_DIR/data/" "$REMOTE:$REMOTE_DIR/data/"

# 3. Feltöltött fájlok szinkronizálása
echo "🖼️  Feltöltött fájlok szinkronizálás..."
rsync -avz -e "sshpass -p $SSH_PASS ssh $SSH_OPTS" \
    "$LOCAL_DIR/public/uploads/" "$REMOTE:$REMOTE_DIR/public/uploads/"

# 4. Permissions
echo "🔐 Jogosultságok beállítása..."
sshpass -p $SSH_PASS ssh $SSH_OPTS $REMOTE \
    "chmod -R 755 $REMOTE_DIR/data $REMOTE_DIR/public/uploads"

# 5. Dependency ellenőrzés (ha package.json változott)
echo "📋 Node modules ellenőrzése..."
sshpass -p $SSH_PASS ssh $SSH_OPTS $REMOTE \
    "cd $REMOTE_DIR && npm install --production 2>&1 | tail -3"

# 6. PM2 újraindítás
echo "🔄 PM2 újraindítás..."
sshpass -p $SSH_PASS ssh $SSH_OPTS $REMOTE \
    "cd $REMOTE_DIR && pm2 restart aula2000 2>&1 | tail -3"

echo ""
echo "✅ Szinkronizálás befejezve!"
echo "🌐 Teszt: curl -s http://192.168.50.102/ | head -5"
