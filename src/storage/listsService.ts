/**
 * listsService.ts
 *
 * Manages temporary Lists (quick utility lists for "Watch Later", "Study Background", etc.).
 * Lists are stored locally only and never backed up to Firestore.
 *
 * Note: Lists are technically stored in the same data structure as Collections
 * (in collectionsService), but this service provides a simpler API focused on
 * temporary list management without backup concerns.
 *
 * Storage keys:
 *  @filmsort:collections — array of Collection objects (listType='list' for lists)
 */

import { collectionsService } from './collectionsService';
import { Collection, CollectionItem } from '../types';

export const listsService = {
  /**
   * Get all lists (filters out collections).
   */
  async getLists(): Promise<Collection[]> {
    return collectionsService.getLists();
  },

  /**
   * Get a single list by ID.
   */
  async getById(id: string): Promise<Collection | null> {
    const list = await collectionsService.getById(id);
    return list?.listType === 'list' ? list : null;
  },

  /**
   * Create a new temporary list.
   * Lists are always created with backedUp=false and listType='list'.
   */
  async createList(name: string): Promise<Collection> {
    const list = await collectionsService.create(name, 'list');
    // Ensure backedUp is false for lists (it should be by default)
    if (list.backedUp) {
      await collectionsService.update(list.id, { backedUp: false });
      return { ...list, backedUp: false };
    }
    return list;
  },

  /**
   * Rename a list.
   */
  async rename(id: string, name: string): Promise<Collection | null> {
    return collectionsService.update(id, { name });
  },

  /**
   * Delete a list.
   */
  async delete(id: string): Promise<void> {
    return collectionsService.delete(id);
  },

  /**
   * Add an item to a list.
   */
  async addItem(listId: string, item: CollectionItem): Promise<Collection | null> {
    return collectionsService.addItem(listId, item);
  },

  /**
   * Remove an item from a list.
   */
  async removeItem(listId: string, itemId: string): Promise<Collection | null> {
    return collectionsService.removeItem(listId, itemId);
  },

  /**
   * Reorder items within a list.
   */
  async reorderItems(listId: string, items: CollectionItem[]): Promise<Collection | null> {
    return collectionsService.reorderItems(listId, items);
  },

  /**
   * Check if an item exists in any list.
   */
  async isInAnyList(itemId: string): Promise<boolean> {
    const lists = await listsService.getLists();
    return lists.some((list) => list.items.some((item) => item.id === itemId));
  },

  /**
   * Get all lists that contain a specific item.
   */
  async getListsContainingItem(itemId: string): Promise<Collection[]> {
    const lists = await listsService.getLists();
    return lists.filter((list) => list.items.some((item) => item.id === itemId));
  },

  /**
   * Clear all lists (used on account deletion or debug).
   */
  async clearAll(): Promise<void> {
    const lists = await listsService.getLists();
    await Promise.all(lists.map((list) => collectionsService.delete(list.id)));
  },
};
