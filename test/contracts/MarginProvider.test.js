/* eslint no-undef: 0 */

const EVRToken = artifacts.require('EVRToken');
const ExchangeRates = artifacts.require('ExchangeRates');
const FutureFactory = artifacts.require('FutureFactory');
const Future = artifacts.require('Future');
const MarginProvider = artifacts.require('MarginProvider');
const Utils = require('./Utils.js');

contract('MarginProvider', (accounts) => {
  let evr;
  let rates;
  let futureFactory;
  const defaultProductName = 'Product';
  const custodian = accounts[0];
  const trader1 = accounts[1];
  const trader2 = accounts[2];
  const lender1 = accounts[3];
  const dummyLender = accounts[8];
  const dummyTrader = accounts[9];
  const evrPerUSD = 3;
  const toEVR = usd => web3.toBigNumber(usd).times(evrPerUSD).toNumber();
  const backstopDeposit = toEVR(1000);

  beforeEach(async () => {
    if (!evr)
      evr = await EVRToken.deployed();

    if (!rates) {
      // Set the exchange rate.
      rates = await ExchangeRates.deployed();
      await rates.set_rate('USD', Utils.toWei(evrPerUSD), { from: custodian });
    }

    if (!futureFactory)
      futureFactory = await FutureFactory.deployed();

    return Promise.all([
      evr.mintFor(Utils.toWei(11000), custodian),
      evr.mintFor(Utils.toWei(123456), lender1),
      evr.mintFor(Utils.toWei(123456), dummyLender),
      evr.mintFor(Utils.toWei(11000), trader1),
      evr.mintFor(Utils.toWei(11000), trader2),
      evr.mintFor(Utils.toWei(11000), dummyTrader),
    ]);
  });

  async function createFuture(productName, futureInitialMargin, futureMaintenanceMargin) {
    const fimUSDWei = futureInitialMargin * 1e18;
    const fmmUSDWei = futureMaintenanceMargin * 1e18;
    await futureFactory.create_future(
      productName, productName, Date.UTC(1970, 0, 1), fimUSDWei, fmmUSDWei, 5000, 1e18, 1e6,
      { from: custodian });

    const addr = await futureFactory.futures(productName);
    return Future.at(addr);
  }

  async function createMarginProvider(future, lender, leverageRatio, fee) {
    const fimUSDWei = await future.get_initial_margin_usd_wei();
    const fmmUSDWei = await future.get_maintenance_margin_usd_wei();
    const mimUSDWei = fimUSDWei / (leverageRatio || 1);
    const mmmUSDWei = fmmUSDWei / (leverageRatio || 1);
    const mp = await MarginProvider.new(evr.address, lender || dummyLender, rates.address, 'USD');
    await mp.add_future(future.address, mimUSDWei, mmmUSDWei, (fee || 0) * 1e18,
      { from: lender || dummyLender });
    return mp;
  }

  async function deployFutureAndMarginProviders(futureInitialMargin, futureMaintenanceMargin,
    mpParams) {
    const future = await createFuture(defaultProductName, futureInitialMargin,
      futureMaintenanceMargin);
    await Utils.depositForBackstop(evr, future, backstopDeposit, custodian);

    return Promise.all([
      future,
      ...mpParams.map(params => createMarginProvider(future, ...params)),
    ]);
  }

  async function verifyAvailableLenderFunds(mp, numUSD) {
    return mp.get_available_lender_funds_usd_wei(Utils.toWei(evrPerUSD)).then(n =>
      assert.equal(n / 1e18, numUSD, 'available lender funds'));
  }

  async function verifyState(future, mp, es) {
    if (es.futures) {
      await Promise.all([
        Utils.verifyBalancesOnFuture(future, mp.address, es.future.contracts, es.future.costs,
          es.future.deposit),
        Utils.verifyFeeBalance(future, es.future.fees),
        Utils.verifyOtherStatsOnFuture(future, mp.address, evrPerUSD, es.future),
      ]);
    }

    if (es.marginProvider) {
      await Utils.verifyMarginProviderFutureFeeBalance(mp, future, es.marginProvider.fees);
    }

    if (es.traders) {
      await Promise.all([
        ...es.traders.map(t => Promise.all([
          Utils.verifyBalancesOnMarginProvider(mp, future, t.address, t.contracts, t.costs,
            t.assignedDeposit, t.unassignedDeposit),
          Utils.verifyOtherStatsOnMarginProvider(mp, future, t.address, evrPerUSD, t),
        ])),
      ]);
    }
  }

  async function addTrades(mp, price, traders, sizes, future, dummyMP) {
    const trades = [];
    let totalSize = 0;
    let netRealSize = 0;
    let i;
    for (i = 0; i < traders.length; ++i) {
      const s = sizes[i];
      trades.push({ trader: traders[i], marginProvider: mp.address, size: s });
      totalSize += Math.abs(s);
      netRealSize += s;
    }
    trades.push({ trader: dummyTrader, marginProvider: dummyMP.address, size: -netRealSize });

    // Make sure the dummy margin provider has more than enough deposit.
    const futureInitialMarginUSD = (await future.get_initial_margin_usd_wei()) / 1e18;
    const futureFeePerContractUSD = (await future.get_fee_per_contract_usd_wei()) / 1e18;
    const dummyInitialMarginUSD = (await dummyMP.get_initial_margin_usd_wei(future.address)) / 1e18;
    const dummyLeverageRatio = futureInitialMarginUSD / dummyInitialMarginUSD;
    const dummyDepositRequiredUSD = totalSize * (dummyInitialMarginUSD + futureFeePerContractUSD);
    const dummyLoanRequiredUSD = dummyDepositRequiredUSD * (dummyLeverageRatio - 1);
    if (dummyLoanRequiredUSD > 0)
      await Utils.depositForLender(evr, dummyMP, toEVR(dummyLoanRequiredUSD));
    await Utils.depositForTrader(evr, dummyMP, dummyTrader,
      toEVR(dummyDepositRequiredUSD));

    await Utils.addTradesToFuture(future, evrPerUSD, price, trades);
    return Utils.checkMarginProviderBalances(mp, evrPerUSD);
  }

  it('should not allow trading without a lender deposit', async () => {
    const [future, mp, dummyMP] = await deployFutureAndMarginProviders(2, 1.6,
      [[lender1, 2, 1], []]);
    await Utils.depositForTrader(evr, mp, trader1, toEVR(30));

    // Trader will try to buy 10 contracts at a price of 8 EVR each.
    // With an initial margin of 25%, they should be required to deposit 10 EVR + 20 EVR fees,
    // with 10 more EVR coming from the lender.
    const tryToAddTheTrades = async trader =>
      addTrades(mp, 8, [trader || trader1], [10], future, dummyMP);

    await tryToAddTheTrades()
      .then(assert.fail)
      .catch((error) => {
        assert.equal(error.message, 'not enough lender deposit',
          'trying to trade without making a lender deposit should fail');
      });

    // Make a lender deposit, but not enough.
    await Utils.depositForLender(evr, mp, toEVR(9.99));
    await tryToAddTheTrades()
      .then(assert.fail)
      .catch((error) => {
        assert.equal(error.message, 'not enough lender deposit',
          'trying to trade without making a lender deposit should fail');
      });

    // Make another lender deposit so that the total deposit is large enough.
    await Utils.depositForLender(evr, mp, toEVR(0.01));
    await tryToAddTheTrades();
    await verifyState(future, mp, {
      future: {
        contracts: 10,
        costs: 80,
        deposit: toEVR(20),
        averageEntryPrice: 8,
        netLiquidationValue: 20,
        availableFunds: 0,
        excessLiquidity: 4,
        fees: toEVR(20),
      },
      marginProvider: {
        fees: toEVR(10),
      },
      traders: [
        {
          address: trader1,
          contracts: 10,
          costs: 80,
          assignedDeposit: toEVR(-20),
          unassignedDeposit: toEVR(30),
          averageEntryPrice: 8,
          netLiquidationValue: 10,
          availableFunds: 0,
          excessLiquidity: 2,
        },
      ],
    });

    // Make another trader deposit, and try to add the trades again, w/o any additional lender
    // deposit.
    await Utils.depositForTrader(evr, mp, trader1, toEVR(30));
    await tryToAddTheTrades()
      .then(assert.fail)
      .catch((error) => {
        assert.equal(error.message, 'not enough lender deposit',
          'trying to trade without making a lender deposit should fail');
      });

    // Make deposit for a new trader, and try to add the trades again, w/o any additional lender
    // deposit.
    await Utils.depositForTrader(evr, mp, trader2, toEVR(30));
    await tryToAddTheTrades(trader2)
      .then(assert.fail)
      .catch((error) => {
        assert.equal(error.message, 'not enough lender deposit',
          'trying to trade without making a lender deposit should fail');
      });
  });

  it('should not allow adding trades without a trader deposit', async () => {
    const [future, mp, dummyMP] = await deployFutureAndMarginProviders(2, 1.6,
      [[lender1, 2, 1], []]);
    await Utils.depositForLender(evr, mp, toEVR(10));

    // Trader will try to buy 10 contracts at a price of 8 EVR each.
    // With an initial margin of 25%, they should be required to deposit 10 EVR + 20 EVR fees,
    // with 10 more EVR coming from the lender.
    const tryToAddTheTrades = async () =>
      addTrades(mp, 8, [trader1], [10], future, dummyMP);

    // Try to trade without making a trader deposit.
    await tryToAddTheTrades()
      .then(assert.fail)
      .catch((error) => {
        assert.equal(error.message, '!in_traders_list[t]',
          'trying to trade without making a deposit should fail');
      });

    // Make a deposit, but not enough.
    await Utils.depositForTrader(evr, mp, trader1, toEVR(29.99));
    await tryToAddTheTrades()
      .then(assert.fail)
      .catch((error) => {
        assert.equal(error.message, 'not enough trader deposit',
          'trying to trade without making a large enough deposit should fail');
      });

    // Make another deposit so that the total deposit is large enough.
    await Utils.depositForTrader(evr, mp, trader1, toEVR(0.01));
    await tryToAddTheTrades();
    await verifyState(future, mp, {
      future: {
        contracts: 10,
        costs: 80,
        deposit: toEVR(20),
        averageEntryPrice: 8,
        netLiquidationValue: 20,
        availableFunds: 0,
        excessLiquidity: 4,
        fees: toEVR(20),
      },
      marginProvider: {
        fees: toEVR(10),
      },
      traders: [
        {
          address: trader1,
          contracts: 10,
          costs: 80,
          assignedDeposit: toEVR(-20),
          unassignedDeposit: toEVR(30),
          averageEntryPrice: 8,
          netLiquidationValue: 10,
          availableFunds: 0,
          excessLiquidity: 2,
        },
      ],
    });
  });

  it('should deposit to the Future', async () => {
    const [future, mp, dummyMP] =
      await deployFutureAndMarginProviders(25, 20, [[lender1, 2, 1], [dummyLender, 2, 0]]);

    await Promise.all([
      Utils.depositForLender(evr, mp, toEVR(37.5)),
      Utils.depositForTrader(evr, mp, trader1, toEVR(14.5)),
      Utils.depositForTrader(evr, mp, trader2, toEVR(29)),
    ]);
    await Promise.all([
      Utils.verifyLenderBalance(mp, toEVR(37.5)),
      Utils.verifyBalancesOnMarginProvider(mp, future, trader1, 0, 0, 0, toEVR(14.5)),
      Utils.verifyBalancesOnMarginProvider(mp, future, trader2, 0, 0, 0, toEVR(29)),
      Utils.verifyBalancesOnFuture(future, mp.address, 0, 0, 0),
    ]);

    await addTrades(mp, 100, [trader1, trader2], [-1, 2], future, dummyMP);
    return Promise.all([
      Utils.verifyBalancesOnMarginProvider(mp, future, trader1, -1, -100, toEVR(-2), toEVR(14.5)),
      Utils.verifyBalancesOnMarginProvider(mp, future, trader2, 2, 200, toEVR(-4), toEVR(29)),
      Utils.verifyBalancesOnFuture(future, mp.address, 1, 100, toEVR(25)),
      Utils.verifyFeeBalance(future, toEVR(4)),
      Utils.verifyMarginProviderFutureFeeBalance(mp, future, toEVR(3)),
      Utils.verifyLenderBalance(mp, toEVR(37.5)),
      verifyAvailableLenderFunds(mp, 0),
    ]);
  });

  it('should allow traders to withdraw excess collateral', async () => {
    const [future, mp, mp2] =
      await deployFutureAndMarginProviders(25, 20, [[lender1, 2, 1], [lender1, 2, 1]]);
    const initialBalance = (await evr.balanceOf(trader1)).dividedBy(1e18);

    await Promise.all([
      Utils.depositForTrader(evr, mp, trader1, toEVR(27)),
      Utils.depositForLender(evr, mp, toEVR(25)),
      Utils.depositForTrader(evr, mp2, trader2, toEVR(27)),
      Utils.depositForLender(evr, mp2, toEVR(25)),
    ]);
    await Utils.verifyEVRBalance(evr, trader1, initialBalance.minus(toEVR(27)));

    await Utils.addTradesToFuture(future, evrPerUSD, 100, [
      { trader: trader1, marginProvider: mp.address, size: 1 },
      { trader: trader2, marginProvider: mp2.address, size: -1 },
    ]);
    await Utils.verifyBalancesOnMarginProvider(mp, future, trader1, 1, 100, toEVR(-2), toEVR(27));
    await Utils.verifyFeeBalance(future, toEVR(2));
    await Utils.verifyMarginProviderFutureFeeBalance(mp, future, toEVR(1));

    await mp.get_available_funds_usd_wei(trader1, Utils.toWei(evrPerUSD)).then(n =>
      assert.equal(n / 1e18, 12.5));

    // Trader should be allowed to withdraw 12.5 USD and no more.
    await mp.withdraw(trader1, Utils.toWei(toEVR(13)), { from: trader1 })
      .then(assert.fail)
      .catch((error) => {
        assert.equal(error.message.substr(0, 41), 'VM Exception while processing transaction',
          'trying to withdraw too much from the MarginProvider should throw an exception');
      });

    await mp.withdraw(trader1, Utils.toWei(toEVR(12.5)), { from: trader1 });
    await Utils.verifyEVRBalance(evr, trader1, initialBalance.minus(toEVR(14.5)));
  });

  it('should add trades w/ default margin provider', async () => {
    const [future] = await deployFutureAndMarginProviders(625, 500, []);
    const mp = await MarginProvider.at(await futureFactory.margin_providers('default'));

    await Promise.all([
      Utils.depositForTrader(evr, mp, trader1, toEVR(2001)),
      Utils.depositForTrader(evr, mp, trader2, toEVR(2001)),
    ]);
    await Utils.addTradesToFuture(future, evrPerUSD, 2500, [
      { trader: trader1, marginProvider: mp.address, size: 1 },
      { trader: trader2, marginProvider: mp.address, size: -1 },
    ]);

    return verifyState(future, mp, {
      future: {
        contracts: 0,
        costs: 0,
        deposit: 0,
        averageEntryPrice: 0,
        netLiquidationValue: 0,
        availableFunds: 0,
        excessLiquidity: 0,
        fees: toEVR(2),
      },
      marginProvider: {
        fees: 0,
      },
      traders: [
        {
          address: trader1,
          contracts: 1,
          costs: 2500,
          assignedDeposit: toEVR(-1),
          unassignedDeposit: toEVR(2001),
          averageEntryPrice: 2500,
          netLiquidationValue: 2000,
          availableFunds: 1375,
          excessLiquidity: 1500,
        },
        {
          address: trader2,
          contracts: -1,
          costs: -2500,
          assignedDeposit: toEVR(-1),
          unassignedDeposit: toEVR(2001),
          averageEntryPrice: 2500,
          netLiquidationValue: 2000,
          availableFunds: 1375,
          excessLiquidity: 1500,
        },
      ],
    });
  });

  it('should complete scenario with correct balances at every step', async () => {
    const [future, mp, mp2] =
      await deployFutureAndMarginProviders(20, 16, [[lender1, 2, 1], [lender1, 2, 1]]);

    // 1. Deposit 1000 for lender1.
    await Utils.depositForLender(evr, mp, toEVR(1000));
    await Utils.verifyLenderBalance(mp, toEVR(1000));

    // 2. Deposit 10+2 fees for trader 1.
    await Utils.depositForTrader(evr, mp, trader1, toEVR(12));
    await Utils.verifyBalancesOnMarginProvider(mp, future, trader1, 0, 0, 0, toEVR(12));

    // 3. Deposit 20 to future.
    // 4. Buy 1 contract at 100.
    await Utils.depositForLender(evr, mp2, toEVR(1000));
    await Utils.depositForTrader(evr, mp2, trader2, toEVR(100));
    await Utils.addTradesToFuture(future, evrPerUSD, 100, [
      { trader: trader1, marginProvider: mp.address, size: 1 },
      { trader: trader2, marginProvider: mp2.address, size: -1 },
    ]);

    await verifyState(future, mp, {
      future: {
        contracts: 1,
        costs: 100,
        deposit: toEVR(20),
        averageEntryPrice: 100,
        netLiquidationValue: 20,
        availableFunds: 0,
        excessLiquidity: 4,
        fees: toEVR(2),
      },
      marginProvider: {
        fees: toEVR(1),
      },
      traders: [
        {
          address: trader1,
          contracts: 1,
          costs: 100,
          assignedDeposit: toEVR(-2),
          unassignedDeposit: toEVR(12),
          averageEntryPrice: 100,
          netLiquidationValue: 10,
          availableFunds: 0,
          excessLiquidity: 2,
        },
      ],
    });

    // 5. Price changes to 102.
    await Utils.addTradesToFuture(future, evrPerUSD, 102, []);
    await verifyState(future, mp, {
      future: {
        contracts: 1,
        costs: 100,
        deposit: toEVR(20),
        averageEntryPrice: 100,
        netLiquidationValue: 22,
        availableFunds: 1.6,
        excessLiquidity: 5.68,
        fees: toEVR(2),
      },
      marginProvider: {
        fees: toEVR(1),
      },
      traders: [
        {
          address: trader1,
          contracts: 1,
          costs: 100,
          assignedDeposit: toEVR(-2),
          unassignedDeposit: toEVR(12),
          averageEntryPrice: 100,
          netLiquidationValue: 12,
          availableFunds: 2,
          excessLiquidity: 4,
        },
      ],
    });

    // 6. Withdraw 1.6 from future.
    await mp.withdraw_excess_deposit_from_future(future.address, { from: lender1 });
    await verifyState(future, mp, {
      future: {
        contracts: 1,
        costs: 100,
        deposit: toEVR(18.4),
        averageEntryPrice: 100,
        netLiquidationValue: 20.4,
        availableFunds: 0,
        excessLiquidity: 4.08,
        fees: toEVR(2),
      },
      marginProvider: {
        fees: toEVR(1),
      },
      traders: [
        {
          address: trader1,
          contracts: 1,
          costs: 100,
          assignedDeposit: toEVR(-2),
          unassignedDeposit: toEVR(12),
          averageEntryPrice: 100,
          netLiquidationValue: 12,
          availableFunds: 2,
          excessLiquidity: 4,
        },
      ],
    });

    // 7. Price changes to 98.
    await Utils.addTradesToFuture(future, evrPerUSD, 98, []);
    await verifyState(future, mp, {
      future: {
        contracts: 1,
        costs: 100,
        deposit: toEVR(18.4),
        averageEntryPrice: 100,
        netLiquidationValue: 16.4,
        availableFunds: -3.2,
        excessLiquidity: 0.72,
        fees: toEVR(2),
      },
      marginProvider: {
        fees: toEVR(1),
      },
      traders: [
        {
          address: trader1,
          contracts: 1,
          costs: 100,
          assignedDeposit: toEVR(-2),
          unassignedDeposit: toEVR(12),
          averageEntryPrice: 100,
          netLiquidationValue: 8,
          availableFunds: -2,
          excessLiquidity: 0,
        },
      ],
    });

    // 8. Deposit 3.2 to future.
    await mp.top_up_deposit_on_future(future.address, { from: lender1 });
    await verifyState(future, mp, {
      future: {
        contracts: 1,
        costs: 100,
        deposit: toEVR(21.6),
        averageEntryPrice: 100,
        netLiquidationValue: 19.6,
        availableFunds: 0,
        excessLiquidity: 3.92,
        fees: toEVR(2),
      },
      marginProvider: {
        fees: toEVR(1),
      },
      traders: [
        {
          address: trader1,
          contracts: 1,
          costs: 100,
          assignedDeposit: toEVR(-2),
          unassignedDeposit: toEVR(12),
          averageEntryPrice: 100,
          netLiquidationValue: 8,
          availableFunds: -2,
          excessLiquidity: 0,
        },
      ],
    });

    // 9. Deposit 2 + 2 fees for trader.
    await Utils.depositForTrader(evr, mp, trader1, toEVR(4));
    await verifyState(future, mp, {
      future: {
        contracts: 1,
        costs: 100,
        deposit: toEVR(21.6),
        averageEntryPrice: 100,
        netLiquidationValue: 19.6,
        availableFunds: 0,
        excessLiquidity: 3.92,
        fees: toEVR(2),
      },
      marginProvider: {
        fees: toEVR(1),
      },
      traders: [
        {
          address: trader1,
          contracts: 1,
          costs: 100,
          assignedDeposit: toEVR(-2),
          unassignedDeposit: toEVR(16),
          averageEntryPrice: 100,
          netLiquidationValue: 12,
          availableFunds: 2,
          excessLiquidity: 4,
        },
      ],
    });

    // 10. Deposit 10 for trader.
    await Utils.depositForTrader(evr, mp, trader1, toEVR(10));
    await verifyState(future, mp, {
      future: {
        contracts: 1,
        costs: 100,
        deposit: toEVR(21.6),
        averageEntryPrice: 100,
        netLiquidationValue: 19.6,
        availableFunds: 0,
        excessLiquidity: 3.92,
        fees: toEVR(2),
      },
      marginProvider: {
        fees: toEVR(1),
      },
      traders: [
        {
          address: trader1,
          contracts: 1,
          costs: 100,
          assignedDeposit: toEVR(-2),
          unassignedDeposit: toEVR(26),
          averageEntryPrice: 100,
          netLiquidationValue: 22,
          availableFunds: 12,
          excessLiquidity: 14,
        },
      ],
    });

    // 11. Deposit 20 to future.
    // 12. Buy 1 contract at 98.
    await Utils.addTradesToFuture(future, evrPerUSD, 98, [
      { trader: trader1, marginProvider: mp.address, size: 1 },
      { trader: trader2, marginProvider: mp2.address, size: -1 },
    ]);
    await verifyState(future, mp, {
      future: {
        contracts: 2,
        costs: 198,
        deposit: toEVR(41.2),
        averageEntryPrice: 99,
        netLiquidationValue: 39.2,
        availableFunds: 0,
        excessLiquidity: 7.84,
        fees: toEVR(4),
      },
      marginProvider: {
        fees: toEVR(2),
      },
      traders: [
        {
          address: trader1,
          contracts: 2,
          costs: 198,
          assignedDeposit: toEVR(-4),
          unassignedDeposit: toEVR(26),
          averageEntryPrice: 99,
          netLiquidationValue: 20,
          availableFunds: 0,
          excessLiquidity: 4,
        },
      ],
    });
  });

  it('should withdraw excess deposit on future after closing part of a position', async () => {
    const [future, mp, dummyMP] = await deployFutureAndMarginProviders(2, 1.6,
      [[lender1, 2, 1], []]);

    // Trader will try to buy 10 contracts at a price of 8 EVR each.
    // With an initial margin of 25%, they should be required to deposit 10 EVR + 20 EVR fees,
    // with 10 more EVR coming from the lender.
    const tryToAddTheTrades = async trader =>
      addTrades(mp, 8, [trader || trader1], [10], future, dummyMP);

    await Utils.depositForTrader(evr, mp, trader1, toEVR(30));
    await Utils.depositForLender(evr, mp, toEVR(10));
    await tryToAddTheTrades();
    await verifyState(future, mp, {
      future: {
        contracts: 10,
        costs: 80,
        deposit: toEVR(20),
        averageEntryPrice: 8,
        netLiquidationValue: 20,
        availableFunds: 0,
        excessLiquidity: 4,
        fees: toEVR(20),
      },
      marginProvider: {
        fees: toEVR(10),
      },
      traders: [
        {
          address: trader1,
          contracts: 10,
          costs: 80,
          assignedDeposit: toEVR(-20),
          unassignedDeposit: toEVR(30),
          averageEntryPrice: 8,
          netLiquidationValue: 10,
          availableFunds: 0,
          excessLiquidity: 2,
        },
      ],
    });

    // Close part of the position. We'll deposit enough to pay fees again, but no more deposit
    // should be required.
    await Utils.depositForTrader(evr, mp, trader1, toEVR(2));
    await verifyState(future, mp, {
      traders: [
        {
          address: trader1,
          contracts: 10,
          costs: 80,
          assignedDeposit: toEVR(-20),
          unassignedDeposit: toEVR(32),
          averageEntryPrice: 8,
          netLiquidationValue: 12,
          availableFunds: 2,
          excessLiquidity: 4,
        },
      ],
    });

    await addTrades(mp, 8, [trader1], [-1], future, dummyMP);
    await verifyState(future, mp, {
      future: {
        contracts: 9,
        costs: 72,
        deposit: toEVR(19),
        averageEntryPrice: 8,
        netLiquidationValue: 19,
        availableFunds: 1,
        excessLiquidity: 4.6,
        fees: toEVR(22),
      },
    });

    await mp.withdraw_excess_deposit_from_future(future.address, { from: lender1 });
    await verifyState(future, mp, {
      future: {
        contracts: 9,
        costs: 72,
        deposit: toEVR(18),
        averageEntryPrice: 8,
        netLiquidationValue: 18,
        availableFunds: 0,
        excessLiquidity: 3.6,
        fees: toEVR(22),
      },
      marginProvider: {
        fees: toEVR(11),
      },
      traders: [
        {
          address: trader1,
          contracts: 9,
          costs: 72,
          assignedDeposit: toEVR(-22),
          unassignedDeposit: toEVR(32),
          averageEntryPrice: 8,
          netLiquidationValue: 10,
          availableFunds: 1,
          excessLiquidity: 2.8,
        },
      ],
    });
  });

  it('should allow withdrawing fees (after expiration)', async () => {
    const initialLenderBalance = (await evr.balanceOf(lender1)) / 1e18;
    const initialTraderBalance = (await evr.balanceOf(trader1)) / 1e18;
    const initialDummyLenderBalance = (await evr.balanceOf(dummyLender)) / 1e18;
    const initialDummyTraderBalance = (await evr.balanceOf(dummyTrader)) / 1e18;

    const [future, mp, dummyMP] = await deployFutureAndMarginProviders(2, 1.6,
      [[lender1, 2, 1], []]);

    await Utils.depositForLender(evr, mp, toEVR(10));

    // Trader will try to buy 10 contracts at a price of 8 EVR each.
    // With an initial margin of 25%, they should be required to deposit 10 EVR + 20 EVR fees,
    // with 10 more EVR coming from the lender.
    const tryToAddTheTrades = async () =>
      addTrades(mp, 8, [trader1], [10], future, dummyMP);

    await Utils.depositForTrader(evr, mp, trader1, toEVR(30));

    await tryToAddTheTrades();
    await verifyState(future, mp, {
      future: {
        contracts: 10,
        costs: 80,
        deposit: toEVR(20),
        averageEntryPrice: 8,
        netLiquidationValue: 20,
        availableFunds: 0,
        excessLiquidity: 4,
        fees: toEVR(20),
      },
      marginProvider: {
        fees: toEVR(10),
      },
      traders: [
        {
          address: trader1,
          contracts: 10,
          costs: 80,
          assignedDeposit: toEVR(-20),
          unassignedDeposit: toEVR(30),
          averageEntryPrice: 8,
          netLiquidationValue: 10,
          availableFunds: 0,
          excessLiquidity: 2,
        },
      ],
    });
    await Utils.verifyEVRBalance(evr, lender1, initialLenderBalance - toEVR(10));
    await Utils.verifyEVRBalance(evr, trader1, initialTraderBalance - toEVR(30));
    await Utils.verifyEVRBalance(evr, dummyLender, initialDummyLenderBalance);
    await Utils.verifyEVRBalance(evr, dummyTrader, initialDummyTraderBalance - toEVR(30));
    await Utils.verifyEVRBalance(evr, future.address, backstopDeposit + toEVR(60));
    await Utils.verifyEVRBalance(evr, mp.address, toEVR(10));
    await Utils.verifyEVRBalance(evr, dummyMP.address, 0);
    await Utils.verifyMarginProviderFeeBalance(mp, 0);

    await Utils.settleFuture(future, evrPerUSD, 0.08);
    await Utils.verifyEVRBalance(evr, future.address, backstopDeposit + toEVR(20));
    await Utils.verifyEVRBalance(evr, mp.address, toEVR(30));
    await Utils.verifyEVRBalance(evr, dummyMP.address, toEVR(20));

    await Utils.verifyMarginProviderFutureFeeBalance(mp, future, 0);
    await Utils.verifyMarginProviderFeeBalance(mp, toEVR(10));
    await mp.withdraw_fees({ from: lender1 });
    await Utils.verifyEVRBalance(evr, lender1, initialLenderBalance);
    await Utils.verifyEVRBalance(evr, mp.address, toEVR(20));
  });

  it('should allow withdrawing excess lender deposit', async () => {
    const initialLenderBalance = (await evr.balanceOf(lender1)) / 1e18;

    const [future, mp, dummyMP] = await deployFutureAndMarginProviders(2, 1.6,
      [[lender1, 2, 1], []]);

    // Trader will try to buy 10 contracts at a price of 8 EVR each.
    // With an initial margin of 25%, they should be required to deposit 10 EVR + 20 EVR fees,
    // with 10 more EVR coming from the lender.
    const tryToAddTheTrades = async trader =>
      addTrades(mp, 8, [trader || trader1], [10], future, dummyMP);

    // Try to withdraw for lender as the trader.
    await mp.withdraw_for_lender(toEVR(10e18), { from: trader1 })
      .then(assert.fail)
      .catch((error) => {
        assert.equal(error.message.substr(0, 41), 'VM Exception while processing transaction',
          'trying to withdraw for lender as anyone other than the lender' +
          ' should throw an exception');
      });

    // Try to withdraw for lender w/o making a lender deposit.
    await mp.withdraw_for_lender(toEVR(10e18), { from: lender1 })
      .then(assert.fail)
      .catch((error) => {
        assert.equal(error.message.substr(0, 41), 'VM Exception while processing transaction',
          'trying to withdraw for lender without making a lender deposit' +
          ' should throw an exception');
      });

    // Try to withdraw for lender after making a trader deposit.
    await Utils.depositForTrader(evr, mp, trader1, toEVR(30));
    await mp.withdraw_for_lender(toEVR(10e18), { from: lender1 })
      .then(assert.fail)
      .catch((error) => {
        assert.equal(error.message.substr(0, 41), 'VM Exception while processing transaction',
          'trying to withdraw for lender without making a lender deposit' +
          ' should throw an exception');
      });

    // Lender should be able to withdraw after depositing, if no trades have been added.
    await Utils.depositForLender(evr, mp, toEVR(10));
    await Utils.verifyEVRBalance(evr, lender1, initialLenderBalance - toEVR(10));
    await verifyAvailableLenderFunds(mp, 10);
    await mp.withdraw_for_lender(toEVR(10e18), { from: lender1 });
    await Utils.verifyEVRBalance(evr, lender1, initialLenderBalance);
    await verifyAvailableLenderFunds(mp, 0);

    // After depositing just enough for the lender, and then adding trades, the lender should not
    // be able to withdraw.
    await Utils.depositForLender(evr, mp, toEVR(10));
    await tryToAddTheTrades();
    await verifyState(future, mp, {
      future: {
        contracts: 10,
        costs: 80,
        deposit: toEVR(20),
        averageEntryPrice: 8,
        netLiquidationValue: 20,
        availableFunds: 0,
        excessLiquidity: 4,
        fees: toEVR(20),
      },
      marginProvider: {
        fees: toEVR(10),
      },
      traders: [
        {
          address: trader1,
          contracts: 10,
          costs: 80,
          assignedDeposit: toEVR(-20),
          unassignedDeposit: toEVR(30),
          averageEntryPrice: 8,
          netLiquidationValue: 10,
          availableFunds: 0,
          excessLiquidity: 2,
        },
      ],
    });
    await verifyAvailableLenderFunds(mp, 0);
    await mp.withdraw_for_lender(toEVR(10e18), { from: lender1 })
      .then(assert.fail)
      .catch((error) => {
        assert.equal(error.message.substr(0, 41), 'VM Exception while processing transaction',
          'trying to withdraw for lender when funds are in use' +
          ' should throw an exception');
      });

    // Deposit for another trader. Lender withdrawal should still fail.
    await Utils.depositForTrader(evr, mp, trader2, toEVR(30));
    await mp.withdraw_for_lender(toEVR(10e18), { from: lender1 })
      .then(assert.fail)
      .catch((error) => {
        assert.equal(error.message.substr(0, 41), 'VM Exception while processing transaction',
          'trying to withdraw for lender when funds are in use' +
          ' should throw an exception');
      });

    // Increase the lender deposit, and add the second trader's trades. Lender withdrawal should
    // fail.
    await Utils.depositForLender(evr, mp, toEVR(10));
    await tryToAddTheTrades(trader2);
    await verifyState(future, mp, {
      future: {
        contracts: 20,
        costs: 160,
        deposit: toEVR(40),
        averageEntryPrice: 8,
        netLiquidationValue: 40,
        availableFunds: 0,
        excessLiquidity: 8,
        fees: toEVR(40),
      },
      marginProvider: {
        fees: toEVR(20),
      },
      traders: [
        {
          address: trader1,
          contracts: 10,
          costs: 80,
          assignedDeposit: toEVR(-20),
          unassignedDeposit: toEVR(30),
          averageEntryPrice: 8,
          netLiquidationValue: 10,
          availableFunds: 0,
          excessLiquidity: 2,
        },
        {
          address: trader2,
          contracts: 10,
          costs: 80,
          assignedDeposit: toEVR(-20),
          unassignedDeposit: toEVR(30),
          averageEntryPrice: 8,
          netLiquidationValue: 10,
          availableFunds: 0,
          excessLiquidity: 2,
        },
      ],
    });
    await Utils.verifyEVRBalance(evr, lender1, initialLenderBalance - toEVR(20));
    await mp.withdraw_for_lender(toEVR(10e18), { from: lender1 })
      .then(assert.fail)
      .catch((error) => {
        assert.equal(error.message.substr(0, 41), 'VM Exception while processing transaction',
          'trying to withdraw for lender when funds are in use' +
          ' should throw an exception');
      });

    // After the second trader closes their position, the lender should be able to withdraw some --
    // but not all, of their deposit.
    await Utils.depositForTrader(evr, mp, trader2, toEVR(20));
    await addTrades(mp, 8, [trader2], [-10], future, dummyMP);
    await verifyState(future, mp, {
      future: {
        contracts: 10,
        costs: 80,
        deposit: toEVR(30),
        averageEntryPrice: 8,
        netLiquidationValue: 30,
        availableFunds: 10,
        excessLiquidity: 14,
        fees: toEVR(60),
      },
    });
    await mp.withdraw_excess_deposit_from_future(future.address, { from: lender1 });
    await verifyState(future, mp, {
      future: {
        contracts: 10,
        costs: 80,
        deposit: toEVR(20),
        averageEntryPrice: 8,
        netLiquidationValue: 20,
        availableFunds: 0,
        excessLiquidity: 4,
        fees: toEVR(60),
      },
      marginProvider: {
        fees: toEVR(30),
      },
      traders: [
        {
          address: trader1,
          contracts: 10,
          costs: 80,
          assignedDeposit: toEVR(-20),
          unassignedDeposit: toEVR(30),
          averageEntryPrice: 8,
          netLiquidationValue: 10,
          availableFunds: 0,
          excessLiquidity: 2,
        },
        {
          address: trader2,
          contracts: 0,
          costs: 0,
          assignedDeposit: toEVR(-40),
          unassignedDeposit: toEVR(50),
          averageEntryPrice: 0,
          netLiquidationValue: 10,
          availableFunds: 10,
          excessLiquidity: 10,
        },
      ],
    });
    await verifyAvailableLenderFunds(mp, 10);
    await mp.withdraw_for_lender(toEVR(20e18), { from: lender1 })
      .then(assert.fail)
      .catch((error) => {
        assert.equal(error.message.substr(0, 41), 'VM Exception while processing transaction',
          'trying to withdraw for lender when funds are in use' +
          ' should throw an exception');
      });
    await mp.withdraw_for_lender(toEVR(10e18), { from: lender1 });
    await Utils.verifyEVRBalance(evr, lender1, initialLenderBalance - toEVR(10));

    // After the second trader opens a position opposite the first trader, the lender's deposit
    // requirement should increase, not decrease (i.e. netting doesn't affect the requirement).
    await Utils.depositForTrader(evr, mp, trader2, toEVR(20));
    await Utils.depositForLender(evr, mp, toEVR(10));
    await addTrades(mp, 8, [trader2], [-10], future, dummyMP);
    await verifyState(future, mp, {
      future: {
        contracts: 0,
        costs: 0,
        deposit: toEVR(10),
        averageEntryPrice: 0,
        netLiquidationValue: 10,
        availableFunds: 10,
        excessLiquidity: 10,
        fees: toEVR(80),
      },
      marginProvider: {
        fees: toEVR(40),
      },
      traders: [
        {
          address: trader1,
          contracts: 10,
          costs: 80,
          assignedDeposit: toEVR(-20),
          unassignedDeposit: toEVR(30),
          averageEntryPrice: 8,
          netLiquidationValue: 10,
          availableFunds: 0,
          excessLiquidity: 2,
        },
        {
          address: trader2,
          contracts: -10,
          costs: -80,
          assignedDeposit: toEVR(-60),
          unassignedDeposit: toEVR(70),
          averageEntryPrice: 8,
          netLiquidationValue: 10,
          availableFunds: 0,
          excessLiquidity: 2,
        },
      ],
    });
    await verifyAvailableLenderFunds(mp, 0);
    await mp.withdraw_for_lender(toEVR(1e18), { from: lender1 })
      .then(assert.fail)
      .catch((error) => {
        assert.equal(error.message.substr(0, 41), 'VM Exception while processing transaction',
          'trying to withdraw for lender when funds are in use' +
          ' should throw an exception');
      });

    // After the future settles, the lender should be able to withdraw the rest of their deposit.
    await Utils.settleFuture(future, evrPerUSD, 0.08);
    await verifyState(future, mp, {
      future: {
        contracts: 0,
        costs: 0,
        deposit: 0,
        averageEntryPrice: 0,
        netLiquidationValue: 0,
        availableFunds: 0,
        excessLiquidity: 0,
        fees: toEVR(80),
      },
      marginProvider: {
        fees: toEVR(40),
      },
      traders: [
        {
          address: trader1,
          contracts: 0,
          costs: 0,
          assignedDeposit: toEVR(-20),
          unassignedDeposit: toEVR(30),
          averageEntryPrice: 0,
          netLiquidationValue: 10,
          availableFunds: 10,
          excessLiquidity: 10,
        },
        {
          address: trader2,
          contracts: 0,
          costs: 0,
          assignedDeposit: toEVR(-60),
          unassignedDeposit: toEVR(70),
          averageEntryPrice: 0,
          netLiquidationValue: 10,
          availableFunds: 10,
          excessLiquidity: 10,
        },
      ],
    });
    await verifyAvailableLenderFunds(mp, 20);
    await mp.withdraw_for_lender(toEVR(20e18), { from: lender1 });
    await Utils.verifyEVRBalance(evr, lender1, initialLenderBalance);
  });

  it('should allow depositing once (as lender) to support multiple futures', async () => {
    const [future1, mp, dummyMP] =
      await deployFutureAndMarginProviders(25, 20, [[lender1, 2, 1], []]);

    const future2 = await createFuture('Product2', 100, 60);
    await Utils.depositForBackstop(evr, future2, backstopDeposit, custodian);
    await mp.add_future(future2.address, 50e18, 30e18, 1e18, { from: lender1 });
    await dummyMP.add_future(future2.address, 100e18, 60e18, 0, { from: dummyLender });

    await Utils.depositForLender(evr, mp, toEVR(100));

    await Utils.depositForTrader(evr, mp, trader1, toEVR(14.5));
    await addTrades(mp, 100, [trader1], [1], future1, dummyMP);
    await verifyState(future1, mp, {
      future: {
        contracts: 1,
        costs: 100,
        deposit: toEVR(25),
        averageEntryPrice: 100,
        netLiquidationValue: 25,
        availableFunds: 0,
        excessLiquidity: 5,
        fees: toEVR(2),
      },
      marginProvider: {
        fees: toEVR(1),
      },
      traders: [
        {
          address: trader1,
          contracts: 1,
          costs: 100,
          assignedDeposit: toEVR(-2),
          unassignedDeposit: toEVR(14.5),
          averageEntryPrice: 100,
          netLiquidationValue: 12.5,
          availableFunds: 0,
          excessLiquidity: 2.5,
        },
      ],
    });

    await Utils.depositForTrader(evr, mp, trader1, toEVR(52));
    await addTrades(mp, 200, [trader1], [1], future2, dummyMP);
    await verifyState(future2, mp, {
      future: {
        contracts: 1,
        costs: 200,
        deposit: toEVR(100),
        averageEntryPrice: 200,
        netLiquidationValue: 100,
        availableFunds: 0,
        excessLiquidity: 40,
        fees: toEVR(2),
      },
      marginProvider: {
        fees: toEVR(1),
      },
      traders: [
        {
          address: trader1,
          contracts: 1,
          costs: 200,
          assignedDeposit: toEVR(-2),
          unassignedDeposit: toEVR(66.5),
          averageEntryPrice: 200,
          netLiquidationValue: 62.5,
          availableFunds: 0,
          excessLiquidity: 22.5,
        },
      ],
    });
    await verifyAvailableLenderFunds(mp, 37.5);
  });

  it('should allow depositing once (as trader) to support multiple futures', async () => {
    const [future1, mp, dummyMP] =
      await deployFutureAndMarginProviders(25, 20, [[lender1, 2, 1], []]);

    const future2 = await createFuture('Product2', 100, 60);
    await Utils.depositForBackstop(evr, future2, backstopDeposit, custodian);
    await mp.add_future(future2.address, 50e18, 30e18, 1e18, { from: lender1 });
    await dummyMP.add_future(future2.address, 100e18, 60e18, 0, { from: dummyLender });

    await Utils.depositForLender(evr, mp, toEVR(100));

    await Utils.depositForTrader(evr, mp, trader1, toEVR(66.5));

    await addTrades(mp, 100, [trader1], [1], future1, dummyMP);
    await verifyState(future1, mp, {
      future: {
        contracts: 1,
        costs: 100,
        deposit: toEVR(25),
        averageEntryPrice: 100,
        netLiquidationValue: 25,
        availableFunds: 0,
        excessLiquidity: 5,
        fees: toEVR(2),
      },
      marginProvider: {
        fees: toEVR(1),
      },
      traders: [
        {
          address: trader1,
          contracts: 1,
          costs: 100,
          assignedDeposit: toEVR(-2),
          unassignedDeposit: toEVR(66.5),
          averageEntryPrice: 100,
          netLiquidationValue: 64.5,
          availableFunds: 52,
          excessLiquidity: 54.5,
        },
      ],
    });

    await addTrades(mp, 200, [trader1], [1], future2, dummyMP);
    await verifyState(future2, mp, {
      future: {
        contracts: 1,
        costs: 200,
        deposit: toEVR(100),
        averageEntryPrice: 200,
        netLiquidationValue: 100,
        availableFunds: 0,
        excessLiquidity: 40,
        fees: toEVR(2),
      },
      marginProvider: {
        fees: toEVR(1),
      },
      traders: [
        {
          address: trader1,
          contracts: 1,
          costs: 200,
          assignedDeposit: toEVR(-2),
          unassignedDeposit: toEVR(66.5),
          averageEntryPrice: 200,
          netLiquidationValue: 62.5,
          availableFunds: 0,
          excessLiquidity: 22.5,
        },
      ],
    });
    await verifyAvailableLenderFunds(mp, 37.5);

    // Deposits are all locked up. We shouldn't be able to add trades.
    await addTrades(mp, 100, [trader1], [1], future1, dummyMP)
      .then(assert.fail)
      .catch((error) => {
        assert.equal(error.message, 'not enough trader deposit',
          'trying to trade without making a trader deposit should fail');
      });

    // Close the position on future2. This should free up funds for the trade on future1.
    await addTrades(mp, 200, [trader1], [-1], future2, dummyMP);
    await verifyState(future2, mp, {
      future: {
        contracts: 0,
        costs: 0,
        deposit: toEVR(100),
        averageEntryPrice: 0,
        netLiquidationValue: 100,
        availableFunds: 100,
        excessLiquidity: 100,
        fees: toEVR(4),
      },
      marginProvider: {
        fees: toEVR(2),
      },
      traders: [
        {
          address: trader1,
          contracts: 0,
          costs: 0,
          assignedDeposit: toEVR(-4),
          unassignedDeposit: toEVR(66.5),
          averageEntryPrice: 0,
          netLiquidationValue: 60.5,
          availableFunds: 48,
          excessLiquidity: 50.5,
        },
      ],
    });

    // Now that we've reduced our position on future2, we should be able to increase it on future1.
    // This is the same trade that should have failed above.
    await addTrades(mp, 100, [trader1], [1], future1, dummyMP);
    await verifyState(future1, mp, {
      future: {
        contracts: 2,
        costs: 200,
        deposit: toEVR(50),
        averageEntryPrice: 100,
        netLiquidationValue: 50,
        availableFunds: 0,
        excessLiquidity: 10,
        fees: toEVR(4),
      },
      marginProvider: {
        fees: toEVR(2),
      },
      traders: [
        {
          address: trader1,
          contracts: 2,
          costs: 200,
          assignedDeposit: toEVR(-4),
          unassignedDeposit: toEVR(66.5),
          averageEntryPrice: 100,
          netLiquidationValue: 58.5,
          availableFunds: 33.5,
          excessLiquidity: 38.5,
        },
      ],
    });
  });

  it('should mark and liquidate a position', async () => {
    const [future, mp, dummyMP] = await deployFutureAndMarginProviders(2, 1.6,
      [[lender1, 2, 1], []]);
    // Trader will try to buy 10 contracts at a price of 8 EVR each.
    // With an initial margin of 25%, they should be required to deposit 10 EVR + 20 EVR fees,
    // with 10 more EVR coming from the lender.
    const tryToAddTheTrades = async trader =>
      addTrades(mp, 8, [trader || trader1], [10], future, dummyMP);

    await Utils.depositForTrader(evr, mp, trader1, toEVR(30));
    await Utils.depositForLender(evr, mp, toEVR(10));

    await tryToAddTheTrades();
    await verifyState(future, mp, {
      future: {
        contracts: 10,
        costs: 80,
        deposit: toEVR(20),
        averageEntryPrice: 8,
        netLiquidationValue: 20,
        availableFunds: 0,
        excessLiquidity: 4,
        fees: toEVR(20),
      },
      marginProvider: {
        fees: toEVR(10),
      },
      traders: [
        {
          address: trader1,
          contracts: 10,
          costs: 80,
          assignedDeposit: toEVR(-20),
          unassignedDeposit: toEVR(30),
          averageEntryPrice: 8,
          netLiquidationValue: 10,
          availableFunds: 0,
          excessLiquidity: 2,
        },
      ],
    });

    const tryMark = async (price) => {
      const priceUSDWei = Utils.toWei(price);

      // Mark on the future so that the price is updated.
      await future.mark_position(priceUSDWei, mp.address);

      const [canMark, errorMessageBytes] = await mp.mark_position.call(
        future.address, priceUSDWei, trader1);
      const errorMessage = web3.toUtf8(errorMessageBytes);
      assert(canMark, errorMessage);
      await mp.mark_position(future.address, priceUSDWei, trader1);
    };

    // Mark to a price the leaves trader1 with a loss, but still with non-negative excess liquidity.
    await tryMark(7.8);
    await verifyState(future, mp, {
      future: {
        contracts: 10,
        costs: 80,
        deposit: toEVR(20),
        averageEntryPrice: 8,
        netLiquidationValue: 20,
        availableFunds: 0,
        excessLiquidity: 4,
        fees: toEVR(20),
      },
      marginProvider: {
        fees: toEVR(10),
      },
      traders: [
        {
          address: trader1,
          contracts: 10,
          costs: 80,
          assignedDeposit: toEVR(-20),
          unassignedDeposit: toEVR(30),
          averageEntryPrice: 8,
          netLiquidationValue: 8,
          availableFunds: -2,
          excessLiquidity: 0,
        },
        {
          address: lender1,
          contracts: 0,
          costs: 0,
          assignedDeposit: 0,
          unassignedDeposit: 0,
          averageEntryPrice: 0,
          netLiquidationValue: 0,
          availableFunds: 0,
          excessLiquidity: 0,
        },
      ],
    });

    // Marking to a price less than 7.8 should cause trader1's position to be assigned to lender1.
    await tryMark(7.7);
    await verifyState(future, mp, {
      future: {
        contracts: 10,
        costs: 80,
        deposit: toEVR(20),
        averageEntryPrice: 8,
        netLiquidationValue: 20,
        availableFunds: 0,
        excessLiquidity: 4,
        fees: toEVR(20),
      },
      marginProvider: {
        fees: toEVR(10),
      },
      traders: [
        {
          // Only part of the trader's position should be reassigned.
          // Since they still have nlv of 7 EVR, they should be able to keep whatever position only
          // requires 7 EVR of initial margin.
          // So that's 7 / 1 = 7 contracts.
          address: trader1,
          contracts: 7, // 7 / 1
          costs: 56, // 7 * 8
          assignedDeposit: toEVR(-20.9), // -20 + -0.3 * (10 - 7); original - (realized losses)
          unassignedDeposit: toEVR(30),
          averageEntryPrice: 8,
          netLiquidationValue: 7, // 10 + 10 * -0.3
          availableFunds: 0, // 7 - 1 * 7
          excessLiquidity: 1.4, // 7 - 0.8 * 7
        },
        {
          address: lender1,
          contracts: 3, // 10 - 7
          costs: 23.1, // 3 * 7.7
          assignedDeposit: 0,
          unassignedDeposit: toEVR(3), // 1 * 3
          averageEntryPrice: 7.7,
          netLiquidationValue: 3,
          availableFunds: 0,
          excessLiquidity: 0.6, // 3 * (1 - 0.8)
        },
      ],
    });
  });

  it('should update margin requirements and then mark a position', async () => {
    const [future, mp, dummyMP] = await deployFutureAndMarginProviders(2, 1.6,
      [[lender1, 2, 1], []]);

    // Trader will try to buy 10 contracts at a price of 8 EVR each.
    // With an initial margin of 25%, they should be required to deposit 10 EVR + 20 EVR fees,
    // with 10 more EVR coming from the lender.
    const tryToAddTheTrades = async trader =>
      addTrades(mp, 8, [trader || trader1], [10], future, dummyMP);

    await Utils.depositForTrader(evr, mp, trader1, toEVR(30));
    await Utils.depositForLender(evr, mp, toEVR(10));

    await tryToAddTheTrades();
    await verifyState(future, mp, {
      future: {
        contracts: 10,
        costs: 80,
        deposit: toEVR(20),
        averageEntryPrice: 8,
        netLiquidationValue: 20,
        availableFunds: 0,
        excessLiquidity: 4,
        fees: toEVR(20),
      },
      marginProvider: {
        fees: toEVR(10),
      },
      traders: [
        {
          address: trader1,
          contracts: 10,
          costs: 80,
          assignedDeposit: toEVR(-20),
          unassignedDeposit: toEVR(30),
          averageEntryPrice: 8,
          netLiquidationValue: 10,
          availableFunds: 0,
          excessLiquidity: 2,
        },
      ],
    });

    // Now double the margin requirements, and then mark the position. Part of trader1's position
    // should be assigned to lender1.
    await mp.set_margin(future.address, 2e18, 1.6e18, { from: lender1 });

    const tryMark = async (price) => {
      const priceUSDWei = Utils.toWei(price);

      // Mark on the future so that the price is updated.
      await future.mark_position(priceUSDWei, mp.address);

      const [canMark, errorMessageBytes] = await mp.mark_position.call(
        future.address, priceUSDWei, trader1);
      const errorMessage = web3.toUtf8(errorMessageBytes);
      assert(canMark, errorMessage);
      await mp.mark_position(future.address, priceUSDWei, trader1);
    };

    await tryMark(8);
    await verifyState(future, mp, {
      future: {
        contracts: 10,
        costs: 80,
        deposit: toEVR(20),
        averageEntryPrice: 8,
        netLiquidationValue: 20,
        availableFunds: 0,
        excessLiquidity: 4,
        fees: toEVR(20),
      },
      marginProvider: {
        fees: toEVR(10),
      },
      traders: [
        {
          address: trader1,
          contracts: 5, // 10 / 2
          costs: 40, // 5 * 8
          assignedDeposit: toEVR(-20),
          unassignedDeposit: toEVR(30),
          averageEntryPrice: 8,
          netLiquidationValue: 10,
          availableFunds: 0, // 10 - (5 * 2)
          excessLiquidity: 2, // 10 - (5 * 1.6)
        },
        {
          address: lender1,
          contracts: 5, // 10 - 5
          costs: 40, // 5 * 8
          assignedDeposit: toEVR(0),
          unassignedDeposit: toEVR(10), // 5 * 2
          averageEntryPrice: 8,
          netLiquidationValue: 10, // 5 * 2
          availableFunds: 0,
          excessLiquidity: 2, // 5 * (2 - 1.6)
        },
      ],
    });

    Utils.verifyLenderBalance(mp, toEVR(0)); // 10 - 10
  });

  // TODO(rogs): test withdrawing from the future, after settlement
  // TODO(rogs): test lender withdrawal from the margin provider
});
