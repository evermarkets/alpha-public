/* eslint-disable no-return-assign */

const ordersLib = require('./orders');

async function getCurrentAuction(app, productName) {
  const Auctions = app.service('auctions');

  // get price of last auction (to provide to auction code)
  const lastAuction = await Auctions.find({
    query: {
      $limit: 1,
      $sort: { createdAt: -1 },
      productName,
      endedAt: { $ne: null },
    },
  });
  const lastPrice = lastAuction.length > 0 ? lastAuction[0].price : null;

  // get current open auction
  const openAuctions = await Auctions.find({
    query: {
      productName,
      endedAt: null,
    },
  });

  return {
    ...openAuctions[0],
    lastPrice,
  };
}

function runAuction(orders, lastPrice) {
  const limitOrders = orders.filter(o => o.orderType === 'LMT');
  const marketOrders = orders.filter(o => o.orderType === 'MKT');

  if (!limitOrders.length && (!marketOrders.length || !lastPrice))
    return {
      orderIds: [],
      auctionPrice: null,
      traders: [],
      sizes: [],
      syndicates: [],
      syndicateCounts: [],
      totalVolume: 0,
    };

  const uniqs = a => [...new Set(a)];

  const sortFn = (a, b) => {
    if (a < b)
      return -1;
    else if (a > b)
      return 1;
    return 0;
  };

  const sortNums = nums => nums.sort(sortFn);
  const prices = sortNums(uniqs(limitOrders.map(o => o.price)));

  // map from price to list of orders at that price
  const poMap = {};
  limitOrders.forEach((o) => {
    if (!poMap[o.price]) poMap[o.price] = [];
    poMap[o.price].push(o);
  });

  // there may be multiple orders at each price.
  // sum the bids and the asks to create two arrays that store the bid and ask volumes for each
  // price bidVolumes[i] (or askVolumes[i]) represents the volume of bids (or asks) at the price
  // stored in prices[i]
  const sum = nums => nums.reduce((a, b) => a + b, 0);
  const orderSize = o => o.quantity - o.quantityFilled;
  const bidVolumes = prices.map((p) => {
    const bidSizesAtThisPrice = poMap[p].map(orderSize).filter(s => s > 0);
    return sum(bidSizesAtThisPrice);
  });
  const askVolumes = prices.map((p) => {
    const askSizesAtThisPrice = poMap[p].map(orderSize).filter(s => s < 0);
    return -1 * sum(askSizesAtThisPrice);
  });
  const marketOrderSizes = marketOrders.map(orderSize);
  const marketOrderBidVolume = sum(marketOrderSizes.filter(s => s > 0));
  const marketOrderAskVolume = -1 * sum(marketOrderSizes.filter(s => s < 0));

  // bidVolumes and askVolumes record the volume of orders at an exact price, but
  // what we really want to know is how many bids are available at or above a given price
  // and how many asks are available at or below a given price, because, the volume that can
  // trade at a given price is the min of (bids-at-or-above, and asks-at-or-below)
  const getRunningTotals = (nums) => { let s = 0; return nums.map(n => (s += n)); };
  const getRunningTotalsFromRight = nums => getRunningTotals(nums.slice().reverse()).reverse();
  const bidVolumesAtPriceOrHigher = getRunningTotalsFromRight(bidVolumes);
  const askVolumesAtPriceOrLower = getRunningTotals(askVolumes);

  // We track both minBestPrice and maxBestPrice, because multiple prices might tie.
  //
  // (Note: we know that if any prices tie, they all form a contiguous tied interval because
  // asks-at-or-above is monotonically increasing in price, and bids-at-or-below is
  // monotonically decreasing in price, so the ask volume can only go up or stay the same
  // as the price increases from the lower tied price, and the bid volume can only go up or
  // stay the same as the price decreases from the higher tied price, so the min of the two
  // has to at least equal the tied volume in the region between the two tied prices.)
  //
  // We set the auction price as the average of the highest and lowest prices that tie for the
  // max volume. If there are no limit orders, the price is simply the last auction price.
  let maxVolume = Math.min(marketOrderBidVolume, marketOrderAskVolume);
  let minBestPrice = Number.MAX_SAFE_INTEGER;
  let maxBestPrice = 0;
  for (let i = 0; i < prices.length; ++i) {
    const p = prices[i];
    const v = Math.min(bidVolumesAtPriceOrHigher[i] + marketOrderBidVolume,
      askVolumesAtPriceOrLower[i] + marketOrderAskVolume);

    if (v > maxVolume) {
      maxVolume = v;
      minBestPrice = p;
      maxBestPrice = p;
    } else if (v === maxVolume) {
      maxBestPrice = p;
    }
  }

  let auctionPrice;
  let bidVolumeAvailable;
  let askVolumeAvailable;

  if (prices.length > 0) {
    auctionPrice = (minBestPrice + maxBestPrice) / 2;

    let priceIndex = -1;
    for (let i = 0; i < prices.length; ++i) {
      if (prices[i] <= auctionPrice) priceIndex = i;
    }
    if (prices[priceIndex] !== auctionPrice) priceIndex += 0.5;
    bidVolumeAvailable =
      bidVolumesAtPriceOrHigher[Math.ceil(priceIndex)] + marketOrderBidVolume;
    askVolumeAvailable =
      askVolumesAtPriceOrLower[Math.floor(priceIndex)] + marketOrderAskVolume;
  } else if (!lastPrice) {
    return {
      orderIds: [],
      traders: [],
      sizes: [],
      syndicates: [],
      syndicateCounts: [],
      totalVolume: 0,
    };
  } else {
    auctionPrice = lastPrice;
    bidVolumeAvailable = marketOrderBidVolume;
    askVolumeAvailable = marketOrderAskVolume;
  }

  // now that we know the crossing price, figure out which traders get filled
  const filledOrders = [];
  orders.forEach((o) => {
    let sizeToFill = 0;
    if (orderSize(o) > 0 && (o.orderType === 'MKT' || o.price >= auctionPrice)) {
      sizeToFill = (orderSize(o) * maxVolume) / bidVolumeAvailable;
    } else if (orderSize(o) < 0 && (o.orderType === 'MKT' || o.price <= auctionPrice)) {
      sizeToFill = (orderSize(o) * maxVolume) / askVolumeAvailable;
    }

    if (sizeToFill !== 0) {
      filledOrders.push({
        orderId: o.id,
        syndicateKey: o.syndicateKey,
        trader: o.traderAddress,
        size: sizeToFill,
      });
    }
  });

  if (filledOrders.length === 0) {
    return {
      orderIds: [],
      traders: [],
      sizes: [],
      syndicates: [],
      syndicateCounts: [],
      totalVolume: 0,
    };
  }

  const imbalance = bidVolumeAvailable - askVolumeAvailable;
  const totalVolume = filledOrders.reduce((s, o) => s + Math.abs(o.size), 0);

  // sort results by margin provider - and run-length encode syndicates
  const syndicates = [...new Set(filledOrders.map(o => o.syndicateKey))];
  const groupedOrders = syndicates.map(s => filledOrders.filter(o => o.syndicateKey === s));
  const syndicateCounts = groupedOrders.map(os => os.length);
  const filledOrdersSorted = [].concat(...groupedOrders);

  const orderIds = [];
  const traders = [];
  const sizes = [];

  filledOrdersSorted.forEach((o) => {
    orderIds.push(o.orderId);
    traders.push(o.trader);
    sizes.push(o.size);
  });

  return {
    orderIds,
    traders,
    sizes,
    syndicates,
    syndicateCounts,
    auctionPrice,
    totalVolume,
    imbalance,
  };
}

function updateOrders(app, orderIds, sizes) {
  const Orders = app.service('orders');
  for (const oid of orderIds.entries()) {
    const idx = oid[0];
    const orderId = oid[1];
    const size = sizes[idx];

    Orders.get(orderId).then((o) => {
      app.service('orders').patch(orderId, {
        quantityFilled: o.quantityFilled + size,
      });
    });
  }
}

async function updateIndicativeInfo(app, productName) {
  const auction = await getCurrentAuction(app, productName);
  const openOrders = await ordersLib.openOrders(app, productName, null);
  const auctionData = runAuction(openOrders, auction.lastPrice);

  // record auction price & quantity in database
  const totalVolume = auctionData.sizes.reduce((a, x) => a + Math.abs(x), 0);
  return app.service('auctions')
    .patch(auction.id, {
      price: auctionData.auctionPrice,
      volume: totalVolume / 2,
    });
}

const auction = {
  runAuction,
  updateOrders,
  getCurrentAuction,
  updateIndicativeInfo,
};

module.exports = auction;
