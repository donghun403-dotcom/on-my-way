import { GuestPlanDraftObject } from "./guest-plan-draft-object.mjs";

export class MemoryDurableObjectStorage {
  constructor() {
    this.values = new Map();
    this.alarmAt = null;
    this.queue = Promise.resolve();
  }

  async get(key) {
    return structuredClone(this.values.get(key));
  }

  async put(key, value) {
    this.values.set(key, structuredClone(value));
  }

  async delete(key) {
    this.values.delete(key);
  }

  async deleteAll() {
    this.values.clear();
    this.alarmAt = null;
  }

  async setAlarm(timestamp) {
    this.alarmAt = Number(timestamp);
  }

  transaction(operation) {
    const run = this.queue.then(() => operation(this));
    this.queue = run.catch(() => {});
    return run;
  }
}

export function memoryDurableObjectNamespace() {
  const storages = new Map();
  const objects = new Map();
  function storageFor(id) {
    if (!storages.has(id)) storages.set(id, new MemoryDurableObjectStorage());
    return storages.get(id);
  }
  return {
    storages,
    idFromName(name) { return String(name); },
    get(id) {
      if (!objects.has(id)) {
        const storage = storageFor(id);
        objects.set(id, new GuestPlanDraftObject({ storage }, {}));
      }
      const object = objects.get(id);
      return { fetch: (request) => object.fetch(request) };
    },
    newIsolate(id) {
      const storage = storageFor(id);
      const object = new GuestPlanDraftObject({ storage }, {});
      return { object, stub: { fetch: (request) => object.fetch(request) }, storage };
    },
  };
}

export function durableCommand(stub, command, body) {
  return stub.fetch(new Request(`https://guest-plan-draft.internal/${command}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}
