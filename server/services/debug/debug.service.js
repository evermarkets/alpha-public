/* eslint-disable no-param-reassign */

const config = require('config');

const chainMod = require('../../helpers/chain');
const sampleData = require('../../helpers/sampleData');
const auction = require('../../../common/auction');

const { chain } = chainMod;

function resetDatabase(app) {
  const sequelizeClient = app.get('sequelizeClient');
  Promise.resolve()
    .then(() => sampleData.emptyTables(sequelizeClient,
      ['orders', 'auctions', 'products', 'syndicates']))
    .then(() => sampleData.seedTablesIfEmpty(sequelizeClient, false))
}

function clearOrders(app) {
  const sequelizeClient = app.get('sequelizeClient');
  Promise.resolve()
    .then(() => sampleData.emptyTables(sequelizeClient,
      ['orders', 'auctions']))
    .then(() => sampleData.seedTablesIfEmpty(sequelizeClient, true));
}

async function setEVRRate(currency, fxRate) {
  const txHash = await chain.setEVRRate(currency, fxRate);
  return txHash;
}

module.exports = function () {
  const app = this;
  app.use('/debug/resetDatabase', {
    find() {
      return resetDatabase(app);
    },
  });

  app.use('/debug/clearOrders', {
    find() {
      return clearOrders(app);
    },
  });

  app.use('/debug/setEVRRate/:currency/:fxRate', {
    find(params) {
      return setEVRRate(params.query.currency, params.query.fxRate);
    },
  });

  app.use('/debug/web3NetworkVersion', {
    find() {
      return Promise.resolve(
        config.web3_provider.network_id,
      );
    },
  });

  app.service('/debug/setEVRRate/:currency/:fxRate').hooks({ before: (hook) => {
    // This `before` hook is necessary to support both REST and Socket.io
    // clients for this service. With Socket.IO, the route params come in
    // in the query, so we just use query params - and convert standard REST
    // route params to query params.
    // https://legacy.docs.feathersjs.com/middleware/routing.html#nested-routes
    Object.assign(hook.params, hook.params.route);
    if (hook.params.currency) {
      hook.params.query.currency = hook.params.currency;
    }

    if (hook.params.fxRate) {
      hook.params.query.fxRate = hook.params.fxRate;
    }
  }});
};
