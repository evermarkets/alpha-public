// A Feathers hook which enriches Product data with info from the blockchain

const moment = require('moment');
const Promise = require('bluebird');

const { chain } = require('../../helpers/chain');
const formatters = require('../../../common/formatters');

module.exports = async function Enricher(context) {
  if (context.params.decorate) {
    // This parameter reassign is required by Feathers
    // eslint-disable-next-line no-param-reassign
    context.result = await Promise.all(context.result.map(p => enrichProducts(p)));
  }
};

// Hoist the 'decorate' param out of 'query' and up to 'params', because
// Feathers doesn't support custom non-query params, and Sequelize gets
// confused by custom query params
module.exports.hider = function Hider(context) {
  // This parameter reassign is required by Feathers
  // eslint-disable-next-line no-param-reassign
  context.params.decorate = context.params.query.decorate;
  // eslint-disable-next-line no-param-reassign
  delete context.params.query.decorate;
};

async function enrichProducts(product) {
  const balances = product.demoDisplayOnly
    ? getBalancesForDemo(product)
    : await getRealBalances(product);

  return Object.assign({}, product, balances);
}

async function getRealBalances(product) {
  const { name } = product;

  const balances = await Promise.props({
    fxRate: chain.getEVRRate('USD'),
    excessBackstop: chain.getExcessBackstopEVR(name),
    requiredBackstop: chain.getRequiredBackstopUSD(name),
    lastPrice: chain.getLastPrice(name),
    availableFees: chain.getAvailableCreatorFeesEVR(name),
    openInterest: chain.getOpenInterest(name),
    params: chain.getFutureParams(name),
  });

  return formatBalances(product, balances);
}

function formatBalances(product, balances) {
  const {
    fxRate,
    excessBackstop,
    requiredBackstop,
    lastPrice,
    availableFees,
    openInterest,
    params,
  } = balances;

  const availableFeesNum = formatters.toNumber(availableFees);
  const feePerContractNum = formatters.toNumber(params.feePerContract);
  const openInterestNum = formatters.toNumber(openInterest);
  const excessBackstopNum = formatters.toNumber(excessBackstop);
  const requiredBackstopNum = formatters.toNumber(requiredBackstop);
  const totalBackstopNum = excessBackstopNum + (requiredBackstopNum * fxRate);
  const initialMargin = formatters.toNumber(params.initialMargin);
  const maintenanceMargin = formatters.toNumber(params.maintenanceMargin);
  const multiplier = formatters.toNumber(params.multiplier);

  return {
    availableFees: availableFeesNum,
    feePerContract: feePerContractNum,
    excessBackstop: excessBackstopNum,
    backstopString: backstopString(product.isExpired, totalBackstopNum, excessBackstopNum),
    feesString: feesString(feePerContractNum),
    availableFeesString: availableFeesString(availableFeesNum),
    lastPriceString: lastPriceString(lastPrice),
    expiryString: expiryString(product.expiry),
    openInterestString: openInterestString(openInterestNum, multiplier, lastPrice),
    initialMargin,
    maintenanceMargin,
    multiplier,
    marginRequirementString: marginRequirementString(
      initialMargin, maintenanceMargin),
  };
}

function getBalancesForDemo(product) {
  return {
    availableFees: 0,
    feePerContract: 1,
    excessBackstop: 0,
    backstopString: backstopString(product.isExpired, 0, 0),
    feesString: feesString(1),
    availableFeesString: availableFeesString(0),
    lastPriceString: lastPriceString(0),
    expiryString: expiryString(product.expiry),
    openInterestString: openInterestString(0, 0, 0),
    marginRequirementString: '$2,500 Initial / $2,000 Maintenance',
    multiplier: 50,
  };
}

const backstopString = (isExpired, totalBackstop, excessBackstop) => {
  if (totalBackstop === 0)
    return 'None';
  if (isExpired)
    return `${formatters.formatDecimal(excessBackstop, 0)} EMX to withdraw`;
  return `${formatters.formatDecimal(totalBackstop, 0)} EMX (${formatters.formatDecimal(excessBackstop, 0)} EMX excess)`;
};

const feesString = feePerContract => `$${formatters.formatDecimal(feePerContract, 0)} / contract`;
const availableFeesString = availableFees => ((availableFees > 0) ? `${formatters.formatDecimal(availableFees)} EMX` : 'None');
const expiryString = expiry => moment.utc(expiry).format('DD-MMM-YYYY HH:mm');
const lastPriceString = lastPrice => ((lastPrice > 0) ? formatters.formatDecimal(formatters.toNumber(lastPrice)) : 'None');
const openInterestString = (openInterest, multiplier, lastPrice) => (
  `${formatters.formatDecimal(openInterest, 1)} contracts / ${formatters.formatDecimal(openInterest * multiplier * lastPrice, 0)} USD`
);
const marginRequirementString = (initialMargin, maintenanceMargin) => (
  `$${formatters.formatDecimal(initialMargin, 0)} Initial / $${formatters.formatDecimal(maintenanceMargin, 0)} Maintenance`
);
