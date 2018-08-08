/* eslint no-await-in-loop: 0 */

const contract = require('truffle-contract');

const FutureJson = require('../build/contracts/Future.json');
const MarginProviderJson = require('../build/contracts/MarginProvider.json');
const FutureFactoryJson = require('../build/contracts/FutureFactory.json');
const EVRTokenJson = require('../build/contracts/EVRToken.json');
const ExchangeRatesJson = require('../build/contracts/ExchangeRates.json');

function initContractWrapper(Web3, wrapper) {
  if (typeof artifacts !== 'undefined') { // eslint-disable-line no-undef
    // 'truffle test' scenario
    return artifacts.require(wrapper.contractName); // eslint-disable-line no-undef
  }
  const c = contract(wrapper);
  c.setProvider(Web3.currentProvider);
  // requiring the 'config' package here doesn't compile, so in the HDWalletProvider case,
  // use the address from the provider (since we cannot call synchronous methods). else,
  // use accounts[0].
  const defaultFrom = Web3.currentProvider.address || Web3.eth.accounts[0];
  c.defaults({ from: defaultFrom });
  return c;
}

// singleton for the FutureFactory contract wrapper
const FutureFactory = (() => {
  let instance;

  function createInstance(Web3) {
    const futureFactory = initContractWrapper(Web3, FutureFactoryJson);
    return futureFactory;
  }

  return {
    deployed: (Web3) => {
      if (!instance) {
        instance = createInstance(Web3);
      }
      return instance.deployed();
    },
  };
})();

// singleton for the Future contract wrapper
const Future = (() => {
  let instance;

  function createInstance(Web3) {
    const future = initContractWrapper(Web3, FutureJson);
    return future;
  }

  return {
    at: (Web3, addr) => {
      if (!instance) {
        instance = createInstance(Web3);
      }
      return instance.at(addr);
    },
  };
})();

// singleton for the MarginProvider contract wrapper
const MarginProvider = (() => {
  let instance;

  function createInstance(Web3) {
    const mp = initContractWrapper(Web3, MarginProviderJson);
    return mp;
  }

  return {
    at: (Web3, addr) => {
      if (!instance) {
        instance = createInstance(Web3);
      }
      return instance.at(addr);
    },
  };
})();

// singleton for the EVRToken contract wrapper
const EVRToken = (() => {
  let instance;

  function createInstance(Web3) {
    const token = initContractWrapper(Web3, EVRTokenJson);
    return token;
  }

  return {
    deployed: (Web3) => {
      if (!instance) {
        instance = createInstance(Web3);
      }
      return instance.deployed();
    },
  };
})();

// singleton for the ExchangeRates contract wrapper
const ExchangeRates = (() => {
  let instance;

  function createInstance(Web3) {
    const token = initContractWrapper(Web3, ExchangeRatesJson);
    return token;
  }

  return {
    deployed: (Web3) => {
      if (!instance) {
        instance = createInstance(Web3);
      }
      return instance.deployed();
    },
  };
})();

async function sendTransactionWithGas(Web3, func, ...args) {
  return sendTransactionFromUserWithGas(Web3, func, undefined, ...args);
}

async function sendTransactionFromUserWithGas(Web3, func, fromUser, ...args) {
  const gas = await func.estimateGas(...args);
  // TODO(AustinC): determine why even 1.5x is sometimes not enough to prevent 'revert's.
  const gasLimit = Math.round(1.5 * gas);
  const options = { gas: gasLimit };

  if (fromUser) {
    options.from = fromUser;
  }

  const txHash = await func.sendTransaction(
    ...args, options);

  return txHash;
}

const getEVRPerUSDWei = async Web3 => (await ExchangeRates.deployed(Web3)).rates('USD');

async function getAvailableDepositUSD(Web3, mpKey, userAddress) {
  const mp = await getMarginProvider(Web3, mpKey);
  const evrPerUSDWei = await getEVRPerUSDWei(Web3);
  const availableDepositUSD = await mp.get_available_funds_usd_wei(userAddress, evrPerUSDWei);
  return Web3.fromWei(availableDepositUSD, 'ether');
}

