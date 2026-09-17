import { createTicketRepository } from './queue/repository.js';
import { createQueueService } from './queue/service.js';
import { createActivityService } from './activity/service.js';
import { createSummaryService } from './summary/service.js';
export { QueryError, CursorError } from './errors.js';

export function createModerationQueue(tickets) {
  const repository = createTicketRepository(tickets);
  return {
    list: createQueueService(repository),
    activity: createActivityService(repository),
    summary: createSummaryService(repository),
    remove: (id) => repository.remove(id),
  };
}
