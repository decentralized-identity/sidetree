FROM node:8-slim

# Installation Dependencies
RUN apt-get update && \
    apt-get install -y \
    g++ \
    libzmq3-dev \
    make \
    python

RUN wget https://github.com/Yelp/dumb-init/releases/download/v1.2.2/dumb-init_1.2.2_amd64.deb
RUN dpkg -i dumb-init_*.deb

WORKDIR /app/sidetree-bitcore
COPY ./docker/sidetree-bitcore ./

# Setup Node
RUN npm config set package-lock false && npm install

# Copy Sidetree Module
COPY ./lib/bitcored-extension ./node_modules/sidetree

# Install json to replace config via env variables.
RUN npm install json -g

# Purge Dependencies
RUN apt-get purge -y \
  g++ make python gcc && \
  apt-get autoclean && \
  apt-get autoremove -y

RUN rm -rf \
  node_modules/bitcore-node/test \
  node_modules/bitcore-node/bin/bitcoin-*/bin/bitcoin-qt \
  node_modules/bitcore-node/bin/bitcoin-*/bin/test_bitcoin \
  node_modules/bitcore-node/bin/bitcoin-*-linux64.tar.gz \
  /dumb-init_*.deb \
  /root/.npm \
  /root/.node-gyp \
  /tmp/* \
  /var/lib/apt/lists/*

# Runtime Things.
ENV BITCOIN_NETWORK testnet
ENV BITCOIN_PRIVATE_KEY_WIF ""
ENV BITCOIN_FEE 10000

EXPOSE 3001

HEALTHCHECK --interval=5s --timeout=5s --retries=10 CMD curl -f http://localhost:3001/insight/

ENTRYPOINT ["/usr/bin/dumb-init", "--", "./bitcore-node-entrypoint.sh"]

VOLUME /app/sidetree-bitcore/data
