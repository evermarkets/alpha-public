const createModel = require('../../models/orders.model');
const service = require('feathers-sequelize');

const hooks = require('./orders.hooks');

module.exports = function () {
  const app = this;
  const sequelizeClient = app.get('sequelizeClient');

  const options = {
    Model: createModel(sequelizeClient),
  };

  app.use('/orders', service(options));

  const ordersService = app.service('/orders');

  ordersService.hooks(hooks);
};
