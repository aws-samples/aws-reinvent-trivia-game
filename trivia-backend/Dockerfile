FROM node:10.12.0-alpine

RUN npm install -g npm@6.4.1

ARG NODE_ENV=production
ARG PORT=8080

ENV NODE_ENV $NODE_ENV
ENV PORT=$PORT

WORKDIR /opt/app
COPY package.json package-lock.json ./
RUN npm ci && npm prune --production && npm cache clean --force
COPY . /opt/app

HEALTHCHECK --interval=30s CMD node healthcheck.js

EXPOSE $PORT

CMD [ "node", "service.js" ]