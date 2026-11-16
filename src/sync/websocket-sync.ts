import {
  encodeWsClientMessage,
  parseWsServerMessage,
  WS_SYNC_PROTOCOL,
  type WsClientMessage,
  type WsServerMessage,
} from '../../shared/contracts/ws-sync';
import type { LearnEvent } from './events';
import { retryDelay } from './event-sender/request';

const OPEN = 1;
const MAX_EVENT_BATCH = 50;
const MAX_RECONNECT_FAILURES = 3;

export type WebSocketLike = {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: string | ArrayBuffer }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
};

export type WebSocketSyncOptions = {
  apiOrigin: string;
  token: string;
  deviceId: string;
  epoch: string;
  cursor: number;
  stateRevision: number;
  appSha: string;
  fetcher?: typeof fetch;
  socketFactory?: (url: string) => WebSocketLike;
  random?: () => number;
  scheduleTimeout?: typeof setTimeout;
  cancelTimeout?: typeof clearTimeout;
  onEvents?: (events: Array<{ seq: number; event: LearnEvent }>) => void;
  onAck?: (eventIds: string[], seq: number) => void;
  onStateChanged?: (message: Extract<WsServerMessage, { type: 'state.changed' }>) => void;
  onConflict?: (message: Extract<WsServerMessage, { type: 'state.conflict' }>) => void;
  onReset?: (message: Extract<WsServerMessage, { type: 'reset' }>) => void;
  onFallback?: (reason: string) => void;
  onStatus?: (status: WebSocketSyncStatus) => void;
};

export type WebSocketSyncStatus = 'idle' | 'ticketing' | 'connecting' | 'ready' | 'reconnecting' | 'fallback' | 'closed';

type PendingState = { key: string; value: string | null; baseRevision: number };

