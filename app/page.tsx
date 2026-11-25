"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  logout as logoutSession,
  fetchDoneOrders,
  fetchTodoOrders,
  getToken,
  getUser,
  setItemPrepared,
  type PrepOrder,
} from "@/lib/api";
import { OrderCard } from "@/components/order-card";

const POLL_MS = 5_000;
const DONE_PAGE_SIZE = 20;

/** Statuts « actifs » (filet de sécurité client : un backend ancien qui ignore
 *  `scope=todo` renverrait TOUTES les commandes, livrées comprises). */
const ACTIVE_STATUSES = new Set([
  "PENDING",
  "CONFIRMED",
  "PREORDER",
  "PREPARING",
  "READY",
  "READYPICKUP",
  "DELIVERING",
]);

function isTodo(o: PrepOrder): boolean {
  return (
    ACTIVE_STATUSES.has(o.status) &&
    o.items.some((it) => !it.prepared)
  );
}

export default function BoardPage() {
  const router = useRouter();

  // « À préparer » : liste bornée, pollée en continu (temps réel).
  const [todo, setTodo] = useState<PrepOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(true);

  // « Terminées » : historique paginé, chargé à la demande (lazyload).
  const [done, setDone] = useState<PrepOrder[]>([]);
  const [donePage, setDonePage] = useState(0); // 0 = pas encore chargé
  const [doneHasMore, setDoneHasMore] = useState(false);
  const [doneLoading, setDoneLoading] = useState(false);

  const [tab, setTab] = useState<"todo" | "done">("todo");
  const [notifOn, setNotifOn] = useState(false);
  // Rendu identique serveur/client au premier passage (hydratation), puis on
  // lit le nom du point depuis le localStorage en effet.
  const [posName, setPosName] = useState("Point de préparation");

  const knownIds = useRef<Set<string> | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // ---------- Alerte sonore (bip) sur nouvelle commande ----------
  const beep = useCallback(() => {
    try {
      audioCtx.current ??= new AudioContext();
      const ctx = audioCtx.current;
      const now = ctx.currentTime;
      for (let i = 0; i < 2; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.4, now + i * 0.25);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.25 + 0.2);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + i * 0.25);
        osc.stop(now + i * 0.25 + 0.22);
      }
    } catch {
      // silencieux si l'audio est bloqué
    }
    if ("vibrate" in navigator) navigator.vibrate?.([200, 100, 200]);
  }, []);

  const notify = useCallback((order: PrepOrder) => {
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    const ref = order.orderReference || order.orderNumber;
    const count = order.items.length;
    new Notification(
      order.isPreorder ? `📅 Précommande ${ref}` : `🔔 Commande ${ref}`,
      {
        body: `${count} article(s) à préparer`,
        tag: order.id,
      },
    );
  }, []);

  // ---------- Polling du « À préparer » ----------
  const load = useCallback(async () => {
    try {
      // Double filtre : scope serveur + filet client (compat backend ancien).
      const data = (await fetchTodoOrders()).filter(isTodo);
      setOnline(true);

      // Détection des nouvelles commandes (hors premier chargement).
      const ids = new Set(data.map((o) => o.id));
      if (knownIds.current) {
        const fresh = data.filter((o) => !knownIds.current!.has(o.id));
        if (fresh.length > 0) {
          beep();
          fresh.forEach(notify);
        }
      }
      knownIds.current = ids;

      // FIFO de préparation : les plus anciennes d'abord.
      data.sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      setTodo(data);
    } catch (e) {
      if (e instanceof Error && e.message !== "Session expirée") {
        setOnline(false);
      }
    } finally {
      setLoading(false);
    }
  }, [beep, notify]);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    setNotifOn(
      typeof Notification !== "undefined" &&
        Notification.permission === "granted",
    );
    const user = getUser();
    setPosName(
      (user?.externalPOS as { name?: string } | null)?.name ||
        (user?.name as string) ||
        "Point de préparation",
    );
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load, router]);

  // ---------- Lazyload des « Terminées » ----------
  const loadDone = useCallback(
    async (page: number) => {
      if (doneLoading) return;
      setDoneLoading(true);
      try {
        const res = await fetchDoneOrders(page, DONE_PAGE_SIZE);
        setOnline(true);
        setDone((prev) => {
          // page 1 = rechargement complet ; sinon on appende en dédupliquant.
          if (page === 1) return res.orders;
          const seen = new Set(prev.map((o) => o.id));
          return [...prev, ...res.orders.filter((o) => !seen.has(o.id))];
        });
        setDonePage(page);
        setDoneHasMore(res.hasMore);
      } catch (e) {
        if (e instanceof Error && e.message !== "Session expirée") {
          setOnline(false);
        }
      } finally {
        setDoneLoading(false);
      }
    },
    [doneLoading],
  );

  // Ouverture de l'onglet « Terminées » → (re)charge la première page.
  useEffect(() => {
    if (tab === "done") {
      loadDone(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Sentinelle en bas de liste : charge la page suivante quand elle devient
  // visible (scroll infini, sans dépendance).
  useEffect(() => {
    if (tab !== "done" || !doneHasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !doneLoading) {
          loadDone(donePage + 1);
        }
      },
      { rootMargin: "300px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [tab, doneHasMore, doneLoading, donePage, loadDone]);

  // ---------- Toggle préparé (optimiste, sur les deux listes) ----------
  const patchItem = useCallback(
    (orderId: string, itemId: string, prepared: boolean) => {
      const patch = (list: PrepOrder[]) =>
        list.map((o) =>
          o.id !== orderId
            ? o
            : {
                ...o,
                items: o.items.map((it) =>
                  it.id === itemId ? { ...it, prepared } : it,
                ),
              },
        );
      setTodo(patch);
      setDone(patch);
    },
    [],
  );

  const togglePrepared = useCallback(
    async (orderId: string, itemId: string, next: boolean) => {
      patchItem(orderId, itemId, next);
      try {
        await setItemPrepared(itemId, next);
        // Commande entièrement préparée → elle glissera vers « Terminées » au
        // prochain poll (source de vérité serveur).
      } catch {
        patchItem(orderId, itemId, !next); // rollback
      }
    },
    [patchItem],
  );

  async function enableNotifications() {
    if (typeof Notification === "undefined") return;
    const perm = await Notification.requestPermission();
    setNotifOn(perm === "granted");
    // Débloque aussi l'audio (geste utilisateur requis par les navigateurs).
    beep();
  }

  function logout() {
    logoutSession();
    router.replace("/login");
  }

  const list = tab === "todo" ? todo : done;
  const listLoading = tab === "todo" ? loading : doneLoading && donePage === 0;

  return (
    <>
      <header className="topbar">
        <div className="title">
          {posName}
          <small>IzyMiam!</small>
        </div>
        <span className={`pill ${online ? "" : "offline"}`}>
          <span className="dot" />
          {online ? "En ligne" : "Hors ligne"}
        </span>
        {!notifOn && (
          <button
            className="iconbtn"
            title="Activer les alertes sonores et notifications"
            onClick={enableNotifications}
          >
            🔔
          </button>
        )}
        <button className="iconbtn" title="Se déconnecter" onClick={logout}>
          ⏻
        </button>
      </header>

      <main className="container">
        {!online && (
          <div className="error-banner">
            Réseau indisponible — nouvelle tentative automatique…
          </div>
        )}

        <div className="tabs">
          <button
            className={`tab ${tab === "todo" ? "active" : ""}`}
            onClick={() => setTab("todo")}
          >
            À préparer
            {todo.length > 0 && <span className="count">{todo.length}</span>}
          </button>
          <button
            className={`tab ${tab === "done" ? "active" : ""}`}
            onClick={() => setTab("done")}
          >
            Terminées
          </button>
        </div>

        {listLoading ? (
          <div className="empty">Chargement…</div>
        ) : list.length === 0 ? (
          <div className="empty">
            <div className="big">{tab === "todo" ? "✅" : "📦"}</div>
            {tab === "todo"
              ? "Aucune commande à préparer. Les nouvelles commandes apparaissent automatiquement."
              : "Aucune commande terminée pour le moment."}
          </div>
        ) : (
          <>
            {list.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                onToggleItem={togglePrepared}
              />
            ))}
            {tab === "done" && doneHasMore && (
              <div ref={sentinelRef} className="empty" style={{ padding: 16 }}>
                {doneLoading ? "Chargement…" : "…"}
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
