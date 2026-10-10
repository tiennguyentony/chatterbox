import { createChatServer } from './app';
import { configFromEnv } from './config';
import { systemClock } from './lib/clock';
import { randomIds } from './lib/ids';
import { consoleLogger as logger } from './lib/logger';
import { seed } from './seed';
import { MemoryStore } from './store/memoryStore';

const config = configFromEnv();
const store = new MemoryStore();
await seed(store, systemClock);
logger.info('seeded demo data');

const { server, close } = createChatServer({ store, clock: systemClock, ids: randomIds, logger, config });

server.listen(config.port, config.host, () => {
  logger.info(`Chatterbox listening on http://${config.host}:${config.port}`);
});

process.on('SIGINT', () => {
  close().finally(() => process.exit(0));
});
