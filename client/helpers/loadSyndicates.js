import app from '../feathers';
import chainMod from './chain';
import formatters from '../../common/formatters';

export default async function loadSyndicates(invalidateCache) {
  const Web3 = chainMod.getWeb3();
  const chain = chainMod.chain(Web3);
  const userAddress = Web3.eth.accounts[0];

  const [syndicates, walletBalanceRaw] = await Promise.all([
    getAllSyndicates(userAddress, invalidateCache),
    chain.getAccountBalanceEVR(userAddress),
  ]);

  const walletBalance = formatters.toNumber(walletBalanceRaw);

  return { syndicates, walletBalance };
}

async function getAllSyndicates(userAddress, invalidateCache) {
  const Syndicates = app.service('syndicates');
  const syndicates = await Syndicates.find({
    query: { decorate: true, userAddress, invalidateCache },
  });

  return syndicates.reduce((o, s) => {
    // eslint-disable-next-line no-param-reassign
    o[s.key] = s;
    return o;
  }, {});
}
