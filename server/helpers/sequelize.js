const config = require('config');
const Sequelize = require('sequelize');

const sampleData = require('./sampleData');

module.exports = function () {
  const app = this;
  const sequelizeClient = new Sequelize(
    `mysql://${config.database.username}:${config.database.password}@${config.database.host}:${config.database.port}/${config.database.name}`, {
      dialect: 'mysql',
      dialectOptions: { decimalNumbers: true },
      logging: false,
    });
  const oldSetup = app.setup;

  app.set('sequelizeClient', sequelizeClient);

  app.setup = function (...args) {
    const result = oldSetup.apply(this, args);

    // Set up data relationships
    const { models } = sequelizeClient;
    Object.keys(models).forEach((name) => {
      if ('associate' in models[name]) {
        models[name].associate(models);
      }
    });

    // Sync to the database
    sequelizeClient.sync()
      .then(() => {
        sampleData.seedTablesIfEmpty(sequelizeClient);
      });

    return result;
  };
};
