/* eslint no-undef: 0 */

const BaseFuture = artifacts.require('./BaseFuture.sol');
const FutureInternals = artifacts.require('./FutureInternals.sol');
const MarginProvider = artifacts.require('./MarginProvider.sol');
const MarginProviderInternals = artifacts.require('./MarginProviderInternals.sol');

module.exports = function (deployer) {
  deployer.deploy(BaseFuture);

  deployer.link(BaseFuture, FutureInternals);
  deployer.deploy(FutureInternals);

  deployer.link(BaseFuture, MarginProviderInternals);
  deployer.deploy(MarginProviderInternals);

  deployer.link(BaseFuture, MarginProvider);
  deployer.link(MarginProviderInternals, MarginProvider);
};
