export const STATUSES = [
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "out_for_delivery",
  "delivered",
  "returned",
  "cancelled",
] as const;

export type Status = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  confirmed: "Order Confirmed",
  processing: "Processing",
  shipped: "Shipped",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  returned: "Returned",
  cancelled: "Cancelled",
};

/** Explicit order lifecycle: every status change must follow an allowed edge. */
export const STATUS_TRANSITIONS: Record<Status, readonly Status[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["out_for_delivery"],
  out_for_delivery: ["delivered"],
  delivered: ["returned"],
  returned: [],
  cancelled: [],
};

export function isAllowedStatusTransition(from: string, to: Status) {
  return (STATUSES as readonly string[]).includes(from) && STATUS_TRANSITIONS[from as Status].includes(to);
}
