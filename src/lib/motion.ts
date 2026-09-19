import type { Transition, Variants } from "framer-motion";

export const easeOut: Transition = {
  duration: 0.45,
  ease: [0.22, 1, 0.36, 1],
};

export const staggerContainer: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.07, delayChildren: 0.04 },
  },
};

export const fadeUp: Variants = {
  hidden: { opacity: 0.35, y: 18 },
  show: { opacity: 1, y: 0, transition: easeOut },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0.4 },
  show: { opacity: 1, transition: { duration: 0.35 } },
};

export const slideIn: Variants = {
  hidden: { opacity: 0.4, x: -10 },
  show: { opacity: 1, x: 0, transition: easeOut },
};

export const floatY = {
  y: [0, -14, 0],
  transition: { duration: 5.5, repeat: Infinity, ease: "easeInOut" as const },
};

export const floatSlow = {
  y: [0, -10, 0],
  rotate: [0, 1.4, 0],
  transition: { duration: 7, repeat: Infinity, ease: "easeInOut" as const },
};
