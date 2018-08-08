import { createSelector } from 'reselect';

const getProducts = state => state.products.all;

export const getActiveProducts = createSelector(
  [getProducts],
  products => sort(
    Object.values(products).filter(p => !p.isExpired),
    p => p.longName),
);

export const getFavoriteProducts = createSelector(
  [getActiveProducts],
  products => products.filter(p => p.isFavorite),
);

export const getMyActiveProducts = createSelector(
  [getActiveProducts],
  products => products.filter(p => p.isMine),
);

export const getMyExpiredProducts = createSelector(
  [getProducts],
  (products) => {
    const sortedProducts = sort(Object.values(products), p => p.longName);
    return sortedProducts
      .filter(p => (
        p.isMine &&
        p.isExpired &&
        (p.availableFees > 0 || p.excessBackstop > 0)
      ));
  },
);

export const getProductsForOrders = createSelector(
  [getActiveProducts],
  (products) => {
    // TODO(AustinC): sort favorites first
    const displayedProducts = products.filter(p => !p.demoDisplayOnly || p.isFavorite);
    return sort(displayedProducts, p => p.name);
  },
);

const sort = (list, keyFunc) => {
  // sort products by key
  const comp = (a, b) => keyFunc(a).localeCompare(keyFunc(b));
  return [...list].sort(comp);
};
