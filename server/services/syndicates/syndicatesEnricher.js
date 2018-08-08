// A Feathers hook which enriches Syndicate data with info from the blockchain

const Promise = require('bluebird');
const moment = require('moment');

const { chain } = require('../../helpers/chain');
const formatters = require('../../../common/formatters');

const DEFAULT = 'default';

/* eslint-disable no-param-reassign */
module.exports = async function Enricher(context) {
  if (context.params.decorate) {
    [
      context.fxRate,
      context.favoriteIds,
      context.productIdMap,
      context.syndicateProducts,
    ] = await Promise.all(context.wait);

    context.result = await Promise.all(context.result.map(s => enrichSyndicate(context, s)));
  }
};

// **** Before Hooks **** //

// Hoist the 'decorate' param out of 'query' and up to 'params', because
// Feathers doesn't support custom non-query params, and Sequelize gets
// confused by custom query params
module.exports.hider = function Hider(context) {
  hideCustomParam(context, 'decorate');
  hideCustomParam(context, 'userAddress');
};

function hideCustomParam(context, param) {
  context.params[param] = context.params.query[param];
  delete context.params.query[param];
}

// kick off a bunch of async requests we will want in After enricher
module.exports.prepare = function Prepare(context) {
  if (context.params.decorate) {
    context.wait = [
      chain.getEVRRate('USD'),
      getFavoriteIds(context, context.params.userAddress),
      getProductIdMap(context),
      context.app.service('syndicateProducts').find({}),
    ];
  }
};
/* eslint-enable */

async function getFavoriteIds(context, userAddress) {
  // get ids of user's favorite contracts
  const Favorites = context.app.service('contractFavorites');
  const favoriteIds = new Set(
    (await Favorites.find({ query: { userAddress } }))
      .map(f => f.productId));
  return favoriteIds;
}

async function getProductIdMap(context) {
  // get map from product id to product
  const productsService = context.app.service('products');
  const products = await productsService.find({
    query: {
      $select: [
        'id', 'name', 'longName', 'creatorAddress', 'expiry', 'demoDisplayOnly',
      ],
    },
  });
  const map = {};
  products.forEach((p) => { map[p.id] = p; });
  return map;
}

// **** After Hooks **** //

async function enrichSyndicate(context, syndicate) {
  const {
    params: { userAddress },
    fxRate,
    favoriteIds,
    productIdMap,
    syndicateProducts,
  } = context;

  const [deposits, address] = await Promise.all([
    chain.getTotalDepositUSD(syndicate.key, userAddress),
    chain.getMarginProviderAddress(syndicate.key),
  ]);

  const now = moment.utc();
  const enrichedSyndicate = {
    ...syndicate,
    address,
    displayName: (syndicate.key === DEFAULT ? 'Default Account' : `Margin Account (${syndicate.key})`),
    totalDeposit: formatters.toNumber(deposits),
    isMine: syndicate.creatorAddress === userAddress,
    fxRate: formatters.toNumber(fxRate),
    products: syndicateProducts
      .filter(sp => sp.key === syndicate.key)
      .map(sp => ({
        ...productIdMap[sp.productId],
        displayName: productIdMap[sp.productId].name,
        key: sp.key,
        leverageMult: sp.leverageMult,
        isFavorite: favoriteIds.has(sp.productId),
        isExpired: moment.utc(productIdMap[sp.productId].expiry).isBefore(now),
        isMine: productIdMap[sp.productId].creatorAddress === userAddress,
      })),
  };

  const [syndicateProductBalances, syndicateBalances] = await Promise.all([
    Promise.all(enrichedSyndicate.products.map(
      p => getSyndicateProductBalances(
        userAddress,
        enrichedSyndicate.key,
        p.name,
      ))),
    getSyndicateBalances(userAddress, enrichedSyndicate.key),
  ]);

  const productResults = syndicateProductBalances.map(
    p => formatSyndicateProductBalances(enrichedSyndicate, p));

  const results = formatSyndicateBalances(enrichedSyndicate, syndicateBalances, productResults);
  Object.assign(enrichedSyndicate, results);

  for (const [pidx, p] of enrichedSyndicate.products.entries()) {
    Object.assign(p, productResults[pidx]);
  }

  // add favorite products to 1x leverage provider
  if (enrichedSyndicate.key === DEFAULT) {
    const existingProducts = new Set(enrichedSyndicate.products.map(p => p.id));
    for (const p of Object.values(productIdMap)) {
      if (favoriteIds.has(p.id) && !existingProducts.has(p.id)) {
        enrichedSyndicate.products.push({
          ...p,
          ...getEmptySyndicateProductForFavorite(p, now, userAddress),
        });
      }
    }
  }

  return enrichedSyndicate;
}

