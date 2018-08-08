import moment from 'moment';

import app from '../feathers';
import chainMod from './chain';

// *** Public Methods *** //

export default async function loadProducts(invalidateCache) {
  const Web3 = chainMod.getWeb3();
  const userAddress = Web3.eth.accounts[0];

  const favoriteIds = await getFavoriteIds(userAddress);
  const products = await getAllProducts(
    userAddress, favoriteIds, invalidateCache);

  return { products };
}

// *** Internal Methods *** //

async function getFavoriteIds(userAddress) {
  // get ids of user's favorite contracts
  const Favorites = app.service('contractFavorites');
  const favoriteIds = new Set(
    (await Favorites.find({ query: { userAddress } }))
      .map(f => f.productId));
  return favoriteIds;
}

async function getAllProducts(userAddress, favoriteIds, invalidateCache) {
  // get all products
  const Products = app.service('products');
  const allProducts = await Products.find({
    query: { decorate: true, invalidateCache },
  });

  const now = moment.utc();
  const enrichedProducts = allProducts.map(p => ({
    ...p,
    isMine: p.creatorAddress === userAddress,
    isExpired: moment.utc(p.expiry).isBefore(now),
    isFavorite: favoriteIds.has(p.id),
  }));

  const result = {};
  for (const p of enrichedProducts) {
    result[p.name] = p;
  }
  return result;
}
