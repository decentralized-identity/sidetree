// This module implements a bitcored-based service that enables a
// Sidetree compute node to interface with Bitcoin's blockchain for
// anchoring Sidetree transactions. Credits: bitcore tutorial

delete global._bitcore;
var inherits = require('util').inherits;
var EventEmitter = require('events').EventEmitter;
var bitcore = require('bitcore-lib');
var BufferUtil = bitcore.util.buffer;
var Networks = bitcore.Networks;
var Block = bitcore.Block;
var $ = bitcore.util.preconditions;

function SidetreeRooterService(options) {
  EventEmitter.call(this);
  this.node = options.node;

  $.checkState(this.node.network, 'Node is expected to have a "network" property');
  this.network = this.node.network;
  this.log = this.node.log;
}
inherits(SidetreeRooterService, EventEmitter);

SidetreeRooterService.dependencies = ['bitcoind'];

SidetreeRooterService.prototype.start = function(callback) {
  setImmediate(callback);
  var self = this;
  self.log.info('SidetreeRooterService anchorer ready');
};

SidetreeRooterService.prototype.stop = function(callback) {
  setImmediate(callback);
};

SidetreeRooterService.prototype.getAPIMethods = function() {
  return [];
};

SidetreeRooterService.prototype.getPublishEvents = function() {
  return [];
};

SidetreeRooterService.prototype.getRoutePrefix = function() {
  return 'SidetreeRooterService';
};

SidetreeRooterService.prototype.getAddrInfo = function(request, response, next) {
  response.set('Access-Control-Allow-Origin','*');
  response.set('Access-Control-Allow-Methods','POST, GET, OPTIONS, PUT');
  response.set('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');

  var self = this;
  var addr = request.params.address;
  this.node.getAddressUnspentOutputs(addr, {}, function(err, unspentOutputs) {
    if (err) {
        self.log.info('error retrieving information', err);
        return response.send(500, err);
    }
    self.log.info('Address data ' + addr + ':', unspentOutputs);
    response.send(unspentOutputs);
  });
};


SidetreeRooterService.prototype.anchorBitcoin = function(request, response, next) {
  response.set('Access-Control-Allow-Origin','*');
  response.set('Access-Control-Allow-Methods','POST, GET, OPTIONS, PUT');
  response.set('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');

  var self = this;
  var txn = request.params.transaction;
  this.node.sendTransaction(txn, function(err, transactionId) {
    if (err) {
        self.log.info('error anchoring your transaction on Bitcoin', err);
        return response.send(500, err);
    }
    self.log.info('Transaction id ' + transactionId);
    response.send(transactionId);
  });
};

SidetreeRooterService.prototype.setupRoutes = function(app) {
    app.get('/anchor/:transaction', this.anchorBitcoin.bind(this));
    app.get('/address/:address', this.getAddrInfo.bind(this));
};

module.exports = SidetreeRooterService;
