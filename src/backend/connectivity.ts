let isOnline = true;

export function getIsOnline(): boolean {
  return isOnline;
}

export function setIsOnline(online: boolean): void {
  isOnline = online;
}
