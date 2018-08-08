/* eslint no-undef: 0 */

const BaseFuture = artifacts.require('./BaseFuture.sol');
const EVRToken = artifacts.require('./EVRToken.sol');
const ExchangeRates = artifacts.require('./oracles/ExchangeRates.sol');
const FutureFactory = artifacts.require('./FutureFactory.sol');
const FutureInternals = artifacts.require('./FutureInternals.sol');
const MarginProviderInternals = artifacts.require('./MarginProviderInternals.sol');

module.exports = function (deployer, network, accounts) {
  deployer.link(BaseFuture, FutureFactory);
  deployer.link(FutureInternals, FutureFactory);
  deployer.link(MarginProviderInternals, FutureFactory);

  deployer.deploy(ExchangeRates, accounts[0])
    .then(() => ExchangeRates.deployed())
    .then(rates => deployer.deploy(EVRToken)
      .then(() => EVRToken.deployed())
      .then(evr => deployer.deploy(FutureFactory, evr.address, rates.address)));
};
