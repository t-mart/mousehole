export class Mutex {
  private lock: Promise<void> = Promise.resolve();

  async acquire(): Promise<() => void> {
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const previous = this.lock;
    this.lock = previous.then(() => next);
    await previous;
    return release;
  }
}
