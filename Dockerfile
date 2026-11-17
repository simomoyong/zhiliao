FROM node:24-alpine

WORKDIR /app

# 零依赖，直接拷源码
COPY package.json ./
COPY server.mjs ./
COPY lib ./lib
COPY public ./public
COPY scripts ./scripts
COPY data/sources.json ./data/sources.json
COPY extension ./extension

ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787

CMD ["node", "server.mjs"]
