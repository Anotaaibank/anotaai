import {ApiError} from './api.ts';
import type {Proposal} from './contracts.ts';

type Interpret = (input: Record<string, unknown>) => Promise<Proposal>;

/** A failed request is never repeated automatically, including after expiry. */
export function createTextConversation(interpret: Interpret) {
  let conversation: string | undefined;
  return {
    async send(text: string, requestId: string): Promise<Proposal> {
      try {
        const result = await interpret({
          action: 'interpret', text, request_id: requestId,
          ...(conversation ? {conversation_id: conversation} : {}), section: 'resumo',
        });
        conversation = result.conversation_id;
        return result;
      } catch (error) {
        if (error instanceof ApiError && error.status === 410) conversation = undefined;
        throw error;
      }
    },
  };
}
