import {
  REQUEST_PRODUCTS, RECEIVE_PRODUCTS,
} from '../actions/products';

const products = (state = {
  isLoading: false,
  all: {},
  lastUpdated: null,
}, action) => {
  switch (action.type) {
    case REQUEST_PRODUCTS:
      return {
        ...state,
        isLoading: true,
      };
    case RECEIVE_PRODUCTS:
      return {
        ...state,
        isLoading: false,
        all: action.products,
        lastUpdated: action.receivedAt,
      };
    default:
      return state;
  }
};

export default products;
