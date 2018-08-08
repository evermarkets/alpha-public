import { routerReducer } from 'react-router-redux';

import syndicates from './syndicates';
import products from './products';
import transactions from './transactions';

export default {
  routing: routerReducer, // reducers required by react-router-redux
  syndicates,
  products,
  transactions,
};
