const Sequelize = require('sequelize');

module.exports = function (sequelizeClient) {
  const orders = sequelizeClient.define('orders', {
    id: {
      type: Sequelize.BIGINT(20),
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
    },
    productName: {
      // TODO(AustinC): We should really be storing ids, and have associations
      // defined below - but I'm denormalizing for ease of coding right now.
      type: Sequelize.STRING(256),
      allowNull: false,
    },
    syndicateKey: {
      type: Sequelize.STRING(256),
      allowNull: false,
    },
    auctionId: {
      type: Sequelize.BIGINT(20),
      allowNull: false,
    },
    orderType: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    traderAddress: {
      type: Sequelize.CHAR(42),
      allowNull: false,
    },
    quantity: {
      type: Sequelize.DECIMAL(10, 4),
      allowNull: false,
    },
    quantityFilled: {
      type: Sequelize.DECIMAL(10, 4),
      allowNull: false,
    },
    price: {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
    },
    timeInForce: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    flags: {
      type: Sequelize.STRING,
      allowNull: true,
    },
    canceledAt: {
      type: Sequelize.DATE,
      allowNull: true,
    },
  });

  return orders;
};
