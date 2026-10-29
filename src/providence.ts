import { MODULE_ID } from './constants';
import {
  filterSavedRollsByActorUuids,
  sanitizePool,
  takeSavedRoll,
  validateProvidenceValues,
  type SavedProvidenceRoll,
} from './pool';
import { forceD20Result, hasRerollMarker, markReroll } from './reroll';
import { getSelectedActorUuids } from './selected-actors';

const SETTING = 'saved-rolls';
const CHANNEL = `module.${MODULE_ID}`;
const REQUEST_TIMEOUT = 10_000;
const RESERVATION_TIMEOUT = 5 * 60_000;

type RequestAction = 'add' | 'use';
interface SocketRequest {
  kind: 'request';
  requestId: string;
  senderId: string;
  action: RequestAction;
  actorUuid?: string;
  values?: unknown;
  rollId?: string;
  messageId?: string;
}
interface SocketResult {
  kind: 'result' | 'error';
  requestId: string;
  targetId: string;
  rolls?: SavedProvidenceRoll[];
  added?: SavedProvidenceRoll[];
  message?: string;
}
interface Reservation { id: string; roll: SavedProvidenceRoll; messageId: string; senderId: string; timeout: number }
interface OperationResult { rolls: SavedProvidenceRoll[]; added?: SavedProvidenceRoll[] }
interface PendingRequest {
  resolve: (result: OperationResult) => void;
  reject: (error: Error) => void;
  timeout: number;
}
interface ContextOption {
  label: string;
  icon: string;
  visible: (li: HTMLElement) => boolean;
  onClick: (event: PointerEvent, li: HTMLElement) => void;
}

const pending = new Map<string, PendingRequest>();
const reservations = new Map<string, Reservation>();
let mutationQueue: Promise<void> = Promise.resolve();

