# Sidetree Docker Images

## Overview
The Sidetree components can be build an operated as dockerized containers. To run a sidetree installation, you'll need the following images:

- *bitcore-sidetree* -- Bitcore Node with Sidetree Bitcore Extension
- *sidetree-service*
- *mongo*
- *ipfs*

## Environment
You'll need to have Docker Environment setup. To interact with the `docker-compose.yaml` you'll also need `docker-compose`. 

## Build

To build all containers locally run

    docker-compose build
    
in the root directory of this repository.

## Container Configuration
Containers are (mostly) configured via environment variables. These are:

### bitcore-sidetree
- BITCOIN_NETWORK: {testnet, livenet}
- BITCOIN_PRIVATE_KEY_WIF: "Private Key in XX Format"
- BITCOIN_FEE: "Tx Fee in Satoshi"
