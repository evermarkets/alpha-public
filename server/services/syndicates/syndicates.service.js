const createModel = require('../../models/syndicates.model');
const service = require('feathers-sequelize');

const hooks = require('./syndicates.hooks');

module.exports = function () {
  const app = this;
  const sequelizeClient = app.get('sequelizeClient');

  const options = {
    Model: createModel(sequelizeClient),
  };

  app.use('/syndicates', service(options));

  const syndicatesService = app.service('/syndicates');

  syndicatesService.hooks(hooks);
};