function localize(key: string): string {
  return game.i18n.localize(`${MODULE_ID}.${key}`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function getSavedRolls(): SavedProvidenceRoll[] {
  return sanitizePool(game.settings.get(MODULE_ID, SETTING));
}

function getUsableSavedRolls(): SavedProvidenceRoll[] {
  return filterSavedRollsByActorUuids(getSavedRolls(), getSelectedActorUuids());
}

function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const result = mutationQueue.then(operation, operation);
  mutationQueue = result.then(() => undefined, () => undefined);
  return result;
}

async function setPool(rolls: SavedProvidenceRoll[]): Promise<SavedProvidenceRoll[]> {
  await game.settings.set(MODULE_ID, SETTING, rolls);
  return rolls;
}

function senderUser(id: string): User {
  const user = game.users.get(id);
  if (!user?.active) throw new Error(localize('error.invalidRequest'));
  return user;
}

async function actorForAdd(uuid: string | undefined, user: User): Promise<Actor> {
  if (!uuid) throw new Error(localize('error.invalidRequest'));
  const document = await fromUuid(uuid);
  if (!document || document.documentName !== 'Actor') throw new Error(localize('error.invalidRequest'));
  const actor = document as Actor;
  if (!user.isGM && !actor.testUserPermission(user, 'OWNER')) throw new Error(localize('error.noPermission'));
  return actor;
}

function isProvidenceRerollable(message: ChatMessage): boolean {
  const check = message as ChatMessage & { isCheckRoll?: boolean };
  const roll = message.rolls[0] as (Roll & { isRerollable?: boolean }) | undefined;
  return Boolean(check.isCheckRoll && roll?.isRerollable);
}

function messageForReservation(id: string | undefined): ChatMessage {
  const message = id ? game.messages.get(id) : null;
  if (!message || !isProvidenceRerollable(message)) throw new Error(localize('error.notCheck'));
  return message;
}

async function handleRequest(request: SocketRequest): Promise<OperationResult> {
  const user = senderUser(request.senderId);
  return serialized(async () => {
    if (request.action === 'add') {
      const actor = await actorForAdd(request.actorUuid, user);
      let values: [number, number];
      try {
        values = validateProvidenceValues(request.values);
      } catch {
        throw new Error(localize('error.invalidRequest'));
      }
      const createdAt = Date.now();
      const additions = values.map((value) => ({
        id: foundry.utils.randomID(), value, actorUuid: actor.uuid, actorName: actor.name, createdAt,
      }));
      return { rolls: await setPool([...getSavedRolls(), ...additions]), added: additions };
    }
    throw new Error(localize('error.invalidRequest'));
  });
}

async function clearReservation(id: string): Promise<void> {
  await serialized(async () => {
    const reservation = reservations.get(id);
    if (!reservation) return;
    window.clearTimeout(reservation.timeout);
    reservations.delete(id);
  });
}

async function useSavedRoll(request: SocketRequest, user: User): Promise<OperationResult> {
  const message = messageForReservation(request.messageId);
  if (!request.rollId) throw new Error(localize('error.invalidRequest'));
  const reservation = await serialized(async () => {
    const roll = getUsableSavedRolls().find((candidate) => candidate.id === request.rollId);
    if (!roll || [...reservations.values()].some((item) => item.roll.id === roll.id)) {
      throw new Error(localize('error.rollUnavailable'));
    }
    if ([...reservations.values()].some((item) => item.messageId === message.id)) {
      throw new Error(localize('error.messageBusy'));
    }
    const id = foundry.utils.randomID();
    const timeout = window.setTimeout(() => void clearReservation(id), RESERVATION_TIMEOUT);
    const created = { id, roll, messageId: message.id, senderId: user.id, timeout };
    reservations.set(id, created);
    return created;
  });

  try {
    await performProvidenceReroll(message, reservation);
    return await serialized(async () => {
      if (reservations.get(reservation.id) !== reservation) throw new Error(localize('error.invalidReservation'));
      let taken: ReturnType<typeof takeSavedRoll>;
      try {
        taken = takeSavedRoll(getSavedRolls(), reservation.roll.id);
      } catch {
        throw new Error(localize('error.rollUnavailable'));
      }
      window.clearTimeout(reservation.timeout);
      reservations.delete(reservation.id);
      return { rolls: await setPool(taken.pool) };
    });
  } catch (error) {
    await clearReservation(reservation.id);
    throw error;
  }
}

async function dispatchRequest(request: SocketRequest): Promise<OperationResult> {
  const user = senderUser(request.senderId);
  return request.action === 'use' ? useSavedRoll(request, user) : handleRequest(request);
}

function requestGm(request: Omit<SocketRequest, 'kind' | 'requestId' | 'senderId'>): Promise<OperationResult> {
  if (!game.users.activeGM) return Promise.reject(new Error(localize('error.noGm')));
  const requestId = foundry.utils.randomID();
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      pending.delete(requestId);
      reject(new Error(localize('error.noGm')));
    }, request.action === 'use' ? RESERVATION_TIMEOUT : REQUEST_TIMEOUT);
    pending.set(requestId, { resolve, reject, timeout });
    game.socket.emit(CHANNEL, { kind: 'request', requestId, senderId: game.user.id, ...request } satisfies SocketRequest);
  });
}

function updatePool(request: Omit<SocketRequest, 'kind' | 'requestId' | 'senderId'>): Promise<OperationResult> {
  const complete = { kind: 'request', requestId: foundry.utils.randomID(), senderId: game.user.id, ...request } satisfies SocketRequest;
  return game.user.isGM && game.users.activeGM?.id === game.user.id ? dispatchRequest(complete) : requestGm(request);
}

export function registerProvidenceSocket(): void {
  game.socket.on(CHANNEL, (message: SocketRequest | SocketResult) => {
    if (message.kind === 'request') {
      if (!game.user.isGM || game.users.activeGM?.id !== game.user.id) return;
      void dispatchRequest(message)
        .then((result) => game.socket.emit(CHANNEL, {
          kind: 'result', requestId: message.requestId, targetId: message.senderId, ...result,
        } satisfies SocketResult))
        .catch((error: unknown) => game.socket.emit(CHANNEL, {
          kind: 'error', requestId: message.requestId, targetId: message.senderId, message: errorMessage(error),
        } satisfies SocketResult));
      return;
    }
    if (message.targetId !== game.user.id) return;
    const request = pending.get(message.requestId);
    if (!request) return;
    window.clearTimeout(request.timeout);
    pending.delete(message.requestId);
    if (message.kind === 'error') request.reject(new Error(message.message ?? localize('error.requestFailed')));
    else request.resolve({ rolls: message.rolls ?? getSavedRolls(), added: message.added });
  });
}

