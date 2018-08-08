const createModel = require('../../models/products.model');
const service = require('feathers-sequelize');

const hooks = require('./products.hooks');

module.exports = function () {
  const app = this;
  const sequelizeClient = app.get('sequelizeClient');

  const options = {
    Model: createModel(sequelizeClient),
  };

  app.use('/products', service(options));

  const productsService = app.service('/products');

  productsService.hooks(hooks);
};