async function getTotalDepositUSD(Web3, mpKey, userAddress) {
  const mp = await getMarginProvider(Web3, mpKey);
  const evrPerUSDWei = await getEVRPerUSDWei(Web3);
  const totalDepositUSD = await mp.get_net_liquidation_value_usd_wei(userAddress, evrPerUSDWei);
  return Web3.fromWei(totalDepositUSD, 'ether');
}

async function getLockedUpDepositUSD(Web3, mpKey, userAddress) {
  const mp = await getMarginProvider(Web3, mpKey);
  const evrPerUSDWei = await getEVRPerUSDWei(Web3);
  const [liquidationValueUSD, availableDepositUSD] = await Promise.all([
    mp.get_net_liquidation_value_usd_wei(userAddress, evrPerUSDWei),
    mp.get_available_funds_usd_wei(userAddress, evrPerUSDWei),
  ]);
  return Web3.fromWei(liquidationValueUSD.minus(
    Web3.BigNumber.max(availableDepositUSD, 0)), 'ether');
}

async function getAvailableDepositOnFutureUSD(Web3, productName, userAddress) {
  const f = await getFuture(Web3, productName);
  const currentPrice = await f.get_current_price_usd_wei();
  const evrPerUSDWei = await getEVRPerUSDWei(Web3);
  const availableDepositUSD = await f.get_available_funds_usd_wei(userAddress, evrPerUSDWei,
    currentPrice);
  return Web3.fromWei(availableDepositUSD, 'ether');
}

async function getTotalDepositOnFutureUSD(Web3, productName, userAddress) {
  const f = await getFuture(Web3, productName);
  const currentPrice = await f.get_current_price_usd_wei();
  const evrPerUSDWei = await getEVRPerUSDWei(Web3);
  const totalDepositUSD = await f.get_net_liquidation_value_usd_wei(userAddress, evrPerUSDWei,
    currentPrice);
  return Web3.fromWei(totalDepositUSD, 'ether');
}

async function getLockedUpDepositOnFutureUSD(Web3, productName, userAddress) {
  const f = await getFuture(Web3, productName);
  const currentPrice = await f.get_current_price_usd_wei();
  const evrPerUSDWei = await getEVRPerUSDWei(Web3);
  const [liquidationValueUSD, availableDepositUSD] = await Promise.all([
    f.get_net_liquidation_value_usd_wei(userAddress, evrPerUSDWei, currentPrice),
    f.get_available_funds_usd_wei(userAddress, evrPerUSDWei, currentPrice),
  ]);
  return Web3.fromWei(liquidationValueUSD.minus(
    Web3.BigNumber.max(availableDepositUSD, 0)), 'ether');
}

async function getQtyOnFuture(Web3, productName, userAddress) {
  const f = await getFuture(Web3, productName);
  const qtyAtto = await f.get_contract_balance_atto(userAddress);
  return Web3.fromWei(qtyAtto, 'ether');
}

async function getExcessBackstopEVR(Web3, productName) {
  const f = await getFuture(Web3, productName);
  const openInterestAtto = await f.get_open_interest_atto();
  const evrPerUSDWei = await getEVRPerUSDWei(Web3);
  const [balanceBackstopEVR, requiredBackstopUSD] = await Promise.all([
    f.get_backstop_deposit_balance_evr_wei(),
    f.get_backstop_deposit_required_usd_wei(openInterestAtto),
  ]);
  const requiredBackstopEVR = Web3.toBigNumber(requiredBackstopUSD).times(
    Web3.fromWei(evrPerUSDWei));
  return Web3.fromWei(balanceBackstopEVR.minus(requiredBackstopEVR), 'ether');
}

async function getRequiredBackstopUSD(Web3, productName) {
  const f = await getFuture(Web3, productName);
  const openInterestAtto = await f.get_open_interest_atto();
  const requiredBackstopUSD = await f.get_backstop_deposit_required_usd_wei(openInterestAtto);
  return Web3.fromWei(requiredBackstopUSD, 'ether');
}

async function getQty(Web3, mpKey, productName, userAddress) {
  const mp = await getMarginProvider(Web3, mpKey);
  const addr = await getFutureAddress(Web3, productName);
  const qtyAtto = await mp.get_contract_balance_atto(addr, userAddress);
  return Web3.fromWei(qtyAtto, 'ether');
}

