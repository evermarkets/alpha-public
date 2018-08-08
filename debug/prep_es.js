const EVRToken = artifacts.require('../contracts/EVRToken.sol');
const FutureFactory = artifacts.require('../contracts/FutureFactory.sol');

const chainMod = require('../common/chain');

async function main() {
  const owner = web3.eth.accounts[0];
  const t1 = web3.eth.accounts[1];
  const t2 = web3.eth.accounts[2];
  const lender = web3.eth.accounts[3];

  const DEFAULT = 'default';
  const PRODUCT = 'ESM2018';

  const chain = chainMod(web3);

  await chain.mintEVR(owner, 100000);
  await chain.mintEVR(t1, 10000);
  await chain.mintEVR(t2, 10000);
  await chain.mintEVR(lender, 10000);

  await chain.setEVRRate('USD', 1);

  await chain.depositForBackstop(PRODUCT, 10000);
  await chain.deposit(DEFAULT, 3000, t1);
  await chain.deposit(DEFAULT, 3000, t2)

  // await chain.withdraw(DEFAULT, 500, t1);
  // await chain.withdraw(DEFAULT, 500, t2);
}

module.exports = main;