function getEmptySyndicateProductForFavorite(product, now, userAddress) {
  return {
    ...product,
    key: DEFAULT,
    isFavorite: true,
    isExpired: moment.utc(product.expiry).isBefore(now),
    isMine: product.creatorAddress === userAddress,
    displayName: product.name,
    leverageMult: 1,
    qty: formatters.toNumber(0),
    averageExecutionPrice: formatters.toNumber(0),
    lastPrice: formatters.toNumber(0),
  };
}

function getSyndicateProductBalances(userAddress, key, name) {
  return Promise.all([
    chain.getQty(key, name, userAddress),
    chain.getAverageEntryPrice(key, name, userAddress),
    chain.getMarginProviderFutureParams(key, name),
    chain.getCollectedLenderFeesEVR(key, name),
    // TODO(AustinC): move these to product, not syndicate
    chain.getLastPrice(name),
    chain.getFutureParams(name),
  ]);
}

function formatSyndicateProductBalances(syndicate, product) {
  const [qty, averageExecutionPrice, mpFutureParams, collectedFees,
    lastPrice, { multiplier }] = product;

  const totalFeePerContractNum = formatters.toNumber(mpFutureParams.totalFeePerContract);
  const totalFeesString = `$${formatters.formatDecimal(totalFeePerContractNum, 0)} / contract`;

  return {
    syndicateDisplayName: syndicate.displayName,
    qty: formatters.toNumber(qty),
    multiplier: formatters.toNumber(multiplier),
    averageExecutionPrice: formatters.toNumber(averageExecutionPrice),
    lastPrice: formatters.toNumber(lastPrice),
    initialMargin: formatters.toNumber(mpFutureParams.initialMargin),
    maintenanceMargin: formatters.toNumber(mpFutureParams.maintenanceMargin),
    collectedFees: formatters.toNumber(collectedFees),
    totalFeePerContract: totalFeePerContractNum,
    totalFeesString,
  };
}

function getSyndicateBalances(userAddress, key) {
  return Promise.all([
    chain.getAvailableDepositUSD(key, userAddress),
    chain.getLockedUpDepositUSD(key, userAddress),
    chain.getLenderBalanceEVR(key),
    chain.getAvailableLenderDepositUSD(key),
    chain.getAvailableLenderFeesEVR(key),
  ]);
}

function formatSyndicateBalances(syndicate, syndicateBalances, productResults) {
  const [availableDeposit, lockedUpDeposit, lenderBalance,
    availableLenderBalance, availableFees] = syndicateBalances;

  const lenderBalanceNum = formatters.toNumber(lenderBalance);
  const availableLenderBalanceNum = formatters.toNumber(availableLenderBalance) * syndicate.fxRate;
  const availableDepositNum = formatters.toNumber(availableDeposit);
  const availableFeesNum = formatters.toNumber(availableFees);
  const collectedFees = availableFeesNum + productResults
    .map(r => r.collectedFees)
    .reduce((a, b) => a + b, 0);

  const getCollateralString = (total, available, currency) => {
    if (total === 0)
      return 'None';
    else if (currency === 'USD')
      return `$${formatters.formatDecimal(total, 0)} ($${formatters.formatDecimal(available, 0)} excess)`;
    return `${formatters.formatDecimal(total, 0)} ${currency} (${formatters.formatDecimal(available, 0)} ${currency} excess)`;
  };

  const availableFeesString = (collectedFees > 0) ? `${formatters.formatDecimal(collectedFees)} EMX (${formatters.formatDecimal(availableFeesNum)} EMX available to withdraw)` : 'None';

  return {
    availableDeposit: availableDepositNum,
    lockedUpDeposit: formatters.toNumber(lockedUpDeposit),
    availableLenderBalance: availableLenderBalanceNum,
    collateralString: getCollateralString(syndicate.totalDeposit, availableDepositNum, 'USD'),
    lenderPoolString: getCollateralString(lenderBalanceNum, availableLenderBalanceNum, 'EMX'),
    collectedFees,
    availableFees,
    availableFeesString,
  };
}
