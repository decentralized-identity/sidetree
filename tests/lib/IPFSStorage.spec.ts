import * as IPFS from 'ipfs';
import { IPFSStorage } from '../../src/lib/IPFSStorage';

describe('IPFSStorage', () => {
  let ipfsStorage: IPFSStorage;

  beforeEach(() => {
    let ipfsOptions: IPFS.Options = {
      repo: 'sidetree-ipfs',
      init: false,
      start: false
    };

    ipfsStorage = IPFSStorage.createIPFSNode(ipfsOptions);
  });

  let ipfsContent: IPFS.Files[] = [
    {
      path: '/tmp/myfile.txt',
      content: Buffer.from('ipfs')
    }
  ];

  let testContent = async function() {
    return ipfsContent;
  }

  it('should return the pinned content for the given hash.', ()=> {
    spyOn(ipfsStorage.node!.files, 'get').and.callFake(testContent);
    
    let expectedContent = Buffer.from('ipfs');
    
    ipfsStorage.read('abc123').then(function (value) {
      expect(expectedContent).toEqual(value);
    });
  });
});