#!/bin/bash
# Deploy openclaw-team-dashboard to server
# Usage: ./scripts/deploy.sh

SERVER="bosscatdog@192.168.2.109"
PASS="boss123456"
APP_DIR="~/openclaw-team-dashboard"
PORT=3001

echo "🚀 Deploying to $SERVER..."

sshpass -p "$PASS" ssh -o StrictHostKeyChecking=no "$SERVER" "
set -e
cd $APP_DIR

echo '📥 Pulling latest...'
git pull origin main

echo '📦 Installing deps...'
npm install --production=false

echo '🔨 Building...'
npm run build

echo '� Copying static assets to standalone...'
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public

echo '�🛑 Stopping old process...'
pkill -f 'next-server' 2>/dev/null || true
pkill -f 'next start' 2>/dev/null || true
pkill -f 'node.*standalone.*server.js' 2>/dev/null || true
sleep 3

echo '▶️ Starting server on port $PORT...'
setsid nohup env PORT=$PORT node .next/standalone/server.js </dev/null >> /tmp/team-dashboard.log 2>&1 &
echo \$! > /tmp/team-dashboard.pid
sleep 5

STATUS=\$(curl -s -o /dev/null -w '%{http_code}' http://localhost:$PORT/)
echo \"✅ HTTP Status: \$STATUS\"
echo '📋 Logs:'
tail -5 /tmp/team-dashboard.log
"

echo ""
echo "✅ Deploy complete!"
echo "🌐 Access: http://192.168.2.109:$PORT"
