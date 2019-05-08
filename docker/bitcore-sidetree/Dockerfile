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

WORKDIR /app/bitcore-sidetree-node
COPY ./docker/bitcore-sidetree ./


# Setup Node
RUN npm config set package-lock false && npm install

# Copy Sidetree Module
COPY ./lib/bitcored-extension ./node_modules/sidetree

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

RUN ls -la

# Runtime Things.
ENV BITCOIN_NETWORK testnet

EXPOSE 3001 3002 3232 9999 19999

HEALTHCHECK --interval=5s --timeout=5s --retries=10 CMD curl -f http://localhost:3001/insight/

ENTRYPOINT ["/usr/bin/dumb-init", "--", "./bitcore-node-entrypoint.sh"]

VOLUME /app/bitcore-sidetree-node/data
