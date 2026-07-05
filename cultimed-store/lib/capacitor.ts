"use client";

import { Capacitor } from "@capacitor/core";

/**
 * true solo cuando el codigo corre DENTRO del shell nativo (iOS/Android
 * empaquetado con Capacitor) -- false en el navegador normal, incluyendo
 * el mismo sitio abierto desde Safari/Chrome en el celular.
 */
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  return Capacitor.isNativePlatform();
}
