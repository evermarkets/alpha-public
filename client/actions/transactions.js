import chainMod from '../helpers/chain';

export const ADD_TRANSACTION = 'ADD_TRANSACTION';
export const TRANSACTION_COMPLETE = 'TRANSACTION_COMPLETE';

const addTransaction = txHash => ({
  type: ADD_TRANSACTION,
  txHash,
});

const transactionComplete = txHash => ({
  type: TRANSACTION_COMPLETE,
  txHash,
});

export const registerTransaction = (txHash, callback) => async (dispatch) => {
  dispatch(addTransaction(txHash));

  // wait for transaction to complete
  const Web3 = chainMod.getWeb3();
  const chain = chainMod.chain(Web3);
  const receipt = await chain.getTransactionReceipt(txHash);
  if (callback)
    callback(receipt);

  dispatch(transactionComplete(txHash));
};
