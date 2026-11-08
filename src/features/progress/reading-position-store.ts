import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ReadingPosition, MinimalReadingPosition, DEFAULT_POSITION_CONFIG } from './reading-position-types';

/** Storage interface for reading positions */
interface ReadingPositionStorage {
  getPosition: () => ReadingPosition | null;
  savePosition: (position: ReadingPosition) => Promise<void>;
  clearPosition: () => Promise<void>;
}

/** Default storage using IndexedDB */
class IndexedDBStorage implements ReadingPositionStorage {
  private dbPromise: Promise<IDBDatabase>;
  private storeName = 'readingPositions';

  constructor() {
    this.dbPromise = this.openDB();
  }

  private async openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('MathScratchpadDB', 2);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (event) => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'userId' });
        }
      };
    });
  }

  async getPosition(): Promise<ReadingPosition | null> {
    try {
      const db = await this.dbPromise;
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(this.storeName, 'readonly');
        const store = transaction.objectStore(this.storeName);
        const request = store.get('currentUser'); // Using a fixed key for simplicity
        
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } catch {
      return null;
    }
  }

  async savePosition(position: ReadingPosition): Promise<void> {
    try {
      const db = await this.dbPromise;
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(this.storeName, 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const request = store.put({ ...position, userId: 'currentUser' });
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch {
      // Fallback to localStorage
      localStorage.setItem('readingPositionBackup', JSON.stringify(position));
    }
  }

  async clearPosition(): Promise<void> {
    try {
      const db = await this.dbPromise;
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(this.storeName, 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const request = store.delete('currentUser');
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch {
      localStorage.removeItem('readingPositionBackup');
    }
  }
}

/** Create the reading position store */
export const useReadingPositionStore = create<{
  position: ReadingPosition | null;
  config: typeof DEFAULT_POSITION_CONFIG;
  storage: ReadingPositionStorage;
  setPosition: (position: ReadingPosition) => Promise<void>;
  updatePosition: (partial: Partial<ReadingPosition>) => Promise<void>;
  clearPosition: () => Promise<void>;
  restorePosition: () => Promise<ReadingPosition | null>;
}>()(
  persist(
    (set, get) => ({
      position: null,
      config: DEFAULT_POSITION_CONFIG,
      storage: new IndexedDBStorage(),
      
      setPosition: async (position: ReadingPosition) => {
        await get().storage.savePosition(position);
        set({ position });
      },
      
      updatePosition: async (partial: Partial<ReadingPosition>) => {
        const current = get().position;
        if (current) {
          const updated = { ...current, ...partial, updatedAt: new Date() };
          await get().setPosition(updated);
        }
      },
      
      clearPosition: async () => {
        await get().storage.clearPosition();
        set({ position: null });
      },
      
      restorePosition: async () => {
        const stored = await get().storage.getPosition();
        if (stored) {
          set({ position: stored });
        }
        return stored;
      },
    }),
    {
      name: 'reading-position-store',
      partialize: (state) => ({
        // Only persist minimal data to avoid storage bloat
        position: state.position ? {
          chapterId: state.position.chapterId,
          lessonId: state.position.lessonId,
          sectionId: state.position.sectionId,
          exerciseId: state.position.exerciseId,
          stepId: state.position.stepId,
          scrollOffset: state.position.scrollOffset,
          contentVersion: state.position.contentVersion,
          lastActivity: state.position.lastActivity,
          updatedAt: state.position.updatedAt.toISOString(),
        } : null,
      }),
    }
  )
);

/** Get minimal position for quick restoration */
export function getMinimalPosition(position: ReadingPosition | null): MinimalReadingPosition | null {
  if (!position) return null;
  return {
    chapterId: position.chapterId,
    lessonId: position.lessonId,
    sectionId: position.sectionId,
    exerciseId: position.exerciseId,
    stepId: position.stepId,
    scrollOffset: position.scrollOffset,
  };
}
