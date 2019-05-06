// This module implements a bitcored-based service that enables a
// Sidetree compute node to interface with Bitcoin's blockchain

delete global._bitcore;
var inherits = require('util').inherits;
var EventEmitter = require('events').EventEmitter;
var bitcore = require('bitcore-lib');
var $ = bitcore.util.preconditions;
var config = require('./config.json');

function SidetreeBlockchainService (options) {
  EventEmitter.call(this);
  this.node = options.node;

  $.checkState(this.node.network, 'Node is expected to have a "network" property');
  this.network = this.node.network;
  this.log = this.node.log;
}
inherits(SidetreeBlockchainService, EventEmitter);

SidetreeBlockchainService.dependencies = ['bitcoind'];

SidetreeBlockchainService.prototype.start = function (callback) {
  setImmediate(callback);
  var self = this;
  self.log.info('SidetreeBlockchainService ready');
};

SidetreeBlockchainService.prototype.stop = function (callback) {
  setImmediate(callback);
};

SidetreeBlockchainService.prototype.getAPIMethods = function () {
  return [];
};

SidetreeBlockchainService.prototype.getPublishEvents = function () {
  return [];
};

SidetreeBlockchainService.prototype.getRoutePrefix = function () {
  return 'SidetreeBlockchainService';
};

function setHeaders (response) {
  response.set('Access-Control-Allow-Origin', '*');
  response.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS, PUT');
  response.set('Access-Control-Allow-setHeaders', 'Origin, X-Requested-With, Content-Type, Accept');
}


function constructBitcoinTransaction (unspentOutputs, sidetreeTransaction, privateKey, fees) {
  const address = privateKey.toAddress();
  var tx = bitcore.Transaction();
  tx.from(unspentOutputs);
  tx.addOutput(new bitcore.Transaction.Output({
    script: bitcore.Script.buildDataOut(sidetreeTransaction),
    satoshis: 0
  }));
  tx.change(address);
  tx.fee(fees); // fees in satoshis
  tx.sign(privateKey);
  return tx;
}

function submitBitcoinTransaction (self, tx, response) {
  self.node.sendTransaction(tx, function (err, transactionId) {
    if (err) {
      self.log.error('error anchoring your transaction on Bitcoin', err);
      return response.status(500).send(err);
    }
    self.log.info('Transaction id ' + transactionId);
    response.status(200).send({ 'transactionId': transactionId });
  });
}

/** 
 * Anchors a given string on Bitcoin by constructing a bitcoin transaction and transmitting it to the blockchain network
 * @param request's body contains the string to be embedded in the blockchain
 * In the absence of an error, it returns the identity of the transaction transmitted to Bitcoin network as a JSON object
 */
SidetreeBlockchainService.prototype.anchorTransactionHandler = function (request, response, next) {
  setHeaders(response);
  var self = this;
  const sidetreeTransaction = request.body.transaction;
  const privateKeyWIF = config.privateKeyWIF;
  const privateKey = bitcore.PrivateKey.fromWIF(privateKeyWIF);
  const address = privateKey.toAddress();
  const fees = config.fees;

  this.node.getAddressUnspentOutputs(address.toString(), {}, function (err, unspentOutputs) {
    if (err) {
      self.log.error('error retrieving information', err);
      return response.status(500).send(err);
    }

    // builds a Bitcoin transaction
    const tx = constructBitcoinTransaction(unspentOutputs, sidetreeTransaction, privateKey, fees);

    // anchor the transaction on the Bitcoin blockchain
    submitBitcoinTransaction(self, tx, response);
  });
};

/** 
 * Returns the tip of the Bitcoin blockchain
 * @returns A Response object with 'blockNumber' and 'blockHash' parameters in the JSON body.
*/
function getLastBlockAsync (self) {
  const errorResponse = {
    status: 500,
    body: {}
  };

  return new Promise(function (resolve, reject) {
    self.node.getBestBlockHash(function (err, blockHash) {
      if (err || !blockHash) {
        self.log.error('error retrieving the latest hash from Bitcoin', err);
        reject(errorResponse);
        return;
      }

      self.node.getBlockHeader(blockHash, function (err, blockHeader) {
        if (err || !blockHeader) {
          self.log.error('error retrieving the requested hash from Bitcoin', err);
          reject(errorResponse);
          return;
        }

        self.log.info('Requested block height ' + blockHeader.height);
        const successResponse = {
          status: 200,
          body: {
            'blockNumber': blockHeader.height,
            'blockHash': blockHeader.hash
          }
        };
        resolve(successResponse);
      });
    });
  });
}

SidetreeBlockchainService.prototype.getLastBlockHandler = function (request, response, next) {
  var self = this;
  setHeaders(response);
  const handle = getLastBlockAsync(self);
  handle
    .then(ok => {
      return response.status(ok.status).send(ok.body);
    })
    .catch(err => {
      self.log.error(err);
      return response.status(500).send(err);
    });
};

/** 
 * Returns the information associated with a block
 * @param blockId The identifier of the block; accepts either a block hash or a block number
 * @returns A Response object with 'blockNumber' and 'blockHash' parameters in the JSON body.
*/
function getBlockByIdAsync (self, blockId) {
  return new Promise(function (resolve, reject) {
    self.node.getBlockHeader(blockId, function (err, blockHeader) {
      if (err || !blockHeader) {
        self.log.error('error retrieving the requested hash from Bitcoin', err);
        const errorResponse = {
          status: 500,
          body: {
            'error': err
          }
        };
        reject(errorResponse);
        return;
      }

      self.log.info('Requested block height ' + blockHeader.height);
      const successResponse = {
        status: 200,
        body: {
          'blockNumber': blockHeader.height,
          'blockHash': blockHeader.hash
        }
      };
      resolve(successResponse);
    });
  });
}

