const http = require('http');
const express = require('express');
const path = require('path');
const morgan = require('morgan');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const bodyParser = require('body-parser');
const { createTerminus } = require('@godaddy/terminus');
const trivia = require('./routes/trivia');

const app = express();

// Configuration
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;
const env = process.env.NODE_ENV || "production";

app.use(bodyParser.json());

app.use(cors());

app.use(helmet());

app.use(compression());

app.use(morgan(':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] :response-time ms'));

// APIs
app.use('/api/trivia', trivia);

// Error handling
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.json({
    message: err.message,
    error: env === 'development' ? err : {}
  });
});

// Health checks and graceful shutdown
const server = http.createServer(app);

function onSignal() {
  console.log('server is starting cleanup');
  return Promise.all([
    // add any clean-up logic
  ]);
}

function onShutdown () {
  console.log('cleanup finished, server is shutting down');
}

function onHealthCheck() {
  return Promise.resolve();
}

createTerminus(server, {
  signals: ['SIGHUP','SIGINT','SIGTERM'],
  healthChecks: {
    '/health': onHealthCheck,
  },
  onSignal,
  onShutdown
});

server.listen(port, () => {
  console.log(`Listening on port ${port}`);
});

module.exports = server;
