/* eslint no-undef: 0 */

const Sequelize = require('sequelize');

const products = require('../server/models/products.model');
const syndicateProducts = require('../server/models/syndicateProducts.model');
const auctions = require('../server/models/auctions.model');
const chain = require('../common/chain');
const utils = require('./demo_utils');

const FutureFactory = artifacts.require('../contracts/FutureFactory.sol');
const Future = artifacts.require('../contracts/Future.sol');
const CentralizedOracle = artifacts.require('CentralizedOracle');

const yahooFinance = require('yahoo-finance');
const BigNumber = require('bignumber.js');
const moment = require('moment-timezone');
const business = require('moment-business');

async function main() {
  // init db connection
  const sequelizeClient = utils.initDB();

  // define models
  products(sequelizeClient);
  syndicateProducts(sequelizeClient);
  auctions(sequelizeClient);

  const expiredProductNames = await getExpiredProducts(sequelizeClient.models.products);

  const expiredFutures = await getFutures(expiredProductNames);
  await Promise.all(expiredFutures.map(expireFuture));
  await utils.forEachInSequence(expiredFutures, settleFuture);

  // create contract for tomorrow
  await deployTomorrowsProducts(sequelizeClient);

  sequelizeClient.close();
}

async function isFutureDeployed(productName) {
  return web3.toDecimal(await chain(web3).getFutureAddress(productName)) !== 0;
}

function getNextExpiry() {
  // expire dailies at 4pm Eastern
  const closeTime = moment.tz('16:00', 'HH:mm', 'America/New_York').subtract(1, 'days');
  while (closeTime.isBefore(moment()))
    business.addWeekDays(closeTime, 1);
  return closeTime;
}

async function deployTomorrowsProducts(sequelizeClient) {
  const nextExpiry = getNextExpiry();
  const productName = `ES${nextExpiry.format('YYYYMMDD')}`;
  const creatorAddress = web3.currentProvider.addresses[0];

  // 1. Create product in DB if it doesn't already exist.
  let existingProduct = await sequelizeClient.models.products.find(
    { where: { name: productName } });
  if (!existingProduct) {
    await sequelizeClient.models.products.create({
      name: productName,
      longName: 'E-mini S&P 500 Future',
      expiry: nextExpiry,
      creatorAddress,
      tags: 'equity_index',
      demoDisplayOnly: false,
    });
    console.log('created product', productName, 'in db');
    existingProduct = await sequelizeClient.models.products.find(
      { where: { name: productName } });
    await sequelizeClient.models.syndicateProducts.create({
      key: 'default',
      productId: existingProduct.id,
      leverageMult: 1,
    });
    console.log('linked default syndicate to', productName, 'in db');
  }

  // 2. Create non-expired auction for this product if it doesn't already exist.
  const activeAuction = await utils.getActiveAuction(sequelizeClient.models.auctions, productName);
  if (!activeAuction) {
    await sequelizeClient.models.auctions.create({ productName });
    console.log('created new auction for', productName, 'in db');
  }

  // 3. Deploy future for this product if it's not already deployed.
  const isDeployed = await isFutureDeployed(productName);
  if (!isDeployed) {
    const tx = await chain(web3).createFuture(productName,
      nextExpiry.unix(), 2500, 2000, 5000, 1, 50)
      .catch(console.error);

    console.log('deploying', productName, tx);

    // wait for transaction
    await chain(web3).getTransactionReceipt(tx);

    console.log('deployed', productName);

    // 4. Deposit contract backstop.
    const tx2 = await chain(web3).depositForBackstop(productName, 10000);

    // wait for transaction so the 3x approve()s don't go in together first
    // before the deposit()s
    await chain(web3).getTransactionReceipt(tx2);
  }
}

async function getExpiredProducts(productsDB) {
  const productList = await productsDB.findAll({
    where: { expiry: { [Sequelize.Op.lt]: new Date() } },
  });
  return productList.map(p => p.name);
}

async function getFutures(productNames) {
  const deployedFutureNames = [];

  // Filter out all the products that haven't been deployed.
  await Promise.all(productNames.map(async (pn) => {
    const isDeployed = await isFutureDeployed(pn);
    if (isDeployed)
      deployedFutureNames.push(pn);
    else
      console.log('skipping', pn, '(not deployed)');
  }));

  const ff = await FutureFactory.deployed();
  return Promise.all(deployedFutureNames.map(async (pn) => {
    const fAddr = await ff.futures(pn);
    const f = await Future.at(fAddr);
    f.productName = pn;
    return f;
  }));
}

async function expireFuture(future) {
  const alreadySettled = await future.is_settled();
  if (!alreadySettled) {
    await future.expire().catch(console.error);
    console.log('expired', future.productName);
  }
}

async function settleFuture(future) {
  const alreadySettled = await future.is_settled();
  if (!alreadySettled) {
    let price;

    const oracle = await CentralizedOracle.at(await future.get_oracle());
    if (await oracle.isOutcomeSet()) {
      price = await oracle.getOutcome();
    } else {
      price = await utils.tryUntilSuccess(yahooFinance.quote, [{ symbol: '^GSPC', modules: ['price'] }],
        3, 'Could not get S&P price.')
        .then(p => p.price.regularMarketPrice);
      // TODO(rogs): will we always be able to send the transaction from the owner?
      const owner = await oracle.owner();
      await oracle.setOutcome.sendTransaction(new BigNumber(price).times(1e18), { from: owner });
    }

    console.log('settling', future.productName, 'at', price);

    await future.settle().catch(console.error);

    console.log('settled', future.productName);

    // Withdraw EVR from expired contract backstop.
    const excessBackstop = await chain(web3).getExcessBackstopEVR(future.productName);

    console.log(`withdrawing ${excessBackstop} backstop from ${future.productName}`);
    if (excessBackstop.toNumber() > 0)
      chain(web3).withdrawForBackstop(future.productName, excessBackstop).catch(console.error);
  }
}

module.exports = main;
