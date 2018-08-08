const path = require('path');
const defer = require('config/defer').deferConfig;

const root = process.cwd();

// 'defer' defers calc until the final merged configuration structure has been built

module.exports = {
  isProduction: defer(finalConfig => finalConfig.NODE_ENV === 'production'),
  // devserver, development or production. validated on server start up
  NODE_ENV: undefined,
  // npm debug
  DEBUG: undefined,
  server: {
    // host name e.g. localhost
    host: undefined,
    // port number for server
    port: undefined,
    // root folder with assets. Webpack bundles are written to ./dist
    publicPath: path.join(root, 'public'), // also some hard coding in server/app, webpack
  },
  logs: {
    // log level for the file. from highest: 'error', 'warn', 'info', 'verbose', 'debug', 'silly'
    logLevel: undefined,
    // folder where logs are saved
    path: undefined,
    // log file names
    fileName: 'server.log',
    // log level for the console
    logConsoleLevel: undefined,
  },
  client: {
    // Name of app
    appName: 'EverMarkets',
    // Route for app's root.
    // Used by Express middleware, React-Router config, and app when redirecting.
    defaultRoute: '/app',
  },
  database: {
    // Some DBs, like PostgreSQL, use 'id' prop for their record keys instead of '_id'.
    // The code sometimes cannot avoid having to use the prop name, e.g. with hook.restrictToOwner.
    idName: 'id',
    host: 'localhost',
    name: 'evermarkets',
    username: 'root',
    password: 'root',
    port: '3306',
  },
  web3_provider: {
    host: '0.0.0.0',
    port: '8545',
    network_id: '*',
  },
  // client itself sets these on start up
  agent: {
    clientBuiltFor: null,
    deviceId: null,
  },

  // This is the subset of the config sent to the client
  clientConfig: defer(finalConfig => ({
    client: {
      defaultRoute: finalConfig.client.defaultRoute,
    },
    agent: {
      clientBuiltFor: finalConfig.agent.clientBuiltFor,
      deviceId: finalConfig.agent.deviceId,
    },
  })),
};
