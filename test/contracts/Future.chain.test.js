/* eslint no-undef: 0 */

const EVRToken = artifacts.require('EVRToken');
const ExchangeRates = artifacts.require('ExchangeRates');
const FutureFactory = artifacts.require('FutureFactory');
const Future = artifacts.require('Future');
const CentralizedOracle = artifacts.require('CentralizedOracle');
const chain = require('../../common/chain')(web3);

contract('Future (js)', (accounts) => {
  let evr;
  let futureFactory;
  const productName = 'Product';
  const defaultMP = 'default';
  const tradePrice = 1;
  const tradeQty = 1;
  const custodian = accounts[0];
  const trader1 = accounts[1];
  const trader2 = accounts[2];
  const evrPerUSD = 3;
  const multiplier = 100;
  const toEVR = usd => web3.toBigNumber(usd).times(evrPerUSD).toNumber();

  const mintAmount = toEVR(100);
  // The initial deposit requirement is exposure / 4, so exposure / 3 should be more than enough.
  const depositValue = toEVR(33);

  beforeEach(async () => {
    evr = await EVRToken.deployed();
    futureFactory = await FutureFactory.deployed();
    await futureFactory.reset_default_margin_provider();

    // Set the exchange rate.
    const rates = await ExchangeRates.deployed();
    await rates.set_rate('USD', web3.toWei(evrPerUSD, 'ether'), { from: custodian });

    // deploy a future with standard parameters
    await chain.createFuture(
      productName, Date.UTC(1970, 0, 1), 25, 20, 5000, 1, multiplier);

    // mint EVR for custodian
    await chain.mintEVR(custodian, mintAmount);

    // mint EVR for traders
    await chain.mintEVR(trader1, mintAmount);
    await chain.mintEVR(trader2, mintAmount);
  });

  async function verifyBalances(trader, contracts, availDeposit, lockedDeposit) {
    return Promise.all([
      chain.getQty(defaultMP, productName, trader).then(n =>
        assert.equal(n.valueOf(), contracts)),
      chain.getAvailableDepositUSD(defaultMP, trader).then(n =>
        assert.equal(n.valueOf(), availDeposit)),
      chain.getLockedUpDepositUSD(defaultMP, trader).then(n =>
        assert.equal(n.valueOf(), lockedDeposit)),
    ]);
  }

  async function verifyExcessBackstop(numEVR) {
    return Promise.all([
      chain.getExcessBackstopEVR(productName).then(n => assert.equal(n.valueOf(), numEVR)),
    ]);
  }

  async function verifyEVRBalance(numEVR) {
    const addr = await futureFactory.margin_providers(defaultMP);
    return evr.balanceOf(addr).then(n => assert.equal(n / 1e18, numEVR));
  }

  async function makeDeposits() {
    return Promise.all([
      chain.deposit(defaultMP, depositValue, trader1),
      chain.deposit(defaultMP, depositValue, trader2),
      // The backstop deposit requirement is .5 * (the sum of all required maitenance deposits),
      // which equals .5 * (2 * exposure / 5) = exposure / 5. So exposure / 3 is more than enough.
      chain.depositForBackstop(productName, depositValue),
    ]);
  }

  async function depositAndAddTrades() {
    await makeDeposits();
    await Promise.all([
      verifyBalances(trader1, 0, 33, 0),
      verifyBalances(trader2, 0, 33, 0),
      verifyExcessBackstop(toEVR(33)),
    ]);

    await chain.addTrades(productName, {
      auctionPrice: tradePrice,
      traders: [trader1, trader2],
      sizes: [-tradeQty, tradeQty],
      syndicates: [defaultMP],
      syndicateCounts: [2],
    });
    return Promise.all([
      verifyBalances(trader1, -1, 7, 25),
      verifyBalances(trader2, 1, 7, 25),
      verifyExcessBackstop(toEVR(13)),
    ]);
  }

  async function settle(price) {
    const addr = await futureFactory.futures(productName);
    const future = await Future.at(addr);
    const oracle = await CentralizedOracle.at(await future.get_oracle());
    await oracle.setOutcome(web3.toWei(price, 'ether'));
    await future.expire();
    return future.settle();
  }

  it('should allow depositing collateral', async () => {
    await chain.deposit(defaultMP, toEVR(100), trader1);
    return Promise.all([
      verifyBalances(trader1, 0, 100, 0),
      verifyEVRBalance(toEVR(100)),
    ]);
  });

  it('should allow withdrawing unused collateral', async () => {
    await chain.deposit(defaultMP, toEVR(100), trader1);
    await chain.withdraw(defaultMP, toEVR(100), trader1);
    return Promise.all([
      verifyBalances(trader1, 0, 0, 0),
      verifyEVRBalance(0),
    ]);
  });

  it('should allow taking a position', async () => {
    await depositAndAddTrades();
  });

  it('should allow withdrawing contract creator fees after settlement', async () => {
    await depositAndAddTrades();
    await chain.getAvailableCreatorFeesEVR(productName)
      .then(n => assert.equal(n, toEVR(2)));
    await settle(tradePrice);
    const initialBalance = (await evr.balanceOf(custodian)) / 1e18;
    await chain.withdrawCreatorFees(productName, custodian);
    return evr.balanceOf(custodian).then(n => assert.equal((n / 1e18), initialBalance + toEVR(2)));
  });
});
