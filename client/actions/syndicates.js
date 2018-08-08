import loadSyndicates from '../helpers/loadSyndicates';

export const REQUEST_SYNDICATES = 'REQUEST_SYNDICATES';
export const RECEIVE_SYNDICATES = 'RECEIVE_SYNDICATES';

export const requestSyndicates = () => ({
  type: REQUEST_SYNDICATES,
});

export const receiveSyndicates = data => ({
  type: RECEIVE_SYNDICATES,
  receivedAt: Date.now(),
  ...data,
});

const fetchSyndicates = invalidateCache => async (dispatch) => {
  dispatch(requestSyndicates());
  const data = await loadSyndicates(invalidateCache);
  dispatch(receiveSyndicates(data));
};

const shouldFetchSyndicates = state => (!state.syndicates.lastUpdated);

// TODO(AustinC): maybe have functions to just refresh syndicate by display name
// - or just wallet cash balance?

export const fetchSyndicatesIfNeeded = (forceFetch, invalidateCache) => (dispatch, getState) => {
  if (forceFetch || shouldFetchSyndicates(getState())) {
    return dispatch(fetchSyndicates(invalidateCache));
  }
  return null;
};
