/* eslint no-undef: 0 */

const EVRToken = artifacts.require('EVRToken');
const ExchangeRates = artifacts.require('./oracles/ExchangeRates.sol');
const FutureFactory = artifacts.require('FutureFactory');

contract('FutureFactory', () => {
  let evr;
  let rates;
  let futureFactory;
  const productName = 'NewProduct';

  beforeEach(async () => {
    // deploy new FutureFactory for each test
    if (!evr)
      evr = await EVRToken.deployed();
    if (!rates)
      rates = await ExchangeRates.deployed();

    futureFactory = await FutureFactory.new(evr.address, rates.address);
  });

  async function createFuture() {
    const addr = await futureFactory.create_future(
      productName, productName, Date.UTC(1970, 0, 1), 25e18, 20e18, 5000, 1e18, 1e6);
    return addr;
  }

  async function createMarginProvider() {
    const addr = await futureFactory.create_margin_provider(productName);
    return addr;
  }

  it('should allow Future creation', async () => {
    const addr = await createFuture();
    assert.notEqual(addr, 0x0);
  });

  it('should allow Future retrieval', async () => {
    await createFuture();
    const addr = await futureFactory.futures(productName);
    assert.notEqual(addr, 0x0);
  });

  it('should return 0x0 for missing futures', async () => {
    const addr = await futureFactory.futures('MissingProduct');
    assert.equal(addr, 0x0);
  });

  it('should allow MarginProvider creation', async () => {
    const addr = await createMarginProvider();
    assert.notEqual(addr, 0x0);
  });

  it('should return 0x0 for missing margin providers', async () => {
    const addr = await futureFactory.margin_providers('MissingMarginProvider');
    assert.equal(addr, 0x0);
  });
});
