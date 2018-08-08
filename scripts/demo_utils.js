/* eslint no-plusplus: 0 */

const Sequelize = require('sequelize');
const yahooFinance = require('yahoo-finance');

const config = require('../config/default');

function initDB() {
  // init db connection
  const sequelizeClient = new Sequelize(
    `mysql://${config.database.username}:${config.database.password}@${config.database.host}:${config.database.port}/${config.database.name}`, {
      dialect: 'mysql',
      dialectOptions: { decimalNumbers: true },
      logging: false,
    });
  return sequelizeClient;
}

async function tryUntilSuccess(asyncFunction, args, maxTries, errorMessage) {
  let result;
  let counter = 0;
  while (maxTries ? counter < maxTries : true) {
    try {
      result = await asyncFunction(...args); // eslint-disable-line no-await-in-loop
    } catch (e) {
      counter++;
    }
    if (result)
      return result;
  }
  throw Error(errorMessage);
}

function getLatestSPPrice() {
  return yahooFinance.quote({ symbol: '^GSPC', modules: ['price'] })
    .then(p => p.price.regularMarketPrice);
}

async function getLatestSPPriceSafe() {
  return tryUntilSuccess(getLatestSPPrice, {}, 3, 'Could not get S&P price.');
}

async function getActiveFutures(productsDB) {
  const productList = await productsDB.findAll({
    where: { expiry: { [Sequelize.Op.gt]: new Date() } },
  });
  return productList.map(p => p.name);
}

async function getActiveAuction(auctionsDB, name) {
  // duplicates code in the app (auction.py) [but leaves out lastPrice]
  const auction = await auctionsDB.find({
    where: {
      productName: name,
      endedAt: null,
    },
  });
  return auction;
}

async function forEachInSequence(promises, asyncFunction) {
  for (const p of promises) {
    await asyncFunction(p); // eslint-disable-line no-await-in-loop
  }
}

module.exports = {
  initDB,
  getLatestSPPriceSafe,
  getActiveFutures,
  getActiveAuction,
  forEachInSequence,
  tryUntilSuccess,
};
