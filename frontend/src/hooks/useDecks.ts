import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchDeckTree, checkAnkiHealth, createDeck } from '../api/decks';

export const useAnkiHealth = () => {
  return useQuery({
    queryKey: ['anki-health'],
    queryFn: checkAnkiHealth,
    refetchInterval: 5000,
  });
};

export const useDeckTree = () => {
  return useQuery({
    queryKey: ['deck-tree'],
    queryFn: fetchDeckTree,
    staleTime: 30000,
  });
};

export const useCreateDeck = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createDeck,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deck-tree'] });
    },
  });
};
