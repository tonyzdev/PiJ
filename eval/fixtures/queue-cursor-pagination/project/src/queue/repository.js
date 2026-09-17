import { copyTicket } from '../models/ticket.js';
export function createTicketRepository(tickets) {
  const rows = tickets.map(copyTicket);
  return {
    async forTenant(tenantId) { return rows.filter((row) => row.tenantId === tenantId).map(copyTicket); },
    remove(id) { const index = rows.findIndex((row) => row.id === id); if (index >= 0) rows.splice(index, 1); },
  };
}