export async function rollProvidence(actor?: Actor | null): Promise<SavedProvidenceRoll[]> {
  const source = actor ?? canvas.tokens.controlled[0]?.actor;
  if (!source) throw new Error(localize('error.noActor'));
  if (!game.user.isGM && !source.testUserPermission(game.user, 'OWNER')) throw new Error(localize('error.noPermission'));
  const roll = await new Roll('2d20').evaluate();
  const values = roll.dice.flatMap((die) => die.results.filter((result) => result.active).map((result) => result.result));
  const result = await updatePool({ action: 'add', actorUuid: source.uuid, values });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: source }),
    content: game.i18n.format(`${MODULE_ID}.chat.roll`, { actor: source.name, results: values.join(', ') }),
  });
  return result.added ?? [];
}

function canUse(message: ChatMessage): boolean {
  return getUsableSavedRolls().length > 0 && isProvidenceRerollable(message);
}

async function chooseRoll(): Promise<SavedProvidenceRoll | null> {
  const saved = getUsableSavedRolls();
  if (saved.length === 0) return null;
  const options = saved.map((roll) => `<option value="${roll.id}">${roll.value} — ${foundry.utils.escapeHTML(roll.actorName)}</option>`).join('');
  const id = await foundry.applications.api.DialogV2.wait({
    window: { title: localize('dialog.title') },
    content: `<p>${localize('dialog.prompt')}</p><select name="roll-id">${options}</select>`,
    buttons: [
      { action: 'cancel', label: `${MODULE_ID}.dialog.cancel` },
      {
        action: 'use', label: `${MODULE_ID}.context.use`, icon: 'fa-solid fa-dice', default: true,
        callback: (_event, button) => (button.form?.elements.namedItem('roll-id') as HTMLSelectElement | null)?.value ?? null,
      },
    ],
    rejectClose: false,
  });
  return saved.find((roll) => roll.id === id) ?? null;
}

async function performProvidenceReroll(message: ChatMessage, reservation: Reservation): Promise<void> {
  let applied = false;
  const preHook = Hooks.on('pf2e.preReroll', (_old: Roll, reroll: Roll) => {
    markReroll(reroll as Roll & { options?: Record<string, unknown> }, reservation.id);
    Hooks.off('pf2e.preReroll', preHook);
  });
  const rerollHook = Hooks.on('pf2e.reroll', (_old: Roll, reroll: Roll) => {
    const marked = reroll as Roll & { options?: Record<string, unknown> };
    if (!hasRerollMarker(marked, reservation.id)) return;
    forceD20Result(reroll as unknown as Parameters<typeof forceD20Result>[0], reservation.roll.value);
    applied = true;
  });

  try {
    await (game.pf2e.Check as unknown as { rerollFromMessage: (target: ChatMessage) => Promise<void> }).rerollFromMessage(message);
    if (!applied) throw new Error(localize('error.rerollFailed'));
  } finally {
    Hooks.off('pf2e.preReroll', preHook);
    Hooks.off('pf2e.reroll', rerollHook);
  }
}

async function useProvidence(message: ChatMessage): Promise<void> {
  if (!canUse(message)) throw new Error(localize('error.notCheck'));
  const selected = await chooseRoll();
  if (!selected) return;
  await updatePool({ action: 'use', rollId: selected.id, messageId: message.id });
}

function messageFromEntry(entry: HTMLElement): ChatMessage | null {
  return game.messages.get(entry.dataset.messageId ?? '') ?? null;
}

export function registerProvidenceContextMenu(): void {
  Hooks.on('getChatMessageContextOptions', (_html: HTMLElement, options: ContextOption[]) => {
    options.push({
      label: localize('context.use'),
      icon: '<i class="fa-solid fa-dice"></i>',
      visible: (entry) => Boolean(messageFromEntry(entry) && canUse(messageFromEntry(entry) as ChatMessage)),
      onClick: (_event, entry) => {
        const message = messageFromEntry(entry);
        if (message) void useProvidence(message).catch((error: unknown) => ui.notifications.error(errorMessage(error)));
      },
    });
  });
}
