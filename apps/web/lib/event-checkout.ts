export function playerEventCheckoutHref(input: {
  readonly slug: string;
  readonly divisionId?: string;
  readonly ticketTypeId?: string;
  readonly ticketQuantity?: string;
}): string {
  const query = new URLSearchParams();
  if (input.divisionId) query.set("division", input.divisionId);
  if (input.ticketTypeId) query.set("ticket", input.ticketTypeId);
  if (input.ticketQuantity) query.set("quantity", input.ticketQuantity);

  const search = query.toString();
  return `/app/checkout/${encodeURIComponent(input.slug)}${search ? `?${search}` : ""}`;
}
