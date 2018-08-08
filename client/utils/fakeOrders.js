/* eslint no-param-reassign: 0 */

function updateFakeOrders(productName, auctionId, price, os) {
  for (let i = 0; i < 25; i += 2) {
    updateOrderPair(
      productName, auctionId, price, os, `0x${i}`, `0x${i + 1}`);
  }
  return os;
}

function approxGaussianRand() {
  const COUNT = 6;
  let rand = 0;
  for (let i = 0; i < COUNT; i += 1) {
    rand += Math.random();
  }
  return rand / COUNT;
}

function updateOrderPair(productName, auctionId, price, os, longAddr, shortAddr) {
  const TICK_SIZE = 0.25;
  const SIGMA = 0.02;

  if (!price) {
    os.length = 0;
    return;
  }

  function updateOrder(addr, sign) {
    let px = ((approxGaussianRand() * SIGMA) + 1) * price;

    // skew longs lower and shorts higher
    if (sign > 0)
      px *= 0.995;
    if (sign < 0)
      px *= 1.005;

    px = parseInt(px / TICK_SIZE, 10) * TICK_SIZE;
    const qty = parseInt(Math.random() * 100, 10) * sign;

    const order = {
      productName,
      auctionId,
      orderType: 'LMT',
      quantity: qty,
      quantityFilled: 0,
      price: px,
      timeInForce: 'NXT',
      traderAddress: addr,
    };

    let orderIndex = -1;
    for (let i = 0; i < os.length; i++) {
      if (os[i].productName === productName &&
          os[i].auctionId === auctionId &&
          os[i].traderAddress === addr) {
        orderIndex = i;
        break;
      }
    }
    if (orderIndex >= 0) {
      os[orderIndex] = order;
    } else {
      os.push(order);
    }
  }

  updateOrder(longAddr, 1);
  updateOrder(shortAddr, -1);
}

module.exports = {
  updateFakeOrders,
};
