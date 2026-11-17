#!/bin/bash
APP="/Users/smm/Desktop/Harness try/zhiliao/app"
cd "$APP" || exit 1
mkdir -p logs
echo "===== $(date '+%Y-%m-%d %H:%M:%S') 开始抓取" >> logs/crawl.log
/usr/local/bin/node scripts/crawl.mjs --limit=6 >> logs/crawl.log 2>&1
echo "===== $(date '+%Y-%m-%d %H:%M:%S') 结束" >> logs/crawl.log
