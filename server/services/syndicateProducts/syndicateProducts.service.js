const createModel = require('../../models/syndicateProducts.model');
const service = require('feathers-sequelize');

module.exports = function () {
  const app = this;
  const sequelizeClient = app.get('sequelizeClient');

  const options = {
    Model: createModel(sequelizeClient),
  };

  app.use('/syndicateProducts', service(options));
};
