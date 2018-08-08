/* eslint no-undef: 0, no-await-in-loop: 0 */

/* Calls auction for any active future that has crossing orders. */

const Sequelize = require('sequelize');

const products = require('../server/models/products.model');
const auctions = require('../server/models/auctions.model');
const orders = require('../server/models/orders.model');

const auction = require('../common/auction');
const chain = require('../common/chain')(web3);

const utils = require('./demo_utils');

async function getOpenOrders(ordersDB, auctionId, name) {
  // duplicates code in the app (orders.py)
  const openOrders = await ordersDB.findAll({
    where: {
      [Sequelize.Op.or]: [
        {
          timeInForce: 'NXT',
          productName: name,
          canceledAt: null,
          auctionId,
        },
        {
          timeInForce: 'GTC',
          productName: name,
          canceledAt: null,
        },
      ],
    },
  });

  return openOrders.filter(o => (o.quantity - o.quantityFilled) !== 0);
}

async function runAuctionForFuture(auctionsDB, ordersDB, name) {
  // duplicates code in the app (exec.service.py)
  const aa = await utils.getActiveAuction(auctionsDB, name);
  if (!aa) return; // no active auction - nothing to do

  const openOrders = await getOpenOrders(ordersDB, aa.id, name);
  const auctionData = auction.runAuction(openOrders);
  const volume = auctionData.sizes.reduce((a, b) => a + Math.abs(b), 0) / 2;
  if (volume > 0) {
    console.log(`${name}: Calling auction ${aa.id} (${volume} crossed at ${auctionData.auctionPrice})`);
    await callAuction(auctionsDB, ordersDB, name, aa.id, auctionData, volume);
  }
}

async function callAuction(auctionsDB, ordersDB, name, auctionId, auctionData, volume) {
  // check if calling the auction will succeed
  const { success, message } = await chain.verifyAddTrades(name, auctionData);
  if (!success) {
    console.log('Cannot Call Auction:', message);
    return;
  }

  // duplicates code in the app (exec.service.py)
  // add trades to contract
  chain.addTrades(name, auctionData);

  // update order quantities after auction
  await updateOrderQuantities(ordersDB, auctionData.orderIds, auctionData.sizes);

  // record auction price & quantity in database
  const a = await auctionsDB.find({ where: { id: auctionId } });
  await a.updateAttributes({
    price: auctionData.auctionPrice,
    endedAt: new Date(),
    volume,
  });

  // create next auction record for product
  await auctionsDB.create({ productName: name });
}

async function updateOrderQuantities(ordersDB, orderIds, sizes) {
  // duplicates code in the app (auction.py)
  for (const oid of orderIds.entries()) {
    const idx = oid[0];
    const orderId = oid[1];
    const size = sizes[idx];

    const o = await ordersDB.find({ where: { id: orderId } });
    await o.updateAttributes({
      quantityFilled: o.quantityFilled + size,
    });
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

  // run auction on each demo future
  await Promise.all(
    activeFutureNames
      .filter(name => name.startsWith('ES2'))
      .map(name => runAuctionForFuture(
        sequelizeClient.models.auctions,
        sequelizeClient.models.orders,
        name)),
  );

  sequelizeClient.close();
}

module.exports = main;