async function getAverageEntryPrice(Web3, mpKey, productName, userAddress) {
  // contracts store price in exposure terms. convert back to index points
  // if there is a multiplier
  const mp = await getMarginProvider(Web3, mpKey);
  const f = await getFuture(Web3, productName);
  const multiplier = await f.get_multiplier_bp();
  const entryPrice = await mp.get_average_entry_price_usd_wei(f.address, userAddress);
  return Web3.fromWei(entryPrice.div(multiplier).times(1e4), 'ether');
}

async function getAvailableLenderDepositUSD(Web3, mpKey) {
  const mp = await getMarginProvider(Web3, mpKey);
  const evrPerUSDWei = await getEVRPerUSDWei(Web3);
  const availableDepositUSD = await mp.get_available_lender_funds_usd_wei(evrPerUSDWei);
  return Web3.fromWei(availableDepositUSD, 'ether');
}

function getAccountBalanceEVR(Web3, addr) {
  return EVRToken.deployed(Web3)
    .then(evr => evr.balanceOf(addr))
    .then(b => Web3.fromWei(b, 'ether'));
}

async function getLastPrice(Web3, productName) {
  // contracts store price in exposure terms. convert back to index points
  // if there is a multiplier
  const f = await getFuture(Web3, productName);
  const multiplier = await f.get_multiplier_bp();
  const lastPriceWei = await f.get_current_price_usd_wei();
  return Web3.fromWei(lastPriceWei.div(multiplier).times(1e4), 'ether');
}

async function getOpenInterest(Web3, productName) {
  const f = await getFuture(Web3, productName);
  const openInterestAtto = await f.get_open_interest_atto();
  return Web3.fromWei(openInterestAtto, 'ether');
}

function getAvailableCreatorFeesEVR(Web3, productName) {
  return getFuture(Web3, productName)
    .then(f => f.get_fee_balance_evr_wei())
    .then(r => Web3.fromWei(r, 'ether'));
}

async function getCollectedLenderFeesEVR(Web3, mpKey, productName) {
  // get lender fees collected on the margin provider for the given future
  const mp = await getMarginProvider(Web3, mpKey);
  const addr = await getFutureAddress(Web3, productName);
  const feeBalanceEVR = await mp.get_fee_balance_evr_wei(addr);
  return Web3.fromWei(feeBalanceEVR, 'ether');
}

async function getAvailableLenderFeesEVR(Web3, mpKey) {
  // get lender fees that are ready to withdraw
  const mp = await getMarginProvider(Web3, mpKey);
  const feeBalanceEVR = await mp.get_lender_fee_balance_evr_wei();
  return Web3.fromWei(feeBalanceEVR, 'ether');
}

function getLenderBalanceEVR(Web3, mpKey) {
  return getMarginProvider(Web3, mpKey)
    .then(mp => mp.get_lender_balance_evr_wei())
    .then(r => Web3.fromWei(r, 'ether'));
}

async function prepareAddTradesInputs(Web3, auctionData, multiplier) {
  const tradePriceWei = Web3
    .toWei(Web3.toBigNumber(auctionData.auctionPrice), 'ether')
    .times(multiplier).div(1e4);

  // convert sizes to wei to maintain some decimals
  const sizesAtto = auctionData.sizes.map(
    s => Web3.toWei(Web3.toBigNumber(s), 'ether'));

  // make sure all sizes in wei sum to one by assigning any leftover ot first trader
  const leftover = sizesAtto.reduce((a, b) => b.plus(a), 0);
  if (sizesAtto.length > 0)
    sizesAtto[0] = sizesAtto[0].minus(leftover);

  const syndicates = await Promise.all(
    auctionData.syndicates.map(s => getMarginProviderAddress(Web3, s)));

  return {
    tradePriceWei,
    sizesAtto,
    syndicates,
  };
}

