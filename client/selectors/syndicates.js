import { createSelector } from 'reselect';

const getSyndicates = state => state.syndicates.all;
const getWalletBalance = state => state.syndicates.walletBalance;

export const getSyndicatesActiveProducts = createSelector(
  [getSyndicates],
  (syndicates) => {
    const all = Object.values(syndicates)
      .map(s => ({
        ...s,
        products: sort(Object.values(s.products)
          .filter(p => !p.isExpired)),
      }));
    return sort(all);
  },
);

export const getDepositedSyndicates = createSelector(
  [getSyndicatesActiveProducts],
  (syndicates) => {
    const deposited = syndicates
      .filter(s => s.totalDeposit > 0);

    return deposited;
  },
);

export const getPositionsForBalanceList = createSelector(
  [getSyndicatesActiveProducts],
  (syndicates) => {
    // get ids of products we'll show because we have a position
    const displayedProductSet = new Set([].concat(...syndicates.map(
      s => s.products
        .filter(p => p.qty !== 0)
        .map(p => p.id),
    )));

    const isExtra = p => (!displayedProductSet.has(p.id) && p.key === 'default' && p.isFavorite);

    // list all syndicates with a deposit - and "default" (lev=1) syndicates for favorites
    const all = syndicates.map(s => ({
      ...s,
      products: s.products
        .filter(p => (isExtra(p) || p.qty !== 0)),
    }));

    const results = []
      .concat(...all.map(s => s.products))
      // clear syndicate key for "extras"
      .map(p => ({ ...p, syndicateDisplayName: isExtra(p) ? null : p.syndicateDisplayName }));

    return sort(results);
  },
);

export const getSyndicatesForBalanceList = createSelector(
  [getDepositedSyndicates, getWalletBalance],
  (syndicates, walletBalance) => {
    const results = [...syndicates];

    // add extra row for wallet balance
    const cashName = 'EMX Wallet';
    results.push({
      key: cashName,
      displayName: cashName,
      availableDeposit: walletBalance,
      hideManageCollateral: true,
    });

    return results;
  },
);

export const getAvailableSyndicatesForFavorites = createSelector(
  [getSyndicatesActiveProducts, getDepositedSyndicates],
  (syndicates, depositedSyndicates) => sort(syndicates
    .filter(
      s => !depositedSyndicates.some(ds => ds.key === s.key) &&
      (s.availableLenderBalance > 0 || s.key === 'default'))
    .map(s => ({
      ...s,
      products: s.products
        .filter(p => p.isFavorite),
    }))
    .filter(s => s.products.length > 0)),
);

export const getMySyndicates = createSelector(
  [getSyndicatesActiveProducts],
  syndicates => sort(syndicates
    .filter(s => s.isMine)),
);

const sort = (list) => {
  // sort syndicates / products by display name
  const comp = (a, b) => a.displayName.localeCompare(b.displayName);
  return [...list].sort(comp);
};
