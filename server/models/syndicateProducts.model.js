const Sequelize = require('sequelize');

module.exports = function (sequelizeClient) {
  const syndicateProducts = sequelizeClient.define('syndicateProducts', {
    id: {
      type: Sequelize.BIGINT(20),
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
    },
    key: {
      type: Sequelize.STRING(256),
      allowNull: false,
      unique: 'compositeIndex',
    },
    productId: {
      type: Sequelize.BIGINT(20),
      allowNull: false,
      unique: 'compositeIndex',
    },
    leverageMult: {
      type: Sequelize.FLOAT,
      allowNull: false,
    },
  });

  return syndicateProducts;
};
