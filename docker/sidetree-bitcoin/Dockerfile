FROM node:10-slim


# Installation Dependencies
RUN apt-get update && \
    apt-get install -y \
    g++ \
    make \
    python

RUN wget https://github.com/Yelp/dumb-init/releases/download/v1.2.2/dumb-init_1.2.2_amd64.deb
RUN dpkg -i dumb-init_*.deb

WORKDIR /app/sidetree-bitcoin

COPY ./src/bitcoin* ./src/
COPY ./lib ./lib
COPY ./*.json ./
COPY ./docker/sidetree-bitcoin ./

# Setup Node
RUN npm config set package-lock false && \
    npm install && \
    npm run build

# Remove devDependencies
RUN npm prune --production

# Install json to replace config via env variables.
RUN npm install json -g

# Purge Dependencies
RUN apt-get purge -y \
  g++ make python gcc && \
  apt-get autoclean && \
  apt-get autoremove -y

RUN rm -rf \
  /dumb-init_*.deb \
  /root/.npm \
  /root/.node-gyp \
  /tmp/* \
  /var/lib/apt/lists/*

# Runtime Things.
ENV SIDETREE_BITCOIN_PORT 3002
ENV BITCORE_SIDETREE_SERVICE_URI ""
ENV SIDETREE_TRANSACTION_PREFIX "ion:"
ENV BITCOIN_SIDETREE_GENESIS_BLOCK_NUMBER 1480000
ENV BITCOIN_SIDETREE_GENESIS_BLOCK_HASH "00000000000001571bc6faf951aeeb5edcbbd9fd3390be23f8ee7ccc2060d591"
ENV BITCOIN_POLLING_INTERNAL_SECONDS 100
ENV BITCOIN_SIDETREE_DATABASE_NAME "sidetree-bitcoin"
ENV TRANSACTION_FETCH_PAGE_SIZE 10
ENV MONGODB_CONNECTION_STRING "mongodb://localhost:27017/"


EXPOSE 3002

HEALTHCHECK --interval=5s --timeout=5s --retries=10 CMD curl -f http://localhost:${SIDETREE_BITCOIN_PORT}/transactions/

ENTRYPOINT ["/usr/bin/dumb-init", "--", "./sidetree-bitcoin-entrypoint.sh"]
