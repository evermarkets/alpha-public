
const randomString = require('./randomString');

var clientConfig = {}; // eslint-disable-line no-var

// Load client config. Async.
module.exports.configLoad = (store, feathersServices) =>
  store.dispatch(feathersServices.config.get(0))
    .then((res) => {
      if (!localStorage.deviceId) {
        localStorage.deviceId = randomString(30);
      }

      clientConfig = res.action.payload;
      if (!clientConfig.agent) { // just being careful
        clientConfig.agent = {};
      }
      clientConfig.agent.deviceId = localStorage.deviceId;
      clientConfig.agent.clientBuiltFor =
        __processEnvNODE_ENV__; // eslint-disable-line no-undef, camelcase

      Object.freeze(clientConfig);

      return clientConfig;
    })
    .catch((error) => {
      console.log('Client config.js unexpected error:', error);
    });

// Return current value of clientConfig. We cannot do this with ES6 as far as I can tell.
// This code depends on how Babel transpiles import { config } from './config';
Object.defineProperty(module.exports, 'config', {
  get() {
    return clientConfig;
  },
});