export function websocketOrigin(apiOrigin: string): string {
  const url = new URL(apiOrigin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString().replace(/\/$/, '');
}

export class WebSocketSyncClient {
  private readonly fetcher: typeof fetch;
  private readonly socketFactory: (url: string) => WebSocketLike;
  private readonly random: () => number;
  private readonly scheduleTimeout: typeof setTimeout;
  private readonly cancelTimeout: typeof clearTimeout;
  private readonly pendingEvents: LearnEvent[] = [];
  private readonly pendingStates = new Map<string, PendingState>();
  private socket?: WebSocketLike;
  private status: WebSocketSyncStatus = 'idle';
  private connectionFlight?: Promise<void>;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private retryFailures = 0;
  private intentionallyClosed = false;
  private welcomed = false;
  private cursor: number;
  private stateRevision: number;

  constructor(private readonly options: WebSocketSyncOptions) {
    this.fetcher = options.fetcher ?? fetch.bind(globalThis);
    this.socketFactory = options.socketFactory ?? ((url) => new WebSocket(url) as unknown as WebSocketLike);
    this.random = options.random ?? Math.random;
    this.scheduleTimeout = options.scheduleTimeout ?? globalThis.setTimeout.bind(globalThis);
    this.cancelTimeout = options.cancelTimeout ?? globalThis.clearTimeout.bind(globalThis);
    this.cursor = options.cursor;
    this.stateRevision = options.stateRevision;
  }

  getStatus(): WebSocketSyncStatus {
    return this.status;
  }

  getCursor(): number {
    return this.cursor;
  }

  async connect(): Promise<void> {
    if (this.status === 'ready' || this.status === 'connecting' || this.status === 'ticketing') {
      if (this.connectionFlight) return this.connectionFlight;
      return;
    }
    if (this.status === 'closed') throw new Error('websocket_client_closed');
    this.intentionallyClosed = false;
    this.connectionFlight = this.connectOnce();
    try {
      await this.connectionFlight;
    } finally {
      this.connectionFlight = undefined;
    }
  }

  close(): void {
    this.intentionallyClosed = true;
    if (this.retryTimer) this.cancelTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.socket?.close(1000, 'client_closed');
    this.socket = undefined;
    this.welcomed = false;
    this.setStatus('closed');
  }

  queueEvents(events: LearnEvent[]): void {
    for (const event of events) this.pendingEvents.push(event);
    this.flushQueues();
  }

  putState(key: string, value: string | null, baseRevision: number): void {
    this.pendingStates.set(key, { key, value, baseRevision });
    this.flushQueues();
  }

  ping(): boolean {
    return this.send({ protocol: WS_SYNC_PROTOCOL, type: 'ping' });
  }

  private setStatus(status: WebSocketSyncStatus): void {
    this.status = status;
    this.options.onStatus?.(status);
  }

  private async requestTicket(): Promise<{ ticket: string; expiresAt: number }> {
    this.setStatus('ticketing');
    const response = await this.fetcher(`${this.options.apiOrigin.replace(/\/$/, '')}/ws/ticket`, {
      method: 'POST',
      cache: 'no-store',
      headers: { Authorization: `Bearer ${this.options.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: this.options.deviceId }),
    });
    const value: unknown = await response.json().catch(() => null);
    if (!response.ok || !value || typeof value !== 'object') throw new Error(`websocket_ticket_http_${response.status}`);
    const ticket = (value as { ticket?: unknown }).ticket;
    const expiresAt = (value as { expiresAt?: unknown }).expiresAt;
    if (typeof ticket !== 'string' || !Number.isSafeInteger(expiresAt) || Number(expiresAt) <= Date.now())
      throw new Error('websocket_ticket_invalid');
    return { ticket, expiresAt: Number(expiresAt) };
  }

  private async connectOnce(): Promise<void> {
    try {
      const ticket = await this.requestTicket();
      const url = new URL(`${websocketOrigin(this.options.apiOrigin)}/ws`);
      url.searchParams.set('ticket', ticket.ticket);
      url.searchParams.set('device', this.options.deviceId);
      this.setStatus('connecting');
      const socket = this.socketFactory(url.toString());
      this.socket = socket;
      this.welcomed = false;
      await new Promise<void>((resolve, reject) => {
        let opened = false;
        socket.onopen = () => {
          opened = true;
          this.sendHello();
          resolve();
        };
        socket.onmessage = (event) => this.receive(event.data);
        socket.onerror = () => {
          if (!opened) reject(new Error('websocket_connection_failed'));
        };
        socket.onclose = () => {
          if (!opened) reject(new Error('websocket_closed_before_open'));
          else this.handleClose();
        };
      });
    } catch (error) {
      this.handleConnectionFailure(error instanceof Error ? error.message : 'websocket_connection_failed');
      throw error;
    }
  }

  private sendHello(): void {
    this.send(
      {
        protocol: WS_SYNC_PROTOCOL,
        type: 'hello',
        deviceId: this.options.deviceId,
        epoch: this.options.epoch,
        cursor: this.cursor,
        stateRevision: this.stateRevision,
        appSha: this.options.appSha,
      },
      true,
    );
  }

  private receive(value: string | ArrayBuffer): void {
    const message = parseWsServerMessage(value);
    if (!message) return;
    if (message.type === 'welcome') {
      this.cursor = Math.max(this.cursor, message.serverCursor);
      this.welcomed = message.resetStatus === 'ready';
      this.retryFailures = 0;
      this.setStatus(this.welcomed ? 'ready' : 'reconnecting');
      if (this.welcomed) this.flushQueues();
      return;
    }
    if (message.type === 'events') {
      this.cursor = Math.max(this.cursor, message.to);
      this.options.onEvents?.(message.events);
      return;
    }
    if (message.type === 'ack') {
      this.cursor = Math.max(this.cursor, message.seq);
      this.options.onAck?.(message.eventIds, message.seq);
      return;
    }
    if (message.type === 'state.changed') {
      this.stateRevision = Math.max(this.stateRevision, message.revision);
      this.options.onStateChanged?.(message);
      return;
    }
    if (message.type === 'state.conflict') {
      this.options.onConflict?.(message);
      return;
    }
    if (message.type === 'reset') {
      this.options.onReset?.(message);
      this.socket?.close(4409, 'reset_required');
      return;
    }
    if (message.type === 'error' && !message.retryable) {
      this.options.onFallback?.(message.code);
      this.close();
    }
  }

  private send(message: WsClientMessage, allowBeforeWelcome = false): boolean {
    if (!this.socket || (!allowBeforeWelcome && !this.welcomed) || this.socket.readyState !== OPEN) return false;
    try {
      this.socket.send(encodeWsClientMessage(message));
      return true;
    } catch {
      this.socket.close(1011, 'send_failed');
      return false;
    }
  }

  private flushQueues(): void {
    if (!this.socket || !this.welcomed || this.socket.readyState !== OPEN) return;
    while (this.pendingEvents.length) {
      const batch = this.pendingEvents.splice(0, MAX_EVENT_BATCH);
      if (!this.send({ protocol: WS_SYNC_PROTOCOL, type: 'events.push', events: batch })) {
        this.pendingEvents.unshift(...batch);
        return;
      }
    }
    for (const [key, state] of this.pendingStates) {
      if (!this.send({ protocol: WS_SYNC_PROTOCOL, type: 'state.put', ...state })) return;
      this.pendingStates.delete(key);
    }
  }

  private handleClose(): void {
    this.socket = undefined;
    this.welcomed = false;
    if (this.intentionallyClosed || this.status === 'closed') return;
    this.handleConnectionFailure('websocket_closed');
  }

  private handleConnectionFailure(reason: string): void {
    if (this.intentionallyClosed) return;
    this.retryFailures += 1;
    if (this.retryFailures >= MAX_RECONNECT_FAILURES) {
      this.setStatus('fallback');
      this.options.onFallback?.(reason);
      return;
    }
    this.setStatus('reconnecting');
    const delay = retryDelay(this.retryFailures, this.random);
    this.retryTimer = this.scheduleTimeout(() => {
      this.retryTimer = undefined;
      void this.connect().catch(() => undefined);
    }, delay);
  }
}
