const createModel = require('../../models/contractFavorites.model');
const service = require('feathers-sequelize');

module.exports = function () {
  const app = this;
  const sequelizeClient = app.get('sequelizeClient');

  const options = {
    Model: createModel(sequelizeClient),
  };

  app.use('/contractFavorites', service(options));
};
