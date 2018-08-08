/* Server-side Rinkeby accounts */

const HDWalletProvider = require('./hdWalletProvider');

const addresses = [
  '0xe0020107ea4ce4a3d7223b82588e44bb7068f5ea',
  '0x03ab48c150680bab45595b0f707d4ae681780b95',
  '0x1dec83cde509c68cb51eb91edc58e53582113233',
  '0x16c203a3c594de8e729af034ba8c55df91da4a52',
];

const privateKeys = [
  // redacted
];

const rinkebyInfuraToken = 'rDwBRxoBtDZkK0MzJlJE';

function getProvider() {
  return new HDWalletProvider(
    addresses,
    privateKeys,
    `https://rinkeby.infura.io/${rinkebyInfuraToken}`,
  );
}

module.exports = {
  getProvider,
};
