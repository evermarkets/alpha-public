const config = require('config');
const moment = require('moment-timezone');
const business = require('moment-business');

const { chain } = require('./chain');
const randHex = require('../../common/randHex');

const userAddr = {
  // local testrpc
  devserver: [
    '0xaf1435509aa6ab5afa7f8939d2c006373ea0253d',
    '0x123abaf7a75fe084f7f5bf8dd7e3e6d9e6027b3b',
    '0x9b11740ea6d46b9176b1ebb69a1672be9c2c63d8',
    '0x49328be73c2edb094e13ac5f7d1cfb6dbba47d15',
  ],
  // rinkeby testnet
  production: [
    '0xe0020107ea4ce4a3d7223b82588e44bb7068f5ea', // contract creator
    '0x03ab48c150680bab45595b0f707d4ae681780b95', // trader 1
    '0x1dec83cde509c68cb51eb91edc58e53582113233', // trader 2
    '0x16c203a3c594de8e729af034ba8c55df91da4a52',
  ],
}[config.NODE_ENV] || ['0x']; // default value for any other env;

const expiryFuture = moment.utc('2018-06-15');
const DEFAULT = 'default';

// expire dailies at 4pm Eastern
const expiryToday = moment.tz('16:00', 'HH:mm', 'America/New_York');
if (!business.isWeekDay(expiryToday)) // pick next weekday if it's a weekend
  business.addWeekDays(expiryToday, 1);
if (moment().isAfter(expiryToday)) // if it's already after 4pm Eastern
  business.addWeekDays(expiryToday, 1);
const expiryYesterday = business.subtractWeekDays(expiryToday.clone(), 1);

const products = [
  {
    name: `ES${expiryYesterday.format('YYYYMMDD')}`,
    longName: 'E-mini S&P 500 Future',
    expiry: expiryYesterday,
    creatorAddress: userAddr[0],
    tags: 'equity_index',
  },
  {
    name: `ES${expiryToday.format('YYYYMMDD')}`,
    longName: 'E-mini S&P 500 Future',
    expiry: expiryToday,
    creatorAddress: userAddr[0],
    tags: 'equity_index',
  },
  {
    name: 'ESM2018',
    longName: 'E-mini S&P 500 Future',
    expiry: expiryFuture,
    creatorAddress: userAddr[0],
    tags: 'equity_index',
  },
  {
    name: 'NQH2018',
    longName: 'E-mini Nasdaq 100 Future',
    expiry: expiryFuture,
    creatorAddress: '0x',
    tags: 'equity_index',
  },
  {
    name: 'VG1H2018',
    longName: 'Euro Stoxx 50 Future',
    expiry: expiryFuture,
    creatorAddress: '0x',
    tags: 'equity_index',
  },
  {
    name: 'NKH2018',
    longName: 'Nikkei 225 Mini Future',
    expiry: expiryFuture,
    creatorAddress: '0x',
    tags: 'equity_index',
  },
  {
    name: 'CLH2018',
    longName: 'WTI Light Sweet Crude Oil Future',
    expiry: expiryFuture,
    creatorAddress: '0x',
    tags: 'commodity',
  },
  {
    name: 'CBH2018',
    longName: 'Brent Oil Future',
    expiry: expiryFuture,
    creatorAddress: '0x',
    tags: 'commodity',
  },
  {
    name: 'NGH2018',
    longName: 'Natural Gas Future',
    expiry: expiryFuture,
    creatorAddress: '0x',
    tags: 'commodity',
  },
  {
    name: 'RMH2018',
    longName: 'Soybean Meal Future',
    expiry: expiryFuture,
    creatorAddress: '0x',
    tags: 'commodity',
  },
  {
    name: 'CH2018',
    longName: 'Corn Future',
    expiry: expiryFuture,
    creatorAddress: '0x',
    tags: 'commodity',
  },
  {
    name: 'SRH2018',
    longName: 'Soybean Future',
    expiry: expiryFuture,
    creatorAddress: '0x',
    tags: 'commodity',
  },
  {
    name: 'SBH2018',
    longName: 'Sugar #11 Future',
    expiry: expiryFuture,
    creatorAddress: '0x',
    tags: 'commodity',
  },
  {
    name: 'CFH2018',
    longName: 'Cotton #1 Future',
    expiry: expiryFuture,
    creatorAddress: '0x',
    tags: 'commodity',
  },
  {
    name: 'AAPLH2018',
    longName: 'Apple Inc.',
    expiry: expiryFuture,
    creatorAddress: '0x',
    tags: 'stock',
  },
  {
    name: 'FBH2018',
    longName: 'Facebook Inc.',
    expiry: expiryFuture,
    creatorAddress: '0x',
    tags: 'stock',
  },
  {
    name: 'MSFTH2018',
    longName: 'Microsoft Inc.',
    expiry: expiryFuture,
    creatorAddress: '0x',
    tags: 'stock',
  },
  {
    name: 'GOOGLH2018',
    longName: 'Alphabet Inc.',
    expiry: expiryFuture,
    creatorAddress: '0x',
    tags: 'stock',
  },
  {
    name: 'BTCH2018',
    longName: 'Bitcoin',
    expiry: expiryFuture,
    creatorAddress: '0x',
    tags: 'crypto',
  },
  {
    name: 'ETHH2018',
    longName: 'Ethereum',
    expiry: expiryFuture,
    creatorAddress: '0x',
    tags: 'crypto',
  },
  {
    name: 'XMRH2018',
    longName: 'Monero',
    expiry: expiryFuture,
    creatorAddress: '0x',
    tags: 'crypto',
  },
  {
    name: 'ZECH2018',
    longName: 'Zcash',
    expiry: expiryFuture,
    creatorAddress: '0x',
    tags: 'crypto',
  },
  {
    name: 'NECH2018',
    longName: 'Neocoin',
    expiry: expiryFuture,
    creatorAddress: '0x',
    tags: 'crypto',
  },
];

module.exports = {
  seedTablesIfEmpty: async (sequelizeClient, auctionsOnly) => {
    const { models } = sequelizeClient;

    if (!auctionsOnly) {
      const p = await models.products.findAll();
      if (p.length === 0)
        await initProducts(sequelizeClient);

      const s = await models.syndicates.findAll();
      if (s.length === 0)
        await initSyndicates(sequelizeClient);
    }

    const a = await models.auctions.findAll();
    if (a.length === 0)
      await initAuctions(sequelizeClient);

    if (!auctionsOnly) {
      const o = await models.orders.findAll();
      if (o.length === 0)
        initOrders(sequelizeClient);
    }
  },

  emptyTables: (sequelizeClient, tables) => {
    const query = {
      where: {},
      truncate: true,
    };
    return Promise.all(tables.map(t => (
      sequelizeClient.models[t].destroy(query)
    )));
  },
};

function initOrders(sequelizeClient) {
  const Orders = sequelizeClient.models.orders;
  const Auctions = sequelizeClient.models.auctions;

  const demoProduct = 'ESM2018';

  Auctions
    .find({
      where: {
        productName: demoProduct,
        endedAt: null,
      },
    })
    .then((a) => {
      const demoAuction = a.id;
      const orderList = [
        {
          productName: demoProduct,
          syndicateKey: DEFAULT,
          auctionId: demoAuction,
          orderType: 'LMT',
          quantity: 1,
          quantityFilled: 0,
          price: 2500,
          timeInForce: 'NXT',
          traderAddress: userAddr[1],
        },
        {
          productName: demoProduct,
          syndicateKey: DEFAULT,
          auctionId: demoAuction,
          orderType: 'LMT',
          quantity: -1,
          quantityFilled: 0,
          price: 2500,
          timeInForce: 'NXT',
          traderAddress: userAddr[2],
        },
      ];

      orderList.forEach(o => Orders.create(o));
    });
}

async function initProducts(sequelizeClient) {
  const isDemoOnly = p => !p.name.startsWith('ES');

  const Products = sequelizeClient.models.products;

  // create db rows
  await Promise.all(
    products.map(p => Products.create(
      // should use spead operator here, but got syntax error
      Object.assign({}, p, {
        demoDisplayOnly: isDemoOnly(p),
      }))),
  );

  // deploy smart contracts
  await Promise.all(
    products
      .filter(p => !isDemoOnly(p))
      .map(p => deployProduct(p)),
  );
}

async function initSyndicates(sequelizeClient) {
  const creatorAddress = userAddr[3];

  const Syndicates = sequelizeClient.models.syndicates;
  const SyndicateProducts = sequelizeClient.models.syndicateProducts;
  const Products = sequelizeClient.models.products;
  const ps = await Products.findAll({ where: { demoDisplayOnly: false } });

  Syndicates.create({
    key: DEFAULT,
    creatorAddress: '0x',
  });

  // create db rows (for "default" 1x margin providers)
  ps.forEach(p => SyndicateProducts.create({
    key: DEFAULT,
    productId: p.id,
    leverageMult: 1,
  }));

  // generate random mp keys for another margin provider
  const mpKey = randHex(8);

  // deploy (empty) margin provider
  await deploySyndicate(mpKey, userAddr[3]);

  Syndicates.create({
    key: mpKey,
    creatorAddress,
  });

  // create db rows (for 2x margin providers)
  ps.forEach(p => SyndicateProducts.create({
    key: mpKey,
    productId: p.id,
    leverageMult: 2,
  }));

  // deploy smart contracts (for 2x margin providers)
  ps.forEach(p => addProductToSyndicate(mpKey, p, 2, creatorAddress));
}

async function initAuctions(sequelizeClient) {
  const Auctions = sequelizeClient.models.auctions;
  const Products = sequelizeClient.models.products;
  const ps = await Products.findAll();
  return Promise.all(
    ps.map(p => Auctions.create({ productName: p.name, totalVolume: 0 })),
  );
}

async function deployProduct(product) {
  console.log(`deploying ${product.name}`);
  const tx = await chain.createFuture(
    product.name,
    moment.utc(product.expiry).unix(),
    2500, 2000, 5000, 1, 50)
    .catch(console.error);
  console.log(` tx to deploy ${product.name} = ${tx}`);
  return chain.getTransactionReceipt(tx);
}

async function deploySyndicate(mpKey, creatorAddress) {
  console.log(`deploying syndicate ${mpKey}`);
  const tx = await chain.createMarginProvider(mpKey, creatorAddress)
    .catch(console.error);
  console.log(` tx = ${tx}`);
  // wait for deployment so addProductToSyndicate() can find the syndicate addr
  await chain.getTransactionReceipt(tx);
}

async function addProductToSyndicate(mpKey, product, leverage, creatorAddress) {
  console.log(`adding support for ${leverage}x leverage on ${product.name} (${mpKey})`);
  const tx = await chain.addFutureToMarginProvider(
    mpKey, product.name, leverage, 1, creatorAddress)
    .catch(console.error);
  console.log(` tx to support ${product.name} on ${mpKey} = ${tx}`);
}
