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

  let sidetreeContent: IPFS.IPFSFile[] = [
    {
      path: '/tmp/myfile.txt',
      hash: 'QM12345abc',
      size: 123,
    }
  ]
  let testContent = async () => {
    return ipfsContent;
  }

  let testSidetreeContent = async () => {
    return sidetreeContent;
  }

  it('should return the pinned content for the given hash.', ()=> {
    spyOn(ipfsStorage.node!.files, 'get').and.callFake(testContent);
    
    let expectedContent = Buffer.from('ipfs');
    
    ipfsStorage.read('abc123').then(function (value) {
      expect(expectedContent).toEqual(value);
    });
  });

  it('should write the content to IPFS and return the multihash.', ()=> {
    spyOn(ipfsStorage.node!.files, 'add').and.callFake(testSidetreeContent);
    
    let expectedHash = 'QM12345abc';
    let bufferContent = Buffer.from('ipfs');
    
    ipfsStorage.write(bufferContent).then(function (value) {
      expect(expectedHash).toEqual(value);
    });
  });
});