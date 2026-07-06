"use client";

import { useLayoutEffect, useEffect, useRef, type ElementType, type ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
  as?: ElementType;
  /** true = anima cada hijo directo con stagger; string = selector CSS de los hijos a animar */
  stagger?: boolean | string;
  delay?: number;
  y?: number;
}

/**
 * Revela contenido con fade+slide al entrar en viewport (scroll). Se anima
 * una sola vez (once) y respeta prefers-reduced-motion mostrando el
 * contenido en su estado final sin animar.
 */
export default function ScrollReveal({
  children,
  className,
  as: Tag = "div",
  stagger,
  delay = 0,
  y = 32,
}: ScrollRevealProps) {
  const ref = useRef<HTMLElement>(null);

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const targets: Element | Element[] =
      stagger === true
        ? Array.from(el.children)
        : typeof stagger === "string"
        ? Array.from(el.querySelectorAll(stagger))
        : el;

    gsap.set(targets, { opacity: 0, y });

    const trigger = ScrollTrigger.create({
      trigger: el,
      start: "top 85%",
      once: true,
      onEnter: () => {
        gsap.to(targets, {
          opacity: 1,
          y: 0,
          duration: 0.9,
          delay,
          ease: "power3.out",
          stagger: stagger ? 0.1 : 0,
        });
      },
    });

    return () => trigger.kill();
  }, [stagger, delay, y]);

  const Component = Tag as ElementType;
  return (
    <Component ref={ref} className={className}>
      {children}
    </Component>
  );
}