async function addTrades(Web3, productName, auctionData) {
  const f = await getFuture(Web3, productName);
  const multiplier = await f.get_multiplier_bp();
  const evrPerUSDWei = await getEVRPerUSDWei(Web3);

  const { tradePriceWei, sizesAtto, syndicates } = await prepareAddTradesInputs(
    Web3, auctionData, multiplier);

  const txHash = f.add_trades_with_margin_providers.sendTransaction(
    evrPerUSDWei, tradePriceWei, syndicates, auctionData.syndicateCounts,
    auctionData.traders, sizesAtto, {
      gas: 1000000, // TODO(AustinC): update
    });
  return txHash;
}

async function verifyAddTrades(Web3, productName, auctionData) {
  const f = await getFuture(Web3, productName);
  const multiplier = await f.get_multiplier_bp();
  const evrPerUSDWei = await getEVRPerUSDWei(Web3);

  const { tradePriceWei, sizesAtto, syndicates } = await prepareAddTradesInputs(
    Web3, auctionData, multiplier);

  // the .call() is required here becuase try_add_trades_with_margin_providers() is not pure
  const [success, message] = await f.try_add_trades_with_margin_providers.call(
    evrPerUSDWei, tradePriceWei, syndicates, auctionData.syndicateCounts,
    auctionData.traders, sizesAtto, {
      gas: 1000000, // TODO(AustinC): update
    });

  return {
    success,
    message: Web3.toUtf8(message),
  };
}

async function withdraw(Web3, mpKey, valueEVR, userAddr) {
  const fromUser = userAddr || Web3.eth.accounts[0];
  const valueWei = Web3.toWei(valueEVR, 'ether');
  const mp = await getMarginProvider(Web3, mpKey);

  const txHash = mp.withdraw.sendTransaction(fromUser, valueWei, {
    from: fromUser,
    gas: 1000000, // TODO(AustinC): update
  });
  return txHash;
}

async function deposit(Web3, mpKey, valueEVR, userAddr) {
  const fromUser = userAddr || Web3.eth.accounts[0];
  const valueWei = Web3.toWei(valueEVR, 'ether');
  const evr = await EVRToken.deployed(Web3);
  const mp = await getMarginProvider(Web3, mpKey);

  // deposit EVR as collateral
  const txHash = await evr.approveAndCall.sendTransaction(
    mp.address, valueWei, fromUser, {
      from: fromUser,
      gas: 500000, // TODO(AustinC): update
    });
  return txHash;
}

async function withdrawForBackstop(Web3, productName, valueEVR) {
  const valueWei = Web3.toWei(valueEVR, 'ether');
  const f = await getFuture(Web3, productName);

  const txHash = f.withdraw_for_backstop.sendTransaction(
    valueWei, {
      gas: 1000000, // TODO(AustinC): update
    });
  return txHash;
}

async function depositForBackstop(Web3, productName, valueEVR) {
  // TODO(AustinC): could be combined with the deposit() function?
  const valueWei = Web3.toWei(valueEVR, 'ether');
  const evr = await EVRToken.deployed(Web3);
  const f = await getFuture(Web3, productName);

  // approve transfer from user to Future contract
  await evr.approve.sendTransaction(f.address, valueWei);

  // deposit EVR as backstop
  const txHash = f.deposit_for_backstop.sendTransaction(
    valueWei, {
      gas: 1000000, // TODO(AustinC): update
    });
  return txHash;
}

async function withdrawForLender(Web3, mpKey, valueEVR) {
  const userAddr = Web3.eth.accounts[0];
  const valueWei = Web3.toWei(valueEVR, 'ether');
  const mp = await getMarginProvider(Web3, mpKey);

  const txHash = mp.withdraw_for_lender.sendTransaction(valueWei, {
    from: userAddr,
    gas: 1000000, // TODO(AustinC): update
  });
  return txHash;
}

async function depositForLender(Web3, mpKey, valueEVR) {
  const userAddr = Web3.eth.accounts[0];
  const valueWei = Web3.toWei(valueEVR, 'ether');
  const evr = await EVRToken.deployed(Web3);
  const mp = await getMarginProvider(Web3, mpKey);

  // approve transfer from user to MarginProvider contract
  await evr.approve.sendTransaction(mp.address, valueWei);

  // deposit EVR as backstop
  const txHash = mp.deposit_for_lender.sendTransaction(
    valueWei, {
      from: userAddr,
      gas: 1000000, // TODO(AustinC): update
    });
  return txHash;
}

