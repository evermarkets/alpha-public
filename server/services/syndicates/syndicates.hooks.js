const Cache = require('../hooks/decoratedCache')('userAddress');
const Enricher = require('./syndicatesEnricher');

module.exports = {
  before: {
    all: [],
    find: [Enricher.hider, Cache.before, Enricher.prepare],
    get: [],
    create: [],
    update: [],
    patch: [],
    remove: [],
  },

  after: {
    all: [],
    find: [Enricher, Cache.after],
    get: [],
    create: [],
    update: [],
    patch: [],
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
