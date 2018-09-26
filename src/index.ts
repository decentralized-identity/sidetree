import * as IPFS from 'ipfs';

const node = new IPFS();

node.on('ready', () => {
  // Ready to use!
  // See https://github.com/ipfs/js-ipfs#core-api
});
