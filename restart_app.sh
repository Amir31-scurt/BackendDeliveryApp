#!/bin/bash
source /home/$(whoami)/nodevenv/repositories/BackendDeliveryApp/18/bin/activate
cd /home/$(whoami)/repositories/BackendDeliveryApp

# Check if app is running, start/restart if not
pm2 describe BackendDeliveryApp > /dev/null 2>&1
if [ $? -ne 0 ]; then
  pm2 start ecosystem.config.js
else
  STATUS=$(pm2 jlist | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
  if [ "$STATUS" != "online" ]; then
    pm2 restart BackendDeliveryApp
  fi
fi

pm2 save