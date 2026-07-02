import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function formatPrice(price, decimals = 2) {
  if (price === null || price === undefined) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(price);
}

export function formatNumber(num, decimals = 2) {
  if (num === null || num === undefined) return '-';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

export function formatPercent(num, decimals = 2) {
  if (num === null || num === undefined) return '-';
  const sign = num >= 0 ? '+' : '';
  return `${sign}${num.toFixed(decimals)}%`;
}

export function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getPriceChangeColor(change) {
  if (change > 0) return 'text-green-500';
  if (change < 0) return 'text-red-500';
  return 'text-zinc-400';
}

export function getBackgroundChangeColor(change) {
  if (change > 0) return 'bg-green-500/10';
  if (change < 0) return 'bg-red-500/10';
  return 'bg-zinc-500/10';
}
