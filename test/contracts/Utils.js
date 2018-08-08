/* eslint no-undef: 0 */

const CentralizedOracle = artifacts.require('CentralizedOracle');
const MarginProvider = artifacts.require('MarginProvider');

const toWei = x => web3.toWei(x, 'ether');

async function verifyEVRBalance(evr, address, numEVR) {
  return evr.balanceOf(address).then(n =>
    assert.equal(n.dividedBy(1e18).valueOf(), numEVR, 'EVR balance'));
}

async function verifyBalancesOnFuture(future, trader, contracts, costs, deposit) {
  return Promise.all([
    future.get_contract_balance_atto(trader).then(n =>
      assert.equal(n / 1e18, contracts, 'contract balance')),
    future.get_cost_balance_usd_wei(trader).then(n =>
      assert.equal(n / 1e18, costs, 'cost balance')),
    future.get_deposit_balance_evr_wei(trader).then(n =>
      assert.equal(n / 1e18, deposit, 'deposit balance')),
  ]);
}

async function verifyBalancesOnMarginProvider(mp, future, trader, contracts, costs,
  assignedDeposit, unassignedDeposit) {
  return Promise.all([
    mp.get_contract_balance_atto(future.address, trader).then(n =>
      assert.equal(n / 1e18, contracts, 'contract balance')),
    mp.get_cost_balance_usd_wei(future.address, trader).then(n =>
      assert.equal(n / 1e18, costs, 'cost balance')),
    mp.get_deposit_balance_evr_wei(future.address, trader).then(n =>
      assert.equal(n / 1e18, assignedDeposit, 'deposit assigned to future')),
    mp.get_trader_balance_evr_wei(trader).then(n =>
      assert.equal(n / 1e18, unassignedDeposit, 'unassigned deposit')),
  ]);
}

async function verifyLenderBalance(mp, numEVR) {
  return mp.get_lender_balance_evr_wei().then(n =>
    assert.equal(n / 1e18, numEVR, 'lender balance'));
}

async function verifyBackstopBalance(future, numEVR) {
  return future.get_backstop_deposit_balance_evr_wei().then(n =>
    assert.equal(n / 1e18, numEVR, 'backstop balance'));
}

async function verifyOtherStatsOnFuture(future, trader, evrPerUSD, stats) {
  const evrPerUSDWei = toWei(evrPerUSD);
  const currentPriceUSDWei = await future.get_current_price_usd_wei();

  return Promise.all([
    future.get_average_entry_price_usd_wei(trader).then(n =>
      assert.equal(n / 1e18, stats.averageEntryPrice, 'average entry price')),

    future.get_net_liquidation_value_usd_wei(trader, evrPerUSDWei, currentPriceUSDWei).then(n =>
      assert.equal(n / 1e18, stats.netLiquidationValue, 'net liquidation value')),

    future.get_available_funds_usd_wei(trader, evrPerUSDWei, currentPriceUSDWei).then(n =>
      assert.equal(n / 1e18, stats.availableFunds, 'available funds')),

    future.get_excess_liquidity_usd_wei(trader, evrPerUSDWei, currentPriceUSDWei).then(n =>
      assert.equal(n / 1e18, stats.excessLiquidity, 'excess liquidity')),
  ]);
}

async function verifyOtherStatsOnMarginProvider(mp, future, trader, evrPerUSD, stats) {
  const evrPerUSDWei = toWei(evrPerUSD);

  return Promise.all([
    mp.get_average_entry_price_usd_wei(future.address, trader).then(n =>
      assert.equal(n / 1e18, stats.averageEntryPrice, 'average entry price')),

    mp.get_net_liquidation_value_usd_wei(trader, evrPerUSDWei).then(n =>
      assert.equal(n / 1e18, stats.netLiquidationValue, 'net liquidation value')),

    mp.get_available_funds_usd_wei(trader, evrPerUSDWei).then(n =>
      assert.equal(n / 1e18, stats.availableFunds, 'available funds')),

    mp.get_excess_liquidity_usd_wei(trader, evrPerUSDWei).then(n =>
      assert.equal(n / 1e18, stats.excessLiquidity, 'excess liquidity')),
  ]);
}

