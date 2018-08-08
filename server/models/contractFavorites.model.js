const Sequelize = require('sequelize');

module.exports = function (sequelizeClient) {
  const contractFavorites = sequelizeClient.define('contractFavorites', {
    id: {
      type: Sequelize.BIGINT(20),
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
    },
    userAddress: {
      type: Sequelize.CHAR(42),
      allowNull: false,
      unique: 'compositeIndex',
    },
    productId: {
      type: Sequelize.BIGINT(20),
      allowNull: false,
      unique: 'compositeIndex',
    },
  }, {
    // no updatedAt, createdAt columns
    timestamps: false,
  });

  return contractFavorites;
};
