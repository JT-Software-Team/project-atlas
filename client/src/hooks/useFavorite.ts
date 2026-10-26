import { useCallback } from 'react';
import { api } from '../lib/api';
import type { ProjectCard } from '../lib/types';
import { useToast } from '../components/Toast';

/** Optimistically toggle a favorite, rolling back on failure. */
export function useFavoriteToggle(update: (id: number, isFavorite: boolean) => void) {
  const toast = useToast();
  return useCallback(async (p: Pick<ProjectCard, 'id' | 'name' | 'isFavorite'>) => {
    const next = !p.isFavorite;
    update(p.id, next);
    try {
      await api.put(`/projects/${p.id}/favorite`, { favorite: next });
      toast(next ? `Added “${p.name}” to favorites` : `Removed “${p.name}” from favorites`, 'info');
    } catch {
      update(p.id, !next);
      toast('Could not update favorites. Please try again.', 'error');
    }
  }, [update, toast]);
}
