import { openDB, type IDBPDatabase } from 'idb';
import {
  LEARNING_DB_NAME,
  LEARNING_DB_VERSION,
  LEARNING_CACHE_STORE,
  LEARNING_OUTBOX_STORE,
  LEARNING_SERVER_EVENTS_STORE,
  LEARNING_META_STORE,
  LEARNING_QUARANTINE_STORE,
  type LearningDb,
} from './schema';

export let dbInstance: IDBPDatabase<LearningDb> | undefined;
let dbPromise: Promise<IDBPDatabase<LearningDb>> | undefined;

export function database(): Promise<IDBPDatabase<LearningDb>> {
  if (!dbPromise) {
    dbPromise = openDB<LearningDb>(LEARNING_DB_NAME, LEARNING_DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(LEARNING_CACHE_STORE)) db.createObjectStore(LEARNING_CACHE_STORE, { keyPath: 'key' });
        if (!db.objectStoreNames.contains(LEARNING_OUTBOX_STORE)) {
          const store = db.createObjectStore(LEARNING_OUTBOX_STORE, { keyPath: 'id' });
          store.createIndex('by-queued-at', 'queuedAt');
          store.createIndex('by-migration-id', 'migrationId');
        }
        if (!db.objectStoreNames.contains(LEARNING_SERVER_EVENTS_STORE)) {
          const store = db.createObjectStore(LEARNING_SERVER_EVENTS_STORE, { keyPath: 'seq' });
          store.createIndex('by-event-id', 'event.id', { unique: true });
          store.createIndex('by-migration-id', 'event.migrationChunk.id');
        }
        if (!db.objectStoreNames.contains(LEARNING_QUARANTINE_STORE)) {
          db.createObjectStore(LEARNING_QUARANTINE_STORE, { keyPath: 'quarantineId' });
        }
        if (!db.objectStoreNames.contains(LEARNING_META_STORE)) db.createObjectStore(LEARNING_META_STORE, { keyPath: 'key' });
      },
      blocked() {
        // A second tab may hold an old database connection; it will close on versionchange.
      },
    }).then((opened) => {
      dbInstance = opened;
      opened.onversionchange = () => {
        opened.close();
        dbInstance = undefined;
        dbPromise = undefined;
      };
      return opened;
    });
  }
  return dbPromise;
}

export function closeLearningDatabase() {
  dbInstance?.close();
  dbInstance = undefined;
  dbPromise = undefined;
}
