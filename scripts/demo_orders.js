/* eslint no-undef: 0 */

/* Creates (or updates) BUY and SELL orders for futures contracts with known
prices. */

const products = require('../server/models/products.model');
const auctions = require('../server/models/auctions.model');
const orders = require('../server/models/orders.model');

const utils = require('./demo_utils');

const TRADER_ADDRESS = web3.currentProvider.addresses[0];
const TRADER_QTY = 10;
const TRADER_SPREAD = 0.5;

async function getLatestPrice(name) {
  if (name.startsWith('ES2')) {
    // update orders for the daily ES contracts, but not the quarterly contract
    // (dailies will be named 'ES2017xxxx')
    return utils.getLatestSPPriceSafe();
  }

  return null;
}

async function updateOrders(auctionsDB, ordersDB, name, px, qty, spread) {
  const a = await utils.getActiveAuction(auctionsDB, name);
  const order = {
    productName: name,
    syndicateKey: 'default',
    auctionId: a.id,
    orderType: 'LMT',
    quantityFilled: 0,
    timeInForce: 'GTC',
    traderAddress: TRADER_ADDRESS,
  };

  const buy = {
    quantity: qty,
    price: px - (spread / 2),
    ...order,
  };

  const sell = {
    quantity: -qty,
    price: px + (spread / 2),
    ...order,
  };

  const existingOrders = await ordersDB.findAll({
    where: {
      productName: name,
      syndicateKey: 'default',
      timeInForce: 'GTC',
      traderAddress: TRADER_ADDRESS,
    },
  });

  if (existingOrders.length === 0)
    await ordersDB.bulkCreate([buy, sell]);
  else {
    await existingOrders[0].updateAttributes(buy);
    await existingOrders[1].updateAttributes(sell);
  }
}

async function updateFuture(auctionsDB, ordersDB, name) {
  const px = await getLatestPrice(name);
  if (px) {
    console.log(`${name}: Creating market around ${px}`);
    await updateOrders(
      auctionsDB,
      ordersDB,
      name,
      px,
      TRADER_QTY,
      TRADER_SPREAD);
  }
}

async function main() {
  const sequelizeClient = utils.initDB();

  // define models
  products(sequelizeClient);
  auctions(sequelizeClient);
  orders(sequelizeClient);

  // get active futures
  const activeFutureNames = await utils.getActiveFutures(
    sequelizeClient.models.products);

  // get price and update orders for each future
  await Promise.all(
    activeFutureNames.map(name => updateFuture(
      sequelizeClient.models.auctions,
      sequelizeClient.models.orders,
      name)),
  );

  sequelizeClient.close();
}

module.exports = main;
