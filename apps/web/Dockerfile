FROM node:22-alpine
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
RUN npm install
WORKDIR /repo/apps/web
CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0"]
