// A Feathers hook which serves cached results for decorated calls when available

const { SKIP } = require('@feathersjs/feathers');

/* eslint-disable no-param-reassign */
module.exports = (...discriminators) => {
  let cache = {};

  return {
    before: (context) => {
      context.params.invalidateCache = context.params.query.invalidateCache;
      delete context.params.query.invalidateCache;

      if (context.params.invalidateCache) {
        cache = {};
      }

      const key = discriminators.reduce((s, k) => {
        s += context.params[k];
        return s;
      }, '');

      if (context.params.decorate) {
        if (cache[key]) {
          context.result = cache[key];
          // disable 'decorate' so that other hooks don't fire
          context.params.decorate = false;
          return SKIP;
        }
        context.cacheKey = key;
      }

      return context;
    },
    after: (context) => {
      if (context.params.decorate) {
        cache[context.cacheKey] = context.result;
      }
    },
  };
};