async function verifyFeeBalance(future, numEVR) {
  return future.get_fee_balance_evr_wei().then(n =>
    assert.equal(n / 1e18, numEVR, 'fee balance'));
}

async function verifyMarginProviderFeeBalance(mp, numEVR) {
  return mp.get_lender_fee_balance_evr_wei().then(n =>
    assert.equal(n / 1e18, numEVR, 'fee balance'));
}

async function verifyMarginProviderFutureFeeBalance(mp, future, numEVR) {
  return mp.get_fee_balance_evr_wei(future.address).then(n =>
    assert.equal(n / 1e18, numEVR, 'fee balance'));
}

async function depositForTrader(evr, mp, trader, numEVR, sender) {
  await evr.approve(mp.address, toWei(numEVR), { from: sender || trader });
  return mp.deposit(trader, toWei(numEVR), { from: sender || trader });
}

async function depositForLender(evr, mp, numEVR) {
  const lender = await mp.get_lender();
  await evr.approve(mp.address, toWei(numEVR), { from: lender });
  return mp.deposit_for_lender(toWei(numEVR), { from: lender });
}

async function depositForBackstop(evr, future, numEVR, sender) {
  await evr.approve(future.address, toWei(numEVR), { from: sender });
  return future.deposit_for_backstop(toWei(numEVR));
}

async function addTradesToFuture(future, evrPerUSD, price, trades) {
  const evrPerUSDWei = toWei(evrPerUSD);
  const priceUSDWei = toWei(price);
  const marginProviders = [...new Set(trades.map(t => t.marginProvider))];
  const groupedTrades = marginProviders.map(m => trades.filter(t => t.marginProvider === m));
  const mpTraderPairCounts = groupedTrades.map(ts => ts.length);
  const tradesInOrder = [].concat(...groupedTrades);
  const traders = tradesInOrder.map(t => t.trader);
  const sizesAtto = tradesInOrder.map(t => toWei(t.size));

  const [canAddTrades, errorMessageBytes] =
    await future.try_add_trades_with_margin_providers.call(
      evrPerUSDWei,
      priceUSDWei,
      marginProviders,
      mpTraderPairCounts,
      traders,
      sizesAtto,
    );
  assert(canAddTrades, web3.toUtf8(errorMessageBytes));
  return future.add_trades_with_margin_providers(
    evrPerUSDWei,
    priceUSDWei,
    marginProviders,
    mpTraderPairCounts,
    traders,
    sizesAtto,
  );
}

async function settleFuture(future, evrPerUSD, price) {
  const oracle = await CentralizedOracle.at(await future.get_oracle());
  await oracle.setOutcome(toWei(price));
  await future.expire();
  await future.settle();
  await checkBalancesOnFuturesMarginProviders(future, evrPerUSD);
}

async function checkMarginProviderBalances(mp, evrPerUSD) {
  const strictBalanceCheck = await mp.check_balances_strict(toWei(evrPerUSD));
  assert(strictBalanceCheck, 'margin provider balances don\'t match');
}

async function checkBalancesOnFuturesMarginProviders(future, evrPerUSD) {
  const addrs = await future.get_traders();
  const mps = await Promise.all(addrs.map(a => MarginProvider.at(a)));
  return Promise.all(mps.map(mp => checkMarginProviderBalances(mp, evrPerUSD)));
}

module.exports = {
  toWei,
  verifyBalancesOnFuture,
  verifyBalancesOnMarginProvider,
  verifyLenderBalance,
  verifyBackstopBalance,
  verifyEVRBalance,
  verifyOtherStatsOnFuture,
  verifyOtherStatsOnMarginProvider,
  verifyFeeBalance,
  verifyMarginProviderFeeBalance,
  verifyMarginProviderFutureFeeBalance,
  depositForTrader,
  depositForLender,
  depositForBackstop,
  addTradesToFuture,
  settleFuture,
  checkMarginProviderBalances,
  checkBalancesOnFuturesMarginProviders,
};
