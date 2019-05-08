#!/usr/bin/env bash

json -I -f ./dist/src/core-config.json -e "this.devMode=\"${SIDETREE_CORE_DEV_MODE}\""
json -I -f ./dist/src/core-config.json -e "this.port=\"${SIDETREE_CORE_PORT}\""
json -I -f ./dist/src/core-config.json -e "this.didMethodName=\"${DID_METHOD_NAME}\""
json -I -f ./dist/src/core-config.json -e "this.contentAddressableStoreServiceUri=\"${CONTENT_ADDRESSABLE_STORE_SERVICE_URI}\""
json -I -f ./dist/src/core-config.json -e "this.blockchainServiceUri=\"${BLOCKCHAIN_SERVICE_URI}\""
json -I -f ./dist/src/core-config.json -e "this.batchingIntervalInSeconds=\"${BATCHING_INTERVAL_IN_SECONDS}\""
json -I -f ./dist/src/core-config.json -e "this.observingIntervalInSeconds=\"${OBSERVING_INTERVAL_IN_SECONDS}\""
json -I -f ./dist/src/core-config.json -e "this.maxConcurrentDownloads=\"${MAX_CONCURRENT_DOWNLOADS}\""
json -I -f ./dist/src/core-config.json -e "this.mongoDbConnectionString=\"${MONGODB_CONNECTION_STRING}\""


node dist/src/core.js
