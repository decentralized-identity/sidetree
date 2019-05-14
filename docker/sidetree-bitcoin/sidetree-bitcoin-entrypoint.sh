#!/usr/bin/env bash

json -I -f ./dist/src/bitcoin-config.json -e "this.bitcoreSidetreeServiceUri=\"${BITCORE_SIDETREE_SERVICE_URI}\""
json -I -f ./dist/src/bitcoin-config.json -e "this.sidetreeTransactionPrefix=\"${SIDETREE_TRANSACTION_PREFIX}\""
json -I -f ./dist/src/bitcoin-config.json -e "this.bitcoinSidetreeGenesisBlockNumber=\"${BITCOIN_SIDETREE_GENESIS_BLOCK_NUMBER}\""
json -I -f ./dist/src/bitcoin-config.json -e "this.bitcoinSidetreeGenesisBlockHash=\"${BITCOIN_SIDETREE_GENESIS_BLOCK_HASH}\""
json -I -f ./dist/src/bitcoin-config.json -e "this.bitcoinPollingInternalSeconds=\"${BITCOIN_POLLING_INTERNAL_SECONDS}\""
json -I -f ./dist/src/bitcoin-config.json -e "this.databaseName=\"${BITCOIN_SIDETREE_DATA_BASE_NAME}\""
json -I -f ./dist/src/bitcoin-config.json -e "this.maxSidetreeTransactions=\"${MAX_SIDETREE_TRANSACTIONS}\""
json -I -f ./dist/src/bitcoin-config.json -e "this.mongoDbConnectionString=\"${MONGODB_CONNECTION_STRING}\""


node dist/src/bitcoin.js
