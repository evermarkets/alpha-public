const config = require('config');
const Web3 = require('web3');

const chain = require('../../common/chain');

const rinkebyWallet = require('../utils/rinkebyWallet');

function getProvider() {
  if (config.isProduction)
    return rinkebyWallet.getProvider();
  return new Web3.providers.HttpProvider(
    `http://${config.web3_provider.host}:${config.web3_provider.port}`,
  );
}

function getWeb3() {
  const provider = getProvider();
  return new Web3(provider);
}

// build a server-side web3 object and pass it to the common chain module
module.exports = {
  getWeb3,
  chain: chain(getWeb3()),
};
