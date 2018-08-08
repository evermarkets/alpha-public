import loadProducts from '../helpers/loadProducts';

export const REQUEST_PRODUCTS = 'REQUEST_PRODUCTS';
export const RECEIVE_PRODUCTS = 'RECEIVE_PRODUCTS';

export const requestProducts = () => ({
  type: REQUEST_PRODUCTS,
});

export const receiveProducts = data => ({
  type: RECEIVE_PRODUCTS,
  receivedAt: Date.now(),
  ...data,
});

const fetchProducts = invalidateCache => async (dispatch) => {
  dispatch(requestProducts());
  const data = await loadProducts(invalidateCache);
  dispatch(receiveProducts(data));
};

const shouldFetchProducts = state => (!state.products.lastUpdated);

export const fetchProductsIfNeeded = (forceFetch, invalidateCache) => (dispatch, getState) => {
  if (forceFetch || shouldFetchProducts(getState())) {
    return dispatch(fetchProducts(invalidateCache));
  }
  return null;
};
