'use strict';

const webpack = require('webpack');
const spawn = require('cross-spawn');
const path = require('path');
const webpackDevMiddleware = require('webpack-dev-middleware');
const webpackHotMiddleware = require('webpack-hot-middleware');
const express = require('express');
const httpProxy = require('http-proxy');
const config = require('../config/webpack.client.dev');
const serverConfig = require('../config/webpack.server.dev');

const app = express();

const compiler = webpack(config);

app.use(webpackDevMiddleware(compiler, {
  publicPath: config.output.publicPath,
  hot: true,
  stats: 'minimal',
}));

app.use(webpackHotMiddleware(compiler));

// since the devserver config uses style-loader, we don't want to serve the
// extracted main.css, and without this line the browser hangs when asking the
// dev server for main.css & never times out
app.get('/assets/main.css', (req, res) => {
  res.status(404).send('not found');
});

const APP_PORT = process.env.APP_PORT || 3232;

// proxy everything to app server except webpack output
const proxy = httpProxy.createProxyServer();
app.all('*', (req, res) => {
  if (!new RegExp(`^${config.output.publicPath}`).test(req.path)) {
    proxy.web(req, res, { target: `http://localhost:${APP_PORT}` }, () => {
      res.send(`<!doctype html>
<html>
<head>
  <style>
    body { background: black; color: white; font-family: Menlo, monospace; }
  </style>
  <script>
    var i = 0;
    setInterval(function(){
      document.body.innerHTML = 'Building server' + Array(i).fill('.').join('');
      i = (i + 1) % 4;
    }, 200)
    setTimeout("location.reload()", 300);
  </script>
</head>
<body></body>
</html>`);
    });
  } else {
    res.sendStatus(404);
  }
});

const PORT = process.env.PORT || 3233;

app.listen(PORT, (err) => {
  if (err) {
    return console.error(err);
  }
  return console.log(`Dev server is listening on port ${PORT} and proxying to app server`);
});

const serverCompiler = webpack(Object.assign({}, serverConfig));
const serverPath = path.resolve('build/server.js');

let child;

function startServer() {
  child = spawn('node', [serverPath], { stdio: 'inherit' });
  child.on('close', code => {
    console.log('EXIT', code);
    child = null;
  });
}

function restartServer() {
  if (child) {
    child.on('close', () => startServer());
    child.kill();
  } else {
    startServer();
  }
}

console.log('Compiling server build... this will take a while...');
serverCompiler.watch({ poll: 1000 }, (err, stats) => {
  if (err) {
    console.error(err.message || err);
  }
  if (stats.hasErrors()) {
    console.log(stats.toString('errors-only'));
  } else {
    console.log('Starting new server...');
    restartServer();
  }
});


// relay compiler

const relayCompiler = spawn(
  path.resolve(__dirname, '../node_modules/.bin/relay-compiler'),
  [
    '--src',
    path.resolve('.'),

    '--include',
    'src/**',
    'node_modules/eyrie/lib/**',

    '--exclude',
    '**/__generated__/**',
    'node_modules/eyrie/node_mobules/**',

    '--schema',
    'schema.json',

    '--watch',
  ],
  { stdio: 'inherit' }
);

relayCompiler.on('close', code => process.exit(code));
