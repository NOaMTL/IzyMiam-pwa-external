"use client";

/**
 * Client API de la PWA « point de préparation » — parle directement à l'API
 * NEST (endpoints externalpos-app/*, scopés côté serveur : chaque point ne
 * voit QUE les articles qui le concernent).
 */

const API =
  (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "") ||
  "http://localhost:3000";

const TOKEN_KEY = "prep_token";
const USER_KEY = "prep_user";

export interface PrepUser {
  id?: string;
  name?: string | null;
  email?: string;
  externalPOS?: { id: string; name: string } | null;
  [k: string]: unknown;
}

export interface OrderVariation {
  variationName: string;
  optionName: string;
  optionPrice: number;
}

export interface OrderItem {
  id: string;
  quantity: number;
  unitPrice: number;
  total: number;
  prepared: boolean;
  itemNotes?: string | null;
  product: {
    id: string;
    name: string;
    description?: string | null;
    category?: { id: string; name: string } | null;
  } | null;
  variations: OrderVariation[];
}

export interface PrepOrder {
  id: string;
  orderNumber: string;
  orderReference: string | null;
  status: string;
  isPreorder?: boolean;
  pickupDate?: string | null;
  total: number;
  createdAt: string;
  updatedAt: string;
  customerName: string;
  customerPhone?: string | null;
  deliveryMethod?: { id: string; name: string; type: string } | null;
  pickupPoint?: { id: string; name: string } | null;
  notes?: string | null;
  items: OrderItem[];
}

// ==================== Session ====================

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): PrepUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as PrepUser) : null;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

function onUnauthorized(): void {
  clearSession();
  if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
    window.location.href = "/login?expired=1";
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch {
    // Échec AVANT toute réponse HTTP : API injoignable, coupure réseau, ou
    // origine non autorisée (CORS). Message actionnable plutôt qu'un
    // « Failed to fetch » brut.
    throw new Error(
      `API injoignable (${API}). Vérifie le réseau, NEXT_PUBLIC_API_URL et que cette origine est autorisée en CORS côté NEST.`,
    );
  }
  if (res.status === 401) {
    onUnauthorized();
    throw new Error("Session expirée");
  }
  const body = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    data?: T;
    error?: string;
    [k: string]: unknown;
  };
  if (!res.ok || body.success === false) {
    throw new Error(body.error || `Erreur ${res.status}`);
  }
  return body as unknown as T & { data?: T };
}

/** Extrait `data` de la réponse enveloppée { success, data }. */
async function requestData<T>(path: string, init: RequestInit = {}): Promise<T> {
  const body = await request<{ data?: T }>(path, init);
  return (body.data ?? (body as unknown)) as T;
}

// ==================== Auth ====================

export async function login(
  email: string,
  password: string,
): Promise<PrepUser> {
  const data = await requestData<{ token: string; user: PrepUser }>(
    "/externalpos-app/auth/login",
    {
      method: "POST",
      body: JSON.stringify({ email, password }),
    },
  );
  localStorage.setItem(TOKEN_KEY, data.token);
  localStorage.setItem(USER_KEY, JSON.stringify(data.user ?? {}));
  return data.user;
}

// ==================== Commandes ====================

/** Commandes À PRÉPARER (bornées : statut actif + articles non préparés). */
export async function fetchTodoOrders(): Promise<PrepOrder[]> {
  const data = await requestData<PrepOrder[]>(
    "/externalpos-app/orders?scope=todo&limit=100",
  );
  return Array.isArray(data) ? data : [];
}

/** Commandes TERMINÉES, paginées (lazyload de l'historique). */
export async function fetchDoneOrders(
  page: number,
  limit = 20,
): Promise<{ orders: PrepOrder[]; hasMore: boolean }> {
  const body = await request<{
    data?: PrepOrder[];
    hasMore?: boolean;
  }>(`/externalpos-app/orders?scope=done&page=${page}&limit=${limit}`);
  return {
    orders: Array.isArray(body.data) ? body.data : [],
    hasMore: body.hasMore === true,
  };
}

export async function setItemPrepared(
  itemId: string,
  isPrepared: boolean,
): Promise<void> {
  await request(`/externalpos-app/orders/items/${encodeURIComponent(itemId)}/prepared`, {
    method: "PATCH",
    body: JSON.stringify({ isPrepared }),
  });
}
