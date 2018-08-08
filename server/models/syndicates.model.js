const Sequelize = require('sequelize');

module.exports = function (sequelizeClient) {
  const syndicates = sequelizeClient.define('syndicates', {
    id: {
      type: Sequelize.BIGINT(20),
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
    },
    key: {
      type: Sequelize.STRING(256),
      allowNull: false,
      unique: true,
    },
    creatorAddress: {
      type: Sequelize.CHAR(42),
      allowNull: false,
    },
  });

  return syndicates;
};
