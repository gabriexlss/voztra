import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
/** Combina variantes visuais e resolve conflitos de classes Tailwind. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
