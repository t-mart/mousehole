import { logger } from "./logger.ts";

let isOnline = true;

export function getIsOnline(): boolean {
  return isOnline;
}

export function setIsOnline(online: boolean): void {
  if (online === isOnline) return;
  isOnline = online;
  if (online) {
    logger.info("Connectivity to MAM restored.");
  } else {
    logger.error("Connectivity to MAM lost. Check that the network interface is up.");
  }
}