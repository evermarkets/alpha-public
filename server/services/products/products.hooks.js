const Cache = require('../hooks/decoratedCache')();
const Enricher = require('./productsEnricher');

module.exports = {
  before: {
    all: [],
    find: [Enricher.hider, Cache.before],
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
