
/* eslint no-param-reassign: 0 */

const debug = require('debug')('service:index');
const config = require('config');

const orders = require('./orders/orders.service');
const products = require('./products/products.service');
const auctions = require('./auctions/auctions.service');
const contractFavorites = require('./contractFavorites/contractFavorites.service');
const syndicates = require('./syndicates/syndicates.service');
const syndicateProducts = require('./syndicateProducts/syndicateProducts.service');
const execService = require('./exec/exec.service');
const debugService = require('./debug/debug.service');

module.exports = function () {
  const app = this;

  // configure services
  app.configure(products);
  app.configure(orders);
  app.configure(auctions);
  app.configure(contractFavorites);
  app.configure(syndicates);
  app.configure(syndicateProducts);
  app.configure(debugService);
  app.configure(execService);

  // get client config file
  app.use('/config', {
    get() {
      return Promise.resolve(config.clientConfig);
    },
  });

  debug('Config complete');
};
