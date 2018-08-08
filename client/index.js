import makeDebug from 'debug';
import { browserHistory } from 'react-router';
import { syncHistoryWithStore } from 'react-router-redux';

import configureStore from './store';
import chainMod from './helpers/chain';
import { feathersServices } from './feathers'; // does feathers init
import { configLoad } from './utils/config';
import './utils/react-tap-event';

// __processEnvNODE_ENV__ is replaced during the webpack build process
const nodeEnv = __processEnvNODE_ENV__; // eslint-disable-line no-undef, camelcase
const debug = makeDebug('index');

debug(`client starting. Built for ${nodeEnv} env.`);
console.log(`..This bundle was built for the ${nodeEnv} env.`);

// Initialize Redux
const store = configureStore();
const history = syncHistoryWithStore(browserHistory, store);

// Handle uncaught exceptions.
if (nodeEnv === 'production') {
  setupOnUncaughtExceptions();
}

// Get client config
configLoad(store, feathersServices)
  .then((/* clientConfig */) => {
    const completeLoad = () => {
      // Setup React Router which starts up the rest of the app.
      // A hack. Lemme know if you have a better idea.
      const router = require('./router').default; // eslint-disable-line global-require

      router(store, history);
    };

    // MetaMask doesn't set the current account immediately and there are no
    // events to listen to, so we need to poll
    // https://github.com/MetaMask/faq/blob/master/DEVELOPERS.md#ear-listening-for-selected-account-changes
    const waitForWeb3Account = () => {
      let calls = 0;
      const checkInterval = setInterval(() => {
        calls += 1;
        const Web3 = chainMod.getWeb3();
        if (!Web3 || Web3.eth.accounts.length === 1 || calls > 10) {
          clearInterval(checkInterval);
          completeLoad();
        }
      }, 100);
    };

    // MetaMask doesn't inject web3 until the window's load event
    // https://github.com/MetaMask/faq/blob/master/DEVELOPERS.md#partly_sunny-web3---ethereum-browser-environment-check
    if (document.readyState === 'complete') {
      waitForWeb3Account();
    } else {
      window.addEventListener('load', waitForWeb3Account);
    }
  });
// you cannot place a catch here because of the require inside then()

// Handle uncaught exceptions
function setupOnUncaughtExceptions() { // eslint-disable-line no-unused-vars
  window.addEventListener('error', (e) => {
    e.preventDefault();
    const { error } = e;
    console.error('onUncaughtExceptions caught error:\n', error);
  });
}
