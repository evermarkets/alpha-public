async function getCurrentAuction(app, productName) {
  const Auctions = app.service('auctions');
  const auctions = await Auctions.find({
    query: { productName, endedAt: null },
  });
  return auctions[0];
}

async function currentAuctions(app) {
  const Products = app.service('products');

  const products = await Products.find({
    query: { expiry: { gt: new Date() } },
  });

  const auctions = await Promise.all(
    products.map(p => getCurrentAuction(app, p.name)),
  );

  const auctionIds = {};
  for (const a of auctions)
    auctionIds[a.productName] = a.id;
  return auctionIds;
}

async function openOrders(app, productName, userAddress) {
  const auctionIds = await currentAuctions(app);
  const or = Object.keys(auctionIds).map(p => ({
    timeInForce: 'NXT',
    productName: p,
    auctionId: auctionIds[p],
  }));
  or.push({ timeInForce: 'GTC' });

  const query = {
    canceledAt: null,
    $or: or,
  };
  if (userAddress != null)
    query.traderAddress = userAddress;
  if (productName != null)
    query.productName = productName;

  const Orders = app.service('orders');
  const orders = await Orders.find({ query });
  return orders
    .filter(o => (o.quantity - o.quantityFilled) !== 0);
}

async function completedOrders(app, productName, userAddress) {
  const Orders = app.service('orders');
  const Auctions = app.service('auctions');

  const open = await openOrders(app, productName, userAddress);
  const openIds = open.map(o => o.id);
  const query = {
    quantityFilled: { $ne: 0 },
    id: { $nin: openIds },
  };
  if (userAddress != null)
    query.traderAddress = userAddress;
  if (productName != null)
    query.productName = productName;

  const closedOrders = await Orders.find({ query });

  // look up auctions and add auction prices and dates
  const as = await Auctions.find({
    query: { endedAt: { $ne: null } },
  });
  const auctions = {};
  for (const a of as)
    auctions[a.id] = a;

  const orders = closedOrders.map((o) => {
    const a = auctions[o.auctionId];
    return Object.assign({
      createdAt: a.endedAt,
      priceAuction: a.price,
    }, o);
  });

  // order by createdAt descending
  orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return orders;
}

const orders = {
  openOrders,
  completedOrders,
};

module.exports = orders;
