import React from "react";
import {
  HeartPulse,
  Shield,
  Fuel,
  Wrench,
  Utensils,
  BedDouble,
  ShoppingBasket,
  CircleCheck,
  CircleDashed,
  Clock3,
} from "lucide-react";
export const categoryIcons = {
  Healthcare: HeartPulse,
  Police: Shield,
  Fuel,
  Mechanics: Wrench,
  Food: Utensils,
  Lodging: BedDouble,
  Supplies: ShoppingBasket,
};
export const categoryNames = {
  Healthcare: "Healthcare",
  Police: "Police",
  Fuel: "Fuel stations",
  Mechanics: "Vehicle repair",
  Food: "Food & dining",
  Lodging: "Places to stay",
  Supplies: "Essential supplies",
};
export function CategoryIcon({ group, ...props }) {
  const Icon = categoryIcons[group] || ShoppingBasket;
  return <Icon size={20} strokeWidth={1.7} {...props} />;
}
export function VerificationBadge({ status = "Not Verified" }) {
  const trusted = status === "Verified",
    partial = status === "Partially Verified";
  const Icon = trusted ? CircleCheck : partial ? Clock3 : CircleDashed;
  return (
    <span
      className={
        "verification " +
        (trusted ? "verified" : partial ? "partial" : "unverified")
      }
    >
      <Icon size={13} />
      {status}
    </span>
  );
}
