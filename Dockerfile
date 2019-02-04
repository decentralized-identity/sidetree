FROM node:lts

COPY ./dist /app/dist/
COPY ./node_modules /app/node_modules
COPY ./package.json /app
COPY ./package-lock.json /app
WORKDIR /app

EXPOSE 3001 4002 4003
CMD npm start
