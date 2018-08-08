/* eslint-disable no-param-reassign */

const { chain } = require('../../helpers/chain');
const auction = require('../../../common/auction');
const orders = require('../../../common/orders');

async function runAuction(app, productName) {
  const openOrders = await orders.openOrders(app, productName, null);
  return auction.runAuction(openOrders);
}

async function verifyCallAuction(app, productName) {
  const auctionData = await runAuction(app, productName);

  // don't run an empty auction
  if (auctionData.totalVolume === 0)
    return { success: false, message: 'totalVolume == 0' };

  // check to see if we can add trades
  const result = await chain.verifyAddTrades(productName, auctionData);

  return result;
}

async function callAuction(app, productName) {
  const a = await auction.getCurrentAuction(app, productName);
  const auctionData = await runAuction(app, productName);

  // don't run an empty auction
  if (auctionData.totalVolume === 0)
    return null;

  // record trades on contracts
  const tx = await chain
    .addTrades(productName, auctionData)
    .catch(console.error);

  // update order quantities after auction
  auction.updateOrders(app, auctionData.orderIds, auctionData.sizes);

  // record auction price & quantity in database
  app.service('auctions')
    .patch(a.id, {
      price: auctionData.auctionPrice,
      volume: auctionData.totalVolume / 2,
      endedAt: new Date(),
    });

  // create next auction record for product
  app.service('auctions')
    .create({ productName });

  // pass tx hash along
  return tx;
}

module.exports = function () {
  const app = this;
  app.use('/exec/view/:productName', {
    find(params) {
      return runAuction(app, params.query.productName);
    },
  });

  app.use('/exec/call/:productName', {
    find(params) {
      return callAuction(app, params.query.productName);
    },
  });

  app.use('/exec/verifyCall/:productName', {
    find(params) {
      return verifyCallAuction(app, params.query.productName);
    },
  });

  app.service('/exec/view/:productName').hooks({
    before: (hook) => {
      // These `before` hook are necessary to support both REST and Socket.io
      // clients for this service. With Socket.IO, the route params come in
      // in the query, so we just use query params - and convert standard REST
      // route params to query params.
      // https://legacy.docs.feathersjs.com/middleware/routing.html#nested-routes
      Object.assign(hook.params, hook.params.route);
      if (hook.params.productName) {
        hook.params.query.productName = hook.params.productName;
      }
    },
  });

  app.service('/exec/call/:productName').hooks({
    before: (hook) => {
      Object.assign(hook.params, hook.params.route);
      if (hook.params.productName) {
        hook.params.query.productName = hook.params.productName;
      }
    },
  });

  app.service('/exec/verifyCall/:productName').hooks({
    before: (hook) => {
      Object.assign(hook.params, hook.params.route);
      if (hook.params.productName) {
        hook.params.query.productName = hook.params.productName;
      }
    },
  });
};
