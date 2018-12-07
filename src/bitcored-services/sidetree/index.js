// This module implements a bitcored-based service that enables a
// Sidetree compute node to interface with Bitcoin's blockchain

delete global._bitcore;
var inherits = require('util').inherits;
var EventEmitter = require('events').EventEmitter;
var bitcore = require('bitcore-lib');
var BufferUtil = bitcore.util.buffer;
var Networks = bitcore.Networks;
var Block = bitcore.Block;
var $ = bitcore.util.preconditions;
var config = require('./config.json');

function SidetreeBlockchainService(options) {
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

function headers(response) {
  response.set('Access-Control-Allow-Origin', '*');
  response.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS, PUT');
  response.set('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
}

//returns the UTXOs associated with an address
SidetreeBlockchainService.prototype.getAddressInfo = function (request, response, next) {
  headers(response);

  var self = this;
  var addr = request.params.address;
  this.node.getAddressUnspentOutputs(addr, {}, function (err, unspentOutputs) {
    if (err) {
      self.log.info('error retrieving information', err);
      return response.send(500, err);
    }
    response.send(unspentOutputs);
  });
};

// anchors a given string on Bitcoin by constructing a bitcoin transaction and transmitting it to the blockchain network
SidetreeBlockchainService.prototype.anchorBitcoinTransaction = function (request, response, next) {
  headers(response);
  var self = this;
  var sidetreeTransaction = request.body.transaction;

  var privateKeyWIF = config.privateKeyWIF;
  var privateKey = bitcore.PrivateKey.fromWIF(privateKeyWIF);
  var address = privateKey.toAddress();

  var fees = config.fees;

  this.node.getAddressUnspentOutputs(address.toString(), {}, function (err, unspentOutputs) {
    if (err) {
      self.log.info('error retrieving information', err);
      return response.status(500).send(err);
    }

    var tx = constructBitcoinTransaction(unspentOutputs, sidetreeTransaction, address, privateKey, fees);

    // anchor the transaction on the Bitcoin blockchain
    submitBitcoinTransaction(self, tx, response);
  });
};

function constructBitcoinTransaction(unspentOutputs, sidetreeTransaction, address, privateKey, fees) {
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

function submitBitcoinTransaction(self, tx, response) {
  self.node.sendTransaction(tx, function (err, transactionId) {
    if (err) {
      self.log.info('error anchoring your transaction on Bitcoin', err);
      return response.status(500).send(err);
    }
    self.log.info('Transaction id ' + transactionId);
    response.status(200).send({ 'transactionId': transactionId });
  });
}

function getBlockByHashHelper(self, blockIdentifier, response) {
  self.node.getBlockHeader(blockIdentifier, function (err, blockHeader) {
    if (err) {
      self.log.info('error retrieving the requested hash from Bitcoin', err);
      return response.status(404).send(err);
    }
    if (!blockHeader) {
      self.log.info('could not get height for the requested hash');
      return response.status(500).send(err);
    }
    self.log.info('Requested block height ' + blockHeader.height);
    response.status(200).send({
      'blockNumber': blockHeader.height,
      'blockHash': blockHeader.hash
    });
  });
}


// returns the block information, specifically the height of a block and its hash, for the most recent block
SidetreeBlockchainService.prototype.getLastBlock = function (request, response, next) {
  var self = this;
  headers(response);
  self.node.getBestBlockHash(function (err, blockHash) {
    if (err) {
      self.log.info('error retrieving the latest hash from Bitcoin', err);
      return response.status(404).send(err);
    }
    if (!blockHash) {
      self.log.info('could not get the latest blockHash for the requested hash');
      return response.status(500).send(err);
    }
    getBlockByHashHelper(self, blockHash, response);
  });
};

// returns the block information, specifically the height of a block, given its hash
SidetreeBlockchainService.prototype.getBlockByHash = function (request, response, next) {
  headers(response);
  var self = this;
  var blockHash = request.params.hash;
  getBlockByHashHelper(self, blockHash, response);
};

// returns the block information, specifically the hash of a block, given its height
SidetreeBlockchainService.prototype.getBlockByHeight = function (request, response, next) {
  headers(response);
  var self = this;
  var blockHeight = request.params.height;
  getBlockByHashHelper(self, blockHeight, response);
};

function extractTransactions(transactions, prefix, hashes) {
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
        hashes.push(data);
      }
    }
  }
}

// returns the ordered list of sidetree transactions at a given height
SidetreeBlockchainService.prototype.getTransactions = function (request, response, next) {
  headers(response);
  var self = this;
  var height = request.params.height;
  var prefix = request.params.prefix;


  // get the block header associated with the requested height
  this.node.getBlockHeader(height, function (err, blockHeader) {
    if (err) {
      self.log.info('error retrieving the requested hash from Bitcoin', err);
      return response.status(404).send(err);
    }
    if (!blockHeader) {
      self.log.info('could not get header for the requested height');
      return response.status(500).send(err)
    }

    self.node.getBlock(blockHeader.hash, function (err, block) {
      if (err) {
        self.log.info('error retrieving raw block from bitcoind', err);
        return response.status(404).send(err);
      }

      var hashes = [];
      extractTransactions(block.transactions, prefix, hashes);

      // send the response
      response.status(200).send({
        'blockNumber': blockHeader.height,
        'blockHash': blockHeader.hash,
        'hashes': hashes
      });
    });
  });
};

// setup HTTP routes for various backend APIs exposed atop bitcored
SidetreeBlockchainService.prototype.setupRoutes = function (app) {
  app.post('/anchor/', this.anchorBitcoinTransaction.bind(this));
  app.get('/address/:address', this.getAddressInfo.bind(this));
  app.get('/blocks/last', this.getLastBlock.bind(this));
  app.get('/blocks/:hash', this.getBlockByHash.bind(this));
  app.get('/blocks/:height', this.getBlockByHeight.bind(this));
  app.get('/transactions/:height/:prefix', this.getTransactions.bind(this));
};

module.exports = SidetreeBlockchainService;