SidetreeBlockchainService.prototype.getBlockByIdHandler = function (request, response, next) {
  var self = this;
  setHeaders(response);
  const blockId = request.params.id;
  const handle = getBlockByIdAsync(self, blockId);
  handle
    .then(ok => {
      return response.status(ok.status).send(ok.body);
    })
    .catch(err => {
      self.log.error(err);
      return response.status(500).send(err);
    });
};

/** 
 * Extracts sidetree's anchor file hashes from a list of Bitcoin transactions 
 * @param transactions The list of Bitcoin transactions
 * @param prefix The prefix used for Sidetree transactions (i.e., anchor file hashes)
 * @returns an array of anchor file hashes
*/
function extractAnchorFileHashes (transactions, prefix) {
  var hashes = [];
  for (var i = 0; i < transactions.length; i++) {
    var tx = transactions[i];
    var outputs = tx.outputs;

    for (var j = 0; j < outputs.length; j++) {
      var script = outputs[j].script;

      if (!script || !script.isDataOut()) {
        continue; // no data in the script
      }

      var data = script.getData().toString();
      if (data.startsWith(prefix)) {
        hashes.push(data.slice(prefix.length));
      }
    }
  }
  return hashes;
}

/** 
 * Scans the blockchain recursively, one block at a time.
 * The range (@param blockNumberStart, @param blockNumberEnd) is inclusive
 * When it scans a block, it searches for Bitcoin transaction with OP_RETURN strings that start with @param prefix
 * The method returns a list of anchor file hashes (along with their location) at their first occurance in the range
 * @param prefix The prefix used for Sidetree operations
 * @param response The object that will be set with appropriate HTTP response according to the design document
*/
function scanBlockRange (self, blockNumberStart, blockNumberEnd, prefix, response) {

  if (blockNumberStart > blockNumberEnd) {
    return response.status(200).send({
      'blockNumber': blockNumberStart,
      'hashes': []
    })
  }

  // get the block header associated with blockHeight
  self.node.getBlockHeader(blockNumberStart, function (err, blockHeader) {
    if (err || !blockHeader) {
      self.log.error('error retrieving the requested hash from Bitcoin', err);
      return response.status(500).send(err);
    }

    // now get the block 
    self.node.getBlock(blockHeader.hash, function (err, block) {
      if (err || !block) {
        self.log.error('error retrieving raw block from bitcoind', err);
        return response.status(500).send(err);
      }

      // extract hashes embedded in transactions that match prefix
      var hashes = extractAnchorFileHashes(block.transactions, prefix);

      if (hashes.length > 0) {
        return response.status(200).send({
          'blockNumber': blockHeader.height,
          'blockHash': blockHeader.hash,
          'hashes': hashes,
          'moreTransactions': (blockNumberStart < blockNumberEnd)
        });
      } else {
        return scanBlockRange(self, blockNumberStart + 1, blockNumberEnd, prefix, response);
      }
    });
  });
}

/**
 * Scans the blockchain (starting from the block number specified in the request) for Sidetree transactions
 * The method returns a list of anchor file hashes (along with information on where it found them). 
 * The current implementation returns as soon as it finds a block with Sidetree transactions in the range
 */
SidetreeBlockchainService.prototype.getTransactions = function (request, response, next) {
  setHeaders(response);
  var self = this;
  const blockNumberStart = Number(request.params.blockNumber); // the starting blocknumber
  const prefix = request.params.prefix;

  // obtain the block number of the tip of the blockchain
  const handle = getLastBlockAsync(self);
  handle
    .then(ok => {
      if (ok.status == 200) {
        const blockNumberEnd = Number(ok.body['blockNumber']);
        scanBlockRange(self, blockNumberStart, blockNumberEnd, prefix, response);
      } else {
        return response.status(500).send(err);
      }
    })
    .catch(err => {
      self.log.error(err);
      return response.status(500).send(err);
    });
};

/**
 * Scans the blockchain (starting from the block number specified in the request) for Sidetree transactions
 * The method returns a list of anchor file hashes (along with information on where it found them). 
 * The current implementation returns as soon as it finds a block with Sidetree transactions in the range
 */
SidetreeBlockchainService.prototype.getTransactionsRange = function (request, response, next) {
  setHeaders(response);
  var self = this;
  const blockNumberStart = Number(request.params.blockNumberStart); // the starting blocknumber
  const blockNumberEnd = Number(request.params.blockNumberEnd); // the ending blocknumber
  const prefix = request.params.prefix;
  scanBlockRange(self, blockNumberStart, blockNumberEnd, prefix, response);
};


/** 
 * Setup HTTP routes for various backend APIs exposed atop bitcored 
 */
SidetreeBlockchainService.prototype.setupRoutes = function (app) {
  app.post('/anchor/', this.anchorTransactionHandler.bind(this));
  app.get('/blocks/last', this.getLastBlockHandler.bind(this));
  app.get('/blocks/:id', this.getBlockByIdHandler.bind(this));
  app.get('/transactions/:blockNumber/:prefix', this.getTransactions.bind(this));
  app.get('/transactionsRange/:blockNumberStart/:blockNumberEnd/:prefix', this.getTransactionsRange.bind(this));

};

module.exports = SidetreeBlockchainService;