async function withdrawCreatorFees(Web3, productName, userAddr) {
  const fromUser = userAddr || Web3.eth.accounts[0];
  const f = await getFuture(Web3, productName);

  const txHash = f.withdraw_fees.sendTransaction({
    from: fromUser,
    gas: 1000000, // TODO(AustinC): update
  });
  return txHash;
}

async function withdrawLenderFees(Web3, mpKey, userAddr) {
  const fromUser = userAddr || Web3.eth.accounts[0];
  const mp = await getMarginProvider(Web3, mpKey);

  const txHash = mp.withdraw_fees.sendTransaction({
    from: fromUser,
    gas: 1000000, // TODO(AustinC): update
  });
  return txHash;
}

async function callMarkPosition(Web3, entity, ...args) {
  const [success, message] = await entity.mark_position.call(...args);

  if (!success) {
    return {
      success,
      result: Web3.toUtf8(message),
    };
  }

  const txHash = await sendTransactionWithGas(Web3, entity.mark_position, ...args);

  return {
    success,
    result: txHash,
  };
}

async function markPosition(Web3, productName, price) {
  const f = await getFuture(Web3, productName);
  const multiplier = await f.get_multiplier_bp();
  // need to convert toNumber() here at the end because on Rinkeby, priceAtto
  // is not recognized as a valid Solidity parameter and we get "Insufficient
  // number of arguments to a Solidity function"
  const priceAtto = Web3.toWei(
    Web3.toBigNumber(price).times(multiplier).div(1e4), 'ether').toNumber();

  const mpAddrs = await f.get_traders();
  const txHashes = [];
  for (const mpAddr of mpAddrs) {
    // is this trader the custodian and not a margin provdier?
    const custodian = await f.get_custodian();
    if (mpAddr !== custodian) {
      const mp = await MarginProvider.at(Web3, mpAddr);
      const traderAddrs = await mp.get_traders(f.address);

      // mark position for traders on margin provider, first
      for (const traderAddr of traderAddrs) {
        const { success: successInner, result: resultInner } = await callMarkPosition(
          Web3, mp, f.address, priceAtto, traderAddr);
        if (!successInner)
          return { success: false, result: resultInner };
        txHashes.push(resultInner);
      }
    }

    // then mark the position for the margin provider / custodian
    const { success, result } = await callMarkPosition(
      Web3, f, priceAtto, mpAddr);
    if (!success)
      return { success: false, result };
    txHashes.push(result);
  }

  return {
    success: true,
    result: txHashes,
  };
}

async function getTradersOnFuture(Web3, productName) {
  const f = await getFuture(Web3, productName);
  return f.get_traders();
}

async function getTradersOnMarginProvider(Web3, productName, mpKey) {
  const fAddr = await getFutureAddress(Web3, productName);
  const mp = await getMarginProvider(Web3, mpKey);
  return mp.get_traders(fAddr);
}

async function getFutureCustodian(Web3, productName) {
  const f = await getFuture(Web3, productName);
  return f.get_custodian();
}

async function mintEVR(Web3, recipientAddr, valueEVR) {
  const userAddr = Web3.eth.accounts[0];
  const valueWei = Web3.toWei(valueEVR, 'ether');
  const evr = await EVRToken.deployed(Web3);
  return evr.mintFor.sendTransaction(
    valueWei, recipientAddr, {
      from: userAddr,
      gas: 100000, // TODO(AustinC): update
    });
}

async function getEVRRate(Web3, currency) {
  const rates = await ExchangeRates.deployed(Web3);
  const evrPerUnitWei = await rates.rates(currency);
  return Web3.fromWei(evrPerUnitWei);
}

async function setEVRRate(Web3, currency, evrPerUnit) {
  const evrPerUnitWei = Web3.toWei(evrPerUnit, 'ether');
  const rates = await ExchangeRates.deployed(Web3);

  return rates.set_rate.sendTransaction(
    currency, evrPerUnitWei, {
      gas: 100000, // TODO(AustinC): update
    });
}

async function createFuture(Web3, productName, expirationTimestamp, initialMargin,
  maintenanceMargin, backstopDepositRatio, feePerContract, multiplier) {
  // expirationTimestamp is in seconds
  const ff = await FutureFactory.deployed(Web3);
  const initialMarginUSDWei = Web3.toWei(initialMargin, 'ether');
  const maintenanceMarginUSDWei = Web3.toWei(maintenanceMargin, 'ether');
  const feePerContractUSDWei = Web3.toWei(feePerContract, 'ether');
  return ff.create_future.sendTransaction(
    productName, productName, expirationTimestamp, initialMarginUSDWei, maintenanceMarginUSDWei,
    backstopDepositRatio, feePerContractUSDWei, multiplier * 1e4, {
      // TODO(AustinC): update (estimate from gas used by test run in `truffle console`)
      gas: 4500000,
    });
}

async function getFuture(Web3, productName) {
  const addr = await getFutureAddress(Web3, productName);
  if (Web3.toDecimal(addr) === 0)
    throw new Error(`${productName} not deployed. Not found on FutureFactory.`);
  return Future.at(Web3, addr);
}

async function getFutureAddress(Web3, productName) {
  const ff = await FutureFactory.deployed(Web3);
  return ff.futures(productName);
}

async function getFutureParams(Web3, productName) {
  const f = await getFuture(Web3, productName);
  return {
    initialMargin: Web3.fromWei(await f.get_initial_margin_usd_wei()),
    maintenanceMargin: Web3.fromWei(await f.get_maintenance_margin_usd_wei()),
    feePerContract: Web3.fromWei(await f.get_fee_per_contract_usd_wei()),
    multiplier: (await f.get_multiplier_bp()).toNumber() / 1e4,
  };
}

async function getMarginProviderFutureParams(Web3, mpKey, productName) {
  const mp = await getMarginProvider(Web3, mpKey);
  const addr = await getFutureAddress(Web3, productName);
  return {
    initialMargin: Web3.fromWei(await mp.get_initial_margin_usd_wei(addr)),
    maintenanceMargin: Web3.fromWei(await mp.get_maintenance_margin_usd_wei(addr)),
    totalFeePerContract: Web3.fromWei(await mp.get_total_fee_per_contract_usd_wei(addr)),
  };
}

async function createMarginProvider(Web3, mpKey, creatorAddress) {
  const fromUser = creatorAddress || Web3.eth.accounts[0];
  const ff = await FutureFactory.deployed(Web3);
  return ff.create_margin_provider.sendTransaction(
    mpKey, {
      from: fromUser,
      // TODO(AustinC): update (estimate from gas used by test run in `truffle console`)
      gas: 2500000,
    });
}

async function addFutureToMarginProvider(Web3, mpKey, productName, leverage, feePerContract,
  creatorAddress) {
  const fromUser = creatorAddress || Web3.eth.accounts[0];
  const mp = await getMarginProvider(Web3, mpKey);
  const addr = await getFutureAddress(Web3, productName);
  const feePerContractUSDWei = Web3.toWei(feePerContract, 'ether');
  const { initialMargin, maintenanceMargin } = await getFutureParams(Web3, productName);
  const initialMarginUSDWei = Web3.toWei(initialMargin, 'ether');
  const maintenanceMarginUSDWei = Web3.toWei(maintenanceMargin, 'ether');
  const initialMarginLevUSDWei = Math.ceil(initialMarginUSDWei / leverage);
  const maintenanceMarginLevUSDWei = Math.ceil(maintenanceMarginUSDWei / leverage);
  return mp.add_future.sendTransaction(
    addr, initialMarginLevUSDWei, maintenanceMarginLevUSDWei, feePerContractUSDWei, {
      from: fromUser,
      gas: 200000, // TODO(AustinC): update
    });
}

async function getMarginProviderAddress(Web3, mpKey) {
  const ff = await FutureFactory.deployed(Web3);
  return ff.margin_providers(mpKey);
}

async function getMarginProvider(Web3, mpKey) {
  const addr = await getMarginProviderAddress(Web3, mpKey);
  if (Web3.toDecimal(addr) === 0)
    throw new Error(`No margin provider ${mpKey} found on FutureFactory.`);
  return MarginProvider.at(Web3, addr);
}

function getTransactionReceipt(Web3, txHash) {
  // adapted from http://blog.bradlucas.com/posts/2017-08-22-wait-for-an-ethereum-transaction-to-be-mined/
  const fn = (resolve, reject) => {
    Web3.eth.getTransactionReceipt(txHash, (error, receipt) => {
      if (error) {
        reject(error);
      } else if (receipt == null) {
        // call me back and try again
        setTimeout(() => fn(resolve, reject), 500);
      } else {
        resolve(receipt);
      }
    });
  };

  return new Promise(fn);
}

function partialApply(fn, arg1) {
  return (...args) => fn(arg1, ...args);
}

const chain = Web3 => ({
  // MarginProvider balances
  getTotalDepositUSD: partialApply(getTotalDepositUSD, Web3),
  getAvailableDepositUSD: partialApply(getAvailableDepositUSD, Web3),
  getLockedUpDepositUSD: partialApply(getLockedUpDepositUSD, Web3),
  getQty: partialApply(getQty, Web3),
  getAverageEntryPrice: partialApply(getAverageEntryPrice, Web3),
  getAvailableLenderDepositUSD: partialApply(getAvailableLenderDepositUSD, Web3),
  getTradersOnMarginProvider: partialApply(getTradersOnMarginProvider, Web3),
  getFutureCustodian: partialApply(getFutureCustodian, Web3),

  // Future balances
  getTotalDepositOnFutureUSD: partialApply(getTotalDepositOnFutureUSD, Web3),
  getAvailableDepositOnFutureUSD: partialApply(getAvailableDepositOnFutureUSD, Web3),
  getLockedUpDepositOnFutureUSD: partialApply(getLockedUpDepositOnFutureUSD, Web3),
  getQtyOnFuture: partialApply(getQtyOnFuture, Web3),
  getExcessBackstopEVR: partialApply(getExcessBackstopEVR, Web3),
  getRequiredBackstopUSD: partialApply(getRequiredBackstopUSD, Web3),
  getLastPrice: partialApply(getLastPrice, Web3),
  getOpenInterest: partialApply(getOpenInterest, Web3),
  getAvailableCreatorFeesEVR: partialApply(getAvailableCreatorFeesEVR, Web3),
  getTradersOnFuture: partialApply(getTradersOnFuture, Web3),

  // trader actions
  addTrades: partialApply(addTrades, Web3),
  verifyAddTrades: partialApply(verifyAddTrades, Web3),
  withdraw: partialApply(withdraw, Web3),
  deposit: partialApply(deposit, Web3),

  // products
  createFuture: partialApply(createFuture, Web3),
  getFutureAddress: partialApply(getFutureAddress, Web3),
  getFutureParams: partialApply(getFutureParams, Web3),
  withdrawForBackstop: partialApply(withdrawForBackstop, Web3),
  depositForBackstop: partialApply(depositForBackstop, Web3),
  withdrawCreatorFees: partialApply(withdrawCreatorFees, Web3),
  markPosition: partialApply(markPosition, Web3),

  // syndicates
  getLenderBalanceEVR: partialApply(getLenderBalanceEVR, Web3),
  getMarginProviderAddress: partialApply(getMarginProviderAddress, Web3),
  getMarginProviderFutureParams: partialApply(getMarginProviderFutureParams, Web3),
  createMarginProvider: partialApply(createMarginProvider, Web3),
  addFutureToMarginProvider: partialApply(addFutureToMarginProvider, Web3),
  getCollectedLenderFeesEVR: partialApply(getCollectedLenderFeesEVR, Web3),
  getAvailableLenderFeesEVR: partialApply(getAvailableLenderFeesEVR, Web3),
  withdrawForLender: partialApply(withdrawForLender, Web3),
  depositForLender: partialApply(depositForLender, Web3),
  withdrawLenderFees: partialApply(withdrawLenderFees, Web3),

  // utilities
  getTransactionReceipt: partialApply(getTransactionReceipt, Web3),
  getAccountBalanceEVR: partialApply(getAccountBalanceEVR, Web3),
  getEVRRate: partialApply(getEVRRate, Web3),
  setEVRRate: partialApply(setEVRRate, Web3),
  mintEVR: partialApply(mintEVR, Web3),
});

module.exports = chain;
