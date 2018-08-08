require('babel-register');
require('babel-polyfill');

const rinkebyWallet = require('./server/utils/rinkebyWallet');

module.exports = {
  networks: {
    development: {
      host: process.env.TESTRPC_HOST || '0.0.0.0',
      port: 8545,
      network_id: '*',
      gas: 6712390,
    },
    rinkeby: {
      provider: rinkebyWallet.getProvider,
      from: '0xe0020107ea4ce4a3d7223b82588e44bb7068f5ea',
      network_id: 4,
      gas: 6712390, // Gas limit used for deploys
    },
  },
  mocha: {
    reporter: process.env.CI ? 'mocha-multi' : 'spec',
  },
  solc: {
    optimizer: {
      enabled: true,
      runs: 200,
    },
  },
};
