const Sequelize = require('sequelize');

module.exports = function (sequelizeClient) {
  const products = sequelizeClient.define('products', {
    id: {
      type: Sequelize.BIGINT(20),
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
    },
    // TODO: auto-generate the hash from the id
    // hash: { type: Sequelize.CHAR(32), allowNull: false },
    name: {
      type: Sequelize.STRING(256),
      allowNull: false,
      unique: true,
    },
    longName: {
      type: Sequelize.STRING(256),
      allowNull: false,
    },
    creatorAddress: {
      type: Sequelize.CHAR(42),
      allowNull: false,
    },
    expiry: {
      type: Sequelize.DATE,
      allowNull: false,
    },
    tags: {
      type: Sequelize.STRING(256),
      allowNull: false,
    },
    demoDisplayOnly: {
      type: Sequelize.BOOLEAN,
      allowNull: false,
    },
  });

  return products;
};
