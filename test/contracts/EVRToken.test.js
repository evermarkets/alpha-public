/* eslint no-undef: 0 */

const EVRToken = artifacts.require('EVRToken');

contract('EVRToken', (accounts) => {
  let evr;
  const owner = accounts[0];
  const trader1 = accounts[1];
  const trader2 = accounts[2];

  beforeEach(async () => {
    // deploy new EVRToken for each test
    evr = await EVRToken.new({ from: owner });
  });

  it('should allow minting', async () => {
    await evr.mintFor(100, trader1);
    const balance = await evr.balanceOf(trader1);
    assert.equal(balance.valueOf(), 100);
  });

  it('should track total supply', async () => {
    await evr.mintFor(100, trader1);
    const supply = await evr.totalSupply();
    assert.equal(supply.valueOf(), 100);
  });

  it('should allow transfer', async () => {
    await evr.mintFor(100, trader1);
    await evr.transfer(trader2, 100, { from: trader1 });
    const balance = await evr.balanceOf(trader2);
    assert.equal(balance.valueOf(), 100);
  });

  it('should allow transferFrom', async () => {
    await evr.mintFor(100, trader1);
    await evr.approve(owner, 100, { from: trader1 });
    await evr.transferFrom(trader1, trader2, 100);
    const balance = await evr.balanceOf(trader2);
    assert.equal(balance.valueOf(), 100);
  });
});
