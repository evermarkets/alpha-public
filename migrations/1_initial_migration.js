/* eslint no-undef: 0 */

const Migrations = artifacts.require('./Migrations.sol');

module.exports = function (deployer) {
  deployer.deploy(Migrations);
};
