FROM node:24-alpine
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
RUN npm install
WORKDIR /repo/apps/api
RUN npm run build
CMD ["sh", "-c", "npm run migration:run && node dist/main.js"]
