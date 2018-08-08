const auction = require('../../../common/auction');

function updateIndicativeInfo(context) {
  auction.updateIndicativeInfo(context.app, context.result.productName);
}

module.exports = {
  before: {
    all: [],
    find: [],
    get: [],
    create: [], // TODO(AustinC): fill auctionId here (latest open auction for the given product)
    update: [],
    patch: [],
    remove: [],
  },

  after: {
    all: [],
    find: [],
    get: [],
    create: [
      updateIndicativeInfo,
    ],
    update: [],
    patch: [
      updateIndicativeInfo,
    ],
    remove: [],
  },

  error: {
    all: [],
    find: [],
    get: [],
    create: [],
    update: [],
    patch: [],
    remove: [],
  },
};
