/* eslint no-undef: 0 */

const EVRToken = artifacts.require('EVRToken');
const ExchangeRates = artifacts.require('ExchangeRates');
const FutureFactory = artifacts.require('FutureFactory');
const Future = artifacts.require('Future');
const MarginProvider = artifacts.require('MarginProvider');
const Utils = require('./Utils.js');

contract('Future', (accounts) => {
  let evr;
  let future;
  let mp1;
  let mp2;
  const productName = 'Product';
  const custodian = accounts[0];
  const trader1 = accounts[1];
  const trader2 = accounts[2];
  const trader3 = accounts[3];
  const lender1 = accounts[4];
  const lender2 = accounts[5];
  const evrPerUSD = 3;
  const toEVR = usd => web3.toBigNumber(usd).times(evrPerUSD).toNumber();
  const mintAmount = toEVR(100);

  beforeEach(async () => {
    // deploy new EVRToken, ExchangeRates, and FutureFactory for each test
    evr = await EVRToken.new({ from: custodian });
    const rates = await ExchangeRates.new(custodian);
    const futureFactory = await FutureFactory.new(evr.address, rates.address);

    // Set the exchange rate.
    await rates.set_rate('USD', Utils.toWei(evrPerUSD), { from: custodian });

    // deploy a future with standard parameters
    await futureFactory.create_future(
      productName, productName, Date.UTC(1970, 0, 1), 25e18, 20e18, 5000, 1e18, 1e6);
    const addr = await futureFactory.futures(productName);
    future = await Future.at(addr);

    mp1 = await MarginProvider.new(evr.address, lender1, rates.address, 'USD');
    mp2 = await MarginProvider.new(evr.address, lender2, rates.address, 'USD');
    await mp1.add_future(future.address, 12.5e18, 10e18, 0, { from: lender1 });
    await mp2.add_future(future.address, 12.5e18, 10e18, 0, { from: lender2 });

    // mint EVR for custodian
    await evr.mintFor(Utils.toWei(mintAmount), custodian);

    // mint EVR for traders
    await evr.mintFor(Utils.toWei(mintAmount), trader1);
    await evr.mintFor(Utils.toWei(mintAmount), trader2);
    await evr.mintFor(Utils.toWei(mintAmount), trader3);
    await evr.mintFor(Utils.toWei(mintAmount), lender1);
    await evr.mintFor(Utils.toWei(mintAmount), lender2);
  });

  async function withdrawFromMarginProvider(mp, trader, numEVR) {
    await mp.withdraw(trader, Utils.toWei(numEVR), { from: trader });
  }

  async function makeDepositsToMPs(numEVR) {
    return Promise.all([
      Utils.depositForLender(evr, mp1, numEVR),
      Utils.depositForLender(evr, mp2, numEVR),
      Utils.depositForTrader(evr, mp1, trader1, numEVR),
      Utils.depositForTrader(evr, mp2, trader2, numEVR),
      // The backstop deposit requirement is .5 * (the sum of all required maitenance deposits),
      // which equals .5 * (2 * exposure / 5) = exposure / 5. So exposure / 3 is more than enough.
      Utils.depositForBackstop(evr, future, numEVR, custodian),
    ]);
  }

  async function depositAndAddTrades(price, numEVR) {
    await makeDepositsToMPs(numEVR);

    await Utils.addTradesToFuture(future, evrPerUSD, price, [
      { trader: trader1, marginProvider: mp1.address, size: -1 },
      { trader: trader2, marginProvider: mp2.address, size: 1 },
    ]);
  }

  it('should allow taking a position', async () => {
    await depositAndAddTrades(100, toEVR(33));
    return Promise.all([
      Utils.verifyBalancesOnFuture(future, mp1.address, -1, -100, toEVR(25)),
      Utils.verifyBalancesOnFuture(future, mp2.address, 1, 100, toEVR(25)),
      Utils.verifyFeeBalance(future, toEVR(2)),
    ]);
  });

  it('should allow taking a position with leverage', async () => {
    await Promise.all([
      Utils.depositForLender(evr, mp1, toEVR(12.5)),
      Utils.depositForLender(evr, mp2, toEVR(12.5)),
      // 13.5 = 12.5 + 1 EVR for fees
      Utils.depositForTrader(evr, mp1, trader1, toEVR(13.5)),
      Utils.depositForTrader(evr, mp2, trader2, toEVR(13.5)),
      Utils.depositForBackstop(evr, future, toEVR(33), custodian),
    ]);

    await Utils.addTradesToFuture(future, evrPerUSD, 100, [
      { trader: trader1, marginProvider: mp1.address, size: -1 },
      { trader: trader2, marginProvider: mp2.address, size: 1 },
    ]);
    return Promise.all([
      Utils.verifyBalancesOnMarginProvider(mp1, future, trader1, -1, -100, toEVR(-1), toEVR(13.5)),
      Utils.verifyBalancesOnMarginProvider(mp2, future, trader2, 1, 100, toEVR(-1), toEVR(13.5)),
      Utils.verifyFeeBalance(future, toEVR(2)),
    ]);
  });

  it('should allow taking a position and doubling up', async () => {
    await depositAndAddTrades(100, toEVR(33));
    await Promise.all([
      Utils.verifyBalancesOnFuture(future, mp1.address, -1, -100, toEVR(25)),
      Utils.verifyBalancesOnFuture(future, mp2.address, 1, 100, toEVR(25)),
    ]);

    // Double up double up!
    await depositAndAddTrades(100, toEVR(33));
    return Promise.all([
      Utils.verifyBalancesOnFuture(future, mp1.address, -2, -200, toEVR(50)),
      Utils.verifyBalancesOnFuture(future, mp2.address, 2, 200, toEVR(50)),
      Utils.verifyFeeBalance(future, toEVR(4)),
    ]);
  });

  it('should allow withdrawing excess collateral', async () => {
    const initialTraderBalance = (await evr.balanceOf(trader1)) / 1e18;

    await depositAndAddTrades(100, toEVR(33));
    await Utils.verifyBalancesOnFuture(future, mp1.address, -1, -100, toEVR(25));
    await Utils.verifyOtherStatsOnFuture(future, mp1.address, evrPerUSD, {
      averageEntryPrice: 100,
      netLiquidationValue: 25,
      availableFunds: 0,
      excessLiquidity: 5,
    });
    await Utils.verifyEVRBalance(evr, mp1.address, toEVR(40)); // (2 * 33) - 26

    // Undo half of the trades, so that we've got excess deposit on the Future.
    await Utils.addTradesToFuture(future, evrPerUSD, 100, [
      { trader: trader1, marginProvider: mp1.address, size: 0.5 },
      { trader: trader2, marginProvider: mp2.address, size: -0.5 },
    ]);
    await Utils.verifyBalancesOnFuture(future, mp1.address, -0.5, -50, toEVR(24.5));

    await mp1.withdraw_excess_deposit_from_future(future.address, { from: lender1 });
    await Utils.verifyBalancesOnFuture(future, mp1.address, -0.5, -50, toEVR(12.5));
    await Utils.verifyOtherStatsOnFuture(future, mp1.address, evrPerUSD, {
      averageEntryPrice: 100,
      netLiquidationValue: 12.5,
      availableFunds: 0,
      excessLiquidity: 2.5,
    });
    await Utils.verifyEVRBalance(evr, mp1.address, toEVR(52)); // 40 + 12

    await withdrawFromMarginProvider(mp1, trader1, toEVR(25.25)); // 33 - (50 * 0.125) - 1.5
    await Utils.verifyEVRBalance(evr, trader1, initialTraderBalance - toEVR(7.75)); // 6.25 + 1.5
    await Promise.all([
      Utils.verifyBalancesOnMarginProvider(mp1, future, trader1, -0.5, -50, toEVR(-1.5),
        toEVR(7.75)),
      Utils.verifyBalancesOnMarginProvider(mp2, future, trader2, 0.5, 50, toEVR(-1.5), toEVR(33)),
    ]);
  });

  it('should not settle if oracle outcome is not set', async () => {
    await depositAndAddTrades(100, toEVR(33));

    // Settlement w/o setting oracle outcome.
    return future.settle()
      .then(assert.fail)
      .catch((error) => {
        assert.equal(error.message.substr(0, 41), 'VM Exception while processing transaction',
          'settling before the oracle outcome is set should throw an exception');
      });
  });

  it('should settle the contract after adding trades', async () => {
    await depositAndAddTrades(100, toEVR(33));
    await Utils.settleFuture(future, evrPerUSD, 0.95);

    return Promise.all([
      Utils.verifyBalancesOnFuture(future, mp1.address, 0, 0, 0),
      Utils.verifyBalancesOnFuture(future, mp2.address, 0, 0, 0),
      Utils.verifyBalancesOnMarginProvider(mp1, future, trader1, 0, 0, toEVR(4), toEVR(33)),
      Utils.verifyBalancesOnMarginProvider(mp2, future, trader2, 0, 0, toEVR(-6), toEVR(33)),
      Utils.verifyFeeBalance(future, toEVR(2)),
    ]);
  });

  it('should settle the contract after adding trades (netted)', async () => {
    // both traders deposit to same margin provider
    await Promise.all([
      Utils.depositForLender(evr, mp1, toEVR(25)),
      Utils.depositForTrader(evr, mp1, trader1, toEVR(33)),
      Utils.depositForTrader(evr, mp1, trader2, toEVR(33)),
      Utils.depositForBackstop(evr, future, toEVR(33), custodian),
    ]);

    await Utils.addTradesToFuture(future, evrPerUSD, 100, [
      { trader: trader1, marginProvider: mp1.address, size: -1 },
      { trader: trader2, marginProvider: mp1.address, size: 1 },
    ]);

    // verify no net positon on future
    await Utils.verifyBalancesOnFuture(future, mp1.address, 0, 0, 0);

    await Utils.settleFuture(future, evrPerUSD, 0.95);

    // verify no net positon on future after settlement
    return Promise.all([
      Utils.verifyBalancesOnFuture(future, mp1.address, 0, 0, 0),
      Utils.verifyBalancesOnMarginProvider(mp1, future, trader1, 0, 0, toEVR(4), toEVR(33)),
      Utils.verifyBalancesOnMarginProvider(mp1, future, trader2, 0, 0, toEVR(-6), toEVR(33)),
      Utils.verifyLenderBalance(mp1, toEVR(25)),
    ]);
  });

  it('should allow withdrawing trader deposits after settlement', async () => {
    const initialBalance1 = (await evr.balanceOf(trader1)) / 1e18;
    const initialBalance2 = (await evr.balanceOf(trader2)) / 1e18;
    await depositAndAddTrades(100, toEVR(33));
    await Utils.settleFuture(future, evrPerUSD, 0.95);
    await withdrawFromMarginProvider(mp1, trader1, toEVR(37));
    await withdrawFromMarginProvider(mp2, trader2, toEVR(27));

    return Promise.all([
      Utils.verifyEVRBalance(evr, trader1, initialBalance1 + toEVR(4)),
      Utils.verifyEVRBalance(evr, trader2, initialBalance2 - toEVR(6)),
      Utils.verifyEVRBalance(evr, mp1.address, toEVR(33)),
      Utils.verifyEVRBalance(evr, mp2.address, toEVR(33)),
      Utils.verifyBalancesOnMarginProvider(mp1, future, trader1, 0, 0, toEVR(4), toEVR(-4)),
      Utils.verifyBalancesOnMarginProvider(mp2, future, trader2, 0, 0, toEVR(-6), toEVR(6)),
    ]);
  });

  it('should not allow withdrawing fees before settlement', async () => {
    await depositAndAddTrades(100, toEVR(33));
    return future.withdraw_fees()
      .then(assert.fail)
      .catch((error) => {
        assert.equal(error.message.substr(0, 41), 'VM Exception while processing transaction',
          'withdrawing fees before the oracle outcome is set should throw an exception');
      });
  });

  it('should withdraw backstop deposit after expiration', async () => {
    const initialBalance = (await evr.balanceOf(custodian)) / 1e18;

    await depositAndAddTrades(100, toEVR(33));
    await Utils.verifyEVRBalance(evr, custodian, initialBalance - toEVR(33));

    await Utils.settleFuture(future, evrPerUSD, 0.95);
    await future.withdraw_for_backstop(Utils.toWei(toEVR(33)));
    return Utils.verifyEVRBalance(evr, custodian, initialBalance);
  });

  it('should withdraw fees after expiration', async () => {
    const initialBalance = (await evr.balanceOf(custodian)) / 1e18;
    const expectedFees = toEVR(2);

    await depositAndAddTrades(100, toEVR(33));
    await Utils.verifyEVRBalance(evr, custodian, initialBalance - toEVR(33));
    await Utils.verifyFeeBalance(future, expectedFees);

    await Utils.settleFuture(future, evrPerUSD, 0.95);
    await future.withdraw_fees();
    await Utils.verifyFeeBalance(future, 0);
    return Utils.verifyEVRBalance(evr, custodian, (initialBalance - toEVR(33)) + expectedFees);
  });

  it('should update balances on margin providers', async () => {
    await Promise.all([
      Utils.depositForLender(evr, mp1, toEVR(37.5)),
      // 13.5 = 12.5 + 1 EVR for fees
      Utils.depositForTrader(evr, mp1, trader1, toEVR(13.5)),
      Utils.depositForTrader(evr, mp1, trader2, toEVR(27)),
      Utils.depositForLender(evr, mp2, toEVR(12.5)),
      Utils.depositForTrader(evr, mp2, trader3, toEVR(13.5)),
      Utils.depositForBackstop(evr, future, toEVR(40), custodian),
    ]);
    await Promise.all([
      Utils.verifyBalancesOnMarginProvider(mp1, future, trader1, 0, 0, 0, toEVR(13.5)),
      Utils.verifyBalancesOnMarginProvider(mp1, future, trader2, 0, 0, 0, toEVR(27)),
      Utils.verifyBalancesOnMarginProvider(mp2, future, trader3, 0, 0, 0, toEVR(13.5)),
      Utils.verifyBalancesOnFuture(future, trader1, 0, 0, 0),
      Utils.verifyBalancesOnFuture(future, trader2, 0, 0, 0),
      Utils.verifyBalancesOnFuture(future, trader3, 0, 0, 0),
      Utils.verifyBackstopBalance(future, toEVR(40)),
    ]);

    const [canAddTrades, errorMessageBytes] =
      await future.try_add_trades_with_margin_providers.call(
        Utils.toWei(evrPerUSD),
        Utils.toWei(100),
        [mp1.address, mp2.address],
        [2, 1],
        [trader1, trader2, trader3],
        [Utils.toWei(-1), Utils.toWei(2), Utils.toWei(-1)],
      );
    assert(canAddTrades, web3.toUtf8(errorMessageBytes));

    // Now, actually add the trades.
    await future.add_trades_with_margin_providers(
      Utils.toWei(evrPerUSD),
      Utils.toWei(100),
      [mp1.address, mp2.address],
      [2, 1],
      [trader1, trader2, trader3],
      [Utils.toWei(-1), Utils.toWei(2), Utils.toWei(-1)],
    );
    return Promise.all([
      Utils.verifyBalancesOnMarginProvider(mp1, future, trader1, -1, -100, toEVR(-1), toEVR(13.5)),
      Utils.verifyBalancesOnMarginProvider(mp1, future, trader2, 2, 200, toEVR(-2), toEVR(27)),
      Utils.verifyBalancesOnMarginProvider(mp2, future, trader3, -1, -100, toEVR(-1), toEVR(13.5)),
      Utils.verifyBalancesOnFuture(future, trader1, 0, 0, 0),
      Utils.verifyBalancesOnFuture(future, trader2, 0, 0, 0),
      Utils.verifyBalancesOnFuture(future, trader3, 0, 0, 0),
      Utils.verifyBalancesOnFuture(future, mp1.address, 1, 100, toEVR(25)),
      Utils.verifyBalancesOnFuture(future, mp2.address, -1, -100, toEVR(25)),
    ]);
  });

  it('should mark a position', async () => {
    await depositAndAddTrades(100, toEVR(33));
    await Promise.all([
      Utils.verifyBalancesOnFuture(future, mp1.address, -1, -100, toEVR(25)),
      Utils.verifyBalancesOnFuture(future, mp2.address, 1, 100, toEVR(25)),
      Utils.verifyBackstopBalance(future, toEVR(33)),
    ]);

    const [canMark, errorMessageBytes] = await future.mark_position.call(80e18, mp2.address);
    assert(canMark, web3.toUtf8(errorMessageBytes));
    await future.mark_position(80e18, mp2.address);
    await Promise.all([
      Utils.verifyBalancesOnFuture(future, mp2.address,
        0.2, // (25 - 20) / 25
        20, // 0.2 * 100
        toEVR(9)), // 25 - ((1 - 0.2) * (100 - 80))
      Utils.verifyOtherStatsOnFuture(future, mp2.address, evrPerUSD, {
        averageEntryPrice: 100,
        netLiquidationValue: 5,
        availableFunds: 0, // 5 - (0.2 * 25)
        excessLiquidity: 1, // 5 - (0.2 * 20)
      }),
      Utils.verifyBalancesOnFuture(future, custodian,
        0.8, // 1 - 0.2
        64, // 0.8 * 80
        toEVR(20)), // 0.8 * 25
      Utils.verifyBackstopBalance(future, toEVR(13)), // 33 - 20
    ]);
  });

  it('should update margin requirements and then mark positions', async () => {
    await depositAndAddTrades(100, toEVR(25));
    await Promise.all([
      Utils.verifyBalancesOnFuture(future, mp1.address, -1, -100, toEVR(25)),
      Utils.verifyBalancesOnFuture(future, mp2.address, 1, 100, toEVR(25)),
      Utils.verifyBackstopBalance(future, toEVR(25)),
    ]);

    await future.set_margin(50e18, 60e18)
      .then(assert.fail)
      .catch((error) => {
        assert.equal(error.message.substr(0, 41), 'VM Exception while processing transaction',
          'maintenance margin must be less than or equal to initial margin');
      });

    await future.set_margin(50e18, 40e18);

    const [canMark, errorMessageBytes] = await future.mark_position.call(100e18, mp2.address);
    assert(canMark, web3.toUtf8(errorMessageBytes));
    await future.mark_position(100e18, mp2.address);
    await Promise.all([
      Utils.verifyBalancesOnFuture(future, mp2.address,
        0.5, // 25 / 50
        50, // 0.5 * 100
        toEVR(25)),
      Utils.verifyOtherStatsOnFuture(future, mp2.address, evrPerUSD, {
        averageEntryPrice: 100,
        netLiquidationValue: 25,
        availableFunds: 0, // 25 - (0.5 * 50)
        excessLiquidity: 5, // 25 - (0.5 * 40)
      }),
      Utils.verifyBalancesOnFuture(future, custodian,
        0.5, // 1 - 0.5
        50, // 0.5 * 100
        toEVR(25)), // 0.5 * 50
      Utils.verifyBackstopBalance(future, toEVR(0)), // 25 - 25
    ]);
  });
});
