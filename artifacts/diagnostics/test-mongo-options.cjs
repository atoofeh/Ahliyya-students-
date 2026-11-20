// Local verification only: this Windows host needs a longer WiredTiger cold start.
const { MongoMemoryServer } = require('../../server/node_modules/mongodb-memory-server');
const create = MongoMemoryServer.create.bind(MongoMemoryServer);
MongoMemoryServer.create = (options = {}) => create({
  ...options,
  instance: {
    ...options.instance,
    launchTimeout: 60000,
    args: ['--wiredTigerCacheSizeGB', '0.25', ...(options.instance?.args || [])],
  },
});
