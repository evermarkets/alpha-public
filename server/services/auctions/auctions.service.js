const createModel = require('../../models/auctions.model');
const service = require('feathers-sequelize');

const hooks = require('./auctions.hooks');

module.exports = function () {
  const app = this;
  const sequelizeClient = app.get('sequelizeClient');

  const options = {
    Model: createModel(sequelizeClient),
  };

  app.use('/auctions', service(options));

  const auctionsService = app.service('/auctions');

  auctionsService.hooks(hooks);
};
