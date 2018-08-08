const Sequelize = require('sequelize');

module.exports = function (sequelizeClient) {
  const auctions = sequelizeClient.define('auctions', {
    id: {
      type: Sequelize.BIGINT(20),
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
    },
    productName: {
      type: Sequelize.STRING(256),
      allowNull: false,
    },
    price: {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
    },
    volume: {
      type: Sequelize.DECIMAL(10, 4),
      allowNull: true,
    },
    endedAt: {
      type: Sequelize.DATE,
      allowNull: true,
    },
  });

  return auctions;
};
