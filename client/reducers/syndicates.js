import {
  REQUEST_SYNDICATES, RECEIVE_SYNDICATES,
} from '../actions/syndicates';

const syndicates = (state = {
  isLoading: false,
  all: {},
  walletBalance: 0,
  lastUpdated: null,
}, action) => {
  switch (action.type) {
    case REQUEST_SYNDICATES:
      return {
        ...state,
        isLoading: true,
      };
    case RECEIVE_SYNDICATES:
      return {
        ...state,
        isLoading: false,
        all: action.syndicates,
        walletBalance: action.walletBalance,
        lastUpdated: action.receivedAt,
      };
    default:
      return state;
  }
};

export default syndicates;
