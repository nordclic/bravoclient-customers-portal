import { CustomerStatus } from "@prisma/client";
import Stripe from "stripe";

export function mapStripeSubscriptionStatus(
  status: Stripe.Subscription.Status,
): CustomerStatus {
  const statuses: Record<Stripe.Subscription.Status, CustomerStatus> = {
    active: "ACTIVE",
    canceled: "CANCELED",
    incomplete: "LEAD",
    incomplete_expired: "CANCELED",
    past_due: "PAST_DUE",
    paused: "PAST_DUE",
    trialing: "TRIAL",
    unpaid: "CANCELED",
  };

  return statuses[status] ?? "LEAD";
}
