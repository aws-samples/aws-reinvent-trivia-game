FROM reinvent-trivia-backend-base:release

ARG NODE_ENV=production
ARG PORT=80

ENV NODE_ENV $NODE_ENV
ENV PORT=$PORT

WORKDIR /opt/app
COPY app/package.json app/package-lock.json ./
RUN npm ci && npm prune --production && npm cache clean --force
COPY ./app /opt/app
COPY ./data /opt/data
RUN apidoc -f "routes/.*\\.js$" -i ./  -o apidoc/

HEALTHCHECK --interval=30s CMD node healthcheck.js

EXPOSE $PORT

CMD [ "node", "service.js" ]