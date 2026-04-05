import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchDeckCards, createCard, updateCard, deleteCard } from '../api/cards';
import type { CreateCardInput, UpdateCardInput } from '../types';

const PAGE_SIZE = 50;

export const useDeckCards = (deckId: number | null, includeChildren: boolean = true) => {
  return useInfiniteQuery({
    queryKey: ['cards', deckId, includeChildren],
    queryFn: ({ pageParam = 0 }) => fetchDeckCards({
      deckId: deckId!,
      includeChildren,
      limit: PAGE_SIZE,
      offset: pageParam
    }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.has_more) return undefined;
      return allPages.length * PAGE_SIZE;
    },
    enabled: deckId !== null,
  });
};

export const useCreateCard = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCardInput) => createCard(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cards'] });
      queryClient.invalidateQueries({ queryKey: ['deck-tree'] });
    },
  });
};

export const useUpdateCard = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateCardInput) => updateCard(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cards'] });
    },
  });
};

export const useDeleteCard = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteCard,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cards'] });
      queryClient.invalidateQueries({ queryKey: ['deck-tree'] });
    },
  });
};
