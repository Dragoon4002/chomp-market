"use client";
// Browser-only state: watchlist + cart (localStorage, synced across components via an event).
import { useEffect, useState } from "react";

const bus = new EventTarget();
function store<T>(key: string, init: T, persist = true) {
  let mem = init;
  const get = (): T => { if (!persist) return mem; try { return JSON.parse(localStorage.getItem(key) ?? "") as T; } catch { return init; } };
  const set = (v: T) => { mem = v; if (persist) localStorage.setItem(key, JSON.stringify(v)); bus.dispatchEvent(new Event(key)); };
  const useValue = () => {
    const [v, setV] = useState<T>(get);
    useEffect(() => { const on = () => setV(get()); bus.addEventListener(key, on); addEventListener("storage", on); return () => { bus.removeEventListener(key, on); removeEventListener("storage", on); }; }, []);
    return v;
  };
  return { get, set, useValue };
}

// watch keys: "skill:3", "monster:104", "collection:1"
export const watch = store<string[]>("chomp.watch", []);
export const toggleWatch = (k: string) => { const w = watch.get(); watch.set(w.includes(k) ? w.filter((x) => x !== k) : [...w, k]); };

// cart lines: a skill listing (seller+skill, qty) or a listed monster
export type CartLine = { kind: "skill"; seller: string; skill: number; qty: number; price_each: string; name: string } | { kind: "monster"; token_id: string; price: string; name: string };
export const cartKey = (l: CartLine) => (l.kind === "skill" ? `s:${l.seller}:${l.skill}` : `m:${l.token_id}`);
export const cart = store<CartLine[]>("chomp.cart", []);
export const addToCart = (l: CartLine) => cart.set([...cart.get().filter((x) => cartKey(x) !== cartKey(l)), l]);
export const removeFromCart = (k: string) => cart.set(cart.get().filter((x) => cartKey(x) !== k));
export const cartOpen = store<boolean>("chomp.cartOpen", false, false);
