import {
  ADD_TRANSACTION, TRANSACTION_COMPLETE,
} from '../actions/transactions';

const transactions = (state = {
  active: new Set(),
  completed: new Set(),
}, action) => {
  switch (action.type) {
    case ADD_TRANSACTION:
      return {
        ...state,
        active: new Set([action.txHash, ...state.active]),
      };
    case TRANSACTION_COMPLETE:
      return {
        ...state,
        active: new Set([...state.active].filter(t => t !== action.txHash)),
        completed: new Set([action.txHash, ...state.completed]),
      };
    default:
      return state;
  }
};

export default transactions;
