"use client";

import type { PrepOrder } from "@/lib/api";

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function pickupLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

/**
 * Carte commande du point de préparation : uniquement SES articles, avec les
 * variantes bien visibles (essentiel) et la mention précommande.
 */
export function OrderCard({
  order,
  onToggleItem,
}: {
  order: PrepOrder;
  onToggleItem: (orderId: string, itemId: string, next: boolean) => void;
}) {
  const ref = order.orderReference || order.orderNumber;
  const allPrepared =
    order.items.length > 0 && order.items.every((it) => it.prepared);

  return (
    <article className={`order ${allPrepared ? "done" : ""}`}>
      <div className="order-head">
        <span className="order-ref">{ref}</span>
        {order.isPreorder && (
          <span className="badge preorder">📅 PRÉCOMMANDE</span>
        )}
        {allPrepared ? (
          <span className="badge ready">Prête</span>
        ) : (
          <span className="badge new">
            {order.items.filter((i) => !i.prepared).length} à préparer
          </span>
        )}
        <span className="order-time">{timeLabel(order.createdAt)}</span>
      </div>

      <div className="order-meta">
        <b>{order.customerName}</b>
        {order.pickupPoint ? ` · ${order.pickupPoint.name}` : ""}
        {order.isPreorder && order.pickupDate
          ? ` · retrait ${pickupLabel(order.pickupDate)}`
          : ""}
      </div>

      {order.notes && <div className="order-note">💬 {order.notes}</div>}

      <div className="items">
        {order.items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`item ${item.prepared ? "prepared" : ""}`}
            onClick={() => onToggleItem(order.id, item.id, !item.prepared)}
          >
            <span className="check">{item.prepared ? "✓" : ""}</span>
            <span className="item-body">
              <span className="item-name">
                <span className="qty">{item.quantity}×</span>
                {item.product?.name ?? "Article"}
              </span>
              {item.variations.length > 0 && (
                <span className="variations">
                  {item.variations.map((v, i) => (
                    <span key={i} className="variation">
                      {v.variationName ? `${v.variationName}: ` : ""}
                      {v.optionName}
                    </span>
                  ))}
                </span>
              )}
              {item.itemNotes && (
                <span className="item-note">💬 {item.itemNotes}</span>
              )}
            </span>
          </button>
        ))}
      </div>
    </article>
  );
}
