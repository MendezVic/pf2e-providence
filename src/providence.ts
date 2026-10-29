import { MODULE_ID } from './constants';

const SETTING = 'saved-rolls';
const CHANNEL = `module.${MODULE_ID}`;

export interface SavedProvidenceRoll { id: string; value: number; actorUuid: string; actorName: string; createdAt: number }
type Request = { kind: 'request'; requestId: string; senderId: string; action: 'add' | 'consume'; rolls?: SavedProvidenceRoll[]; rollId?: string };
type Result = { kind: 'result' | 'error'; requestId: string; targetId: string; rolls?: SavedProvidenceRoll[]; message?: string };
type ContextOption = { name: string; icon: string; condition: (li: HTMLElement) => boolean; callback: (event: Event, li: HTMLElement) => void };
const pending = new Map<string, { resolve: (rolls: SavedProvidenceRoll[]) => void; reject: (error: Error) => void; timeout: number }>();

export function getSavedRolls(): SavedProvidenceRoll[] {
  const value = game.settings.get(MODULE_ID, SETTING);
  return Array.isArray(value) ? value as SavedProvidenceRoll[] : [];
}

async function mutate(action: Request['action'], rolls?: SavedProvidenceRoll[], rollId?: string): Promise<SavedProvidenceRoll[]> {
  const current = getSavedRolls();
  const next = action === 'add' ? [...current, ...(rolls ?? [])] : current.filter((roll) => roll.id !== rollId);
  if (action === 'consume' && next.length === current.length) throw new Error('That Providence roll is no longer available.');
  await game.settings.set(MODULE_ID, SETTING, next);
  return next;
}

function requestGm(action: Request['action'], rolls?: SavedProvidenceRoll[], rollId?: string): Promise<SavedProvidenceRoll[]> {
  if (!game.users.activeGM) return Promise.reject(new Error(game.i18n.localize(`${MODULE_ID}.error.noGm`)));
  const requestId = foundry.utils.randomID();
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => { pending.delete(requestId); reject(new Error(game.i18n.localize(`${MODULE_ID}.error.noGm`))); }, 10_000);
    pending.set(requestId, { resolve, reject, timeout });
    game.socket.emit(CHANNEL, { kind: 'request', requestId, senderId: game.user.id, action, rolls, rollId } satisfies Request);
  });
}

async function updatePool(action: Request['action'], rolls?: SavedProvidenceRoll[], rollId?: string): Promise<SavedProvidenceRoll[]> {
  return game.user.isGM ? mutate(action, rolls, rollId) : requestGm(action, rolls, rollId);
}

export function registerProvidenceSocket(): void {
  game.socket.on(CHANNEL, (message: Request | Result) => {
    if (message.kind === 'request') {
      if (!game.user.isGM || game.users.activeGM?.id !== game.user.id) return;
      void mutate(message.action, message.rolls, message.rollId)
        .then((rolls) => game.socket.emit(CHANNEL, { kind: 'result', requestId: message.requestId, targetId: message.senderId, rolls } satisfies Result))
        .catch((error: unknown) => game.socket.emit(CHANNEL, { kind: 'error', requestId: message.requestId, targetId: message.senderId, message: error instanceof Error ? error.message : String(error) } satisfies Result));
      return;
    }
    if (message.targetId !== game.user.id) return;
    const request = pending.get(message.requestId);
    if (!request) return;
    window.clearTimeout(request.timeout); pending.delete(message.requestId);
    if (message.kind === 'error') request.reject(new Error(message.message ?? 'Providence request failed.'));
    else request.resolve(message.rolls ?? getSavedRolls());
  });
}

export async function rollProvidence(actor?: Actor | null): Promise<SavedProvidenceRoll[]> {
  const source = actor ?? canvas.tokens.controlled[0]?.actor;
  if (!source) throw new Error(game.i18n.localize(`${MODULE_ID}.error.noActor`));
  const roll = await new Roll('2d20').evaluate();
  const values = roll.dice.flatMap((die) => die.results.filter((result) => result.active).map((result) => result.result));
  const createdAt = Date.now();
  const saved = values.map((value) => ({ id: foundry.utils.randomID(), value, actorUuid: source.uuid, actorName: source.name, createdAt }));
  await updatePool('add', saved);
  await ChatMessage.create({ content: game.i18n.format(`${MODULE_ID}.chat.roll`, { actor: source.name, results: values.join(', ') }) });
  return saved;
}

function poolHtml(): string {
  const rolls = getSavedRolls();
  if (!rolls.length) return `<p>${game.i18n.localize(`${MODULE_ID}.panel.empty`)}</p>`;
  const groups = new Map<string, SavedProvidenceRoll[]>();
  for (const roll of rolls) {
    const key = `${roll.actorUuid}:${roll.actorName}`;
    groups.set(key, [...(groups.get(key) ?? []), roll]);
  }
  return [...groups.values()].map((actorRolls) => {
    const actorName = foundry.utils.escapeHTML(actorRolls[0].actorName);
    const values = actorRolls.map((roll) => `<span class="pf2e-providence-value">${roll.value}</span>`).join('');
    return `<section class="pf2e-providence-actor"><h3>${actorName}</h3><div>${values}</div></section>`;
  }).join('');
}

function actorOptions(): string {
  return game.actors.filter((actor) => actor.testUserPermission(game.user, 'OWNER')).map((actor) =>
    `<option value="${actor.id}">${foundry.utils.escapeHTML(actor.name)}</option>`,
  ).join('');
}

function sidebarHtml(): string {
  return `<div class="pf2e-providence-sidebar">
    <p>${game.i18n.localize(`${MODULE_ID}.sidebar.description`)}</p>
    <label>${game.i18n.localize(`${MODULE_ID}.sidebar.actor`)}</label>
    <select data-providence-actor>${actorOptions()}</select>
    <button type="button" data-providence-roll><i class="fa-solid fa-dice-d20"></i> ${game.i18n.localize(`${MODULE_ID}.sidebar.roll`)}</button>
    <hr><h3>${game.i18n.localize(`${MODULE_ID}.sidebar.pool`)}</h3>
    <div class="pf2e-providence-pool">${poolHtml()}</div>
  </div>`;
}

function refreshSidebar(panel: HTMLElement): void {
  panel.innerHTML = sidebarHtml();
  const rollButton = panel.querySelector<HTMLButtonElement>('[data-providence-roll]');
  rollButton?.addEventListener('click', () => {
    const id = panel.querySelector<HTMLSelectElement>('[data-providence-actor]')?.value;
    const actor = id ? game.actors.get(id) : null;
    if (!actor) return ui.notifications.warn(game.i18n.localize(`${MODULE_ID}.error.noActor`));
    void rollProvidence(actor).then(() => refreshSidebar(panel)).catch((error: unknown) => ui.notifications.error(error instanceof Error ? error.message : String(error)));
  });
}

function canUse(message: ChatMessage): boolean {
  const check = message as ChatMessage & { isCheckRoll?: boolean; isRerollable?: boolean };
  return Boolean(getSavedRolls().length && check.isCheckRoll && check.isRerollable && (message.isAuthor || game.user.isGM));
}

async function choose(): Promise<SavedProvidenceRoll | null> {
  const saved = getSavedRolls();
  const options = saved.map((roll) => `<option value="${roll.id}">${roll.value} — ${foundry.utils.escapeHTML(roll.actorName)}</option>`).join('');
  const id = await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize(`${MODULE_ID}.dialog.title`) },
    content: `<p>${game.i18n.localize(`${MODULE_ID}.dialog.prompt`)}</p><select name="roll-id">${options}</select>`,
    buttons: [{ action: 'use', label: game.i18n.localize(`${MODULE_ID}.context.use`), default: true, callback: (_event, button) => (button.form?.elements.namedItem('roll-id') as HTMLSelectElement | null)?.value ?? null }, { action: 'cancel', label: 'Cancel' }],
  });
  return saved.find((roll) => roll.id === id) ?? null;
}

function forceD20(roll: Roll, value: number): void {
  const die = roll.dice.find((candidate) => candidate.faces === 20);
  const result = die?.results.find((candidate) => candidate.active);
  if (!die || !result) throw new Error('The reroll did not contain an active d20.');
  const delta = value - result.result;
  result.result = value;
  (die as unknown as { _total: number })._total += delta;
  (roll as unknown as { _total: number })._total += delta;
}

async function use(message: ChatMessage): Promise<void> {
  if (!canUse(message)) throw new Error(game.i18n.localize(`${MODULE_ID}.error.notCheck`));
  const saved = await choose();
  if (!saved) return;
  await updatePool('consume', undefined, saved.id);
  Hooks.once('pf2e.reroll', (_old: Roll, reroll: Roll) => forceD20(reroll, saved.value));
  await (game.pf2e.Check as unknown as { rerollFromMessage: (message: ChatMessage) => Promise<void> }).rerollFromMessage(message);
}

export function registerProvidenceContextMenu(): void {
  libWrapper.register(MODULE_ID, 'CONFIG.ui.chat.prototype._getEntryContextOptions', function (this: unknown, wrapped: () => ContextOption[]) {
    const options = wrapped.call(this);
    options.push({ name: `${MODULE_ID}.use`, icon: '<i class="fa-solid fa-dice-d20"></i>', condition: (li: HTMLElement) => {
      const message = game.messages.get(li.dataset.messageId ?? ''); return Boolean(message && canUse(message));
    }, callback: (_event: Event, li: HTMLElement) => {
      const message = game.messages.get(li.dataset.messageId ?? ''); if (message) void use(message).catch((error: unknown) => ui.notifications.error(error instanceof Error ? error.message : String(error)));
    } });
    return options;
  }, 'WRAPPER');
}

/** Adds an independent Providence tab to Foundry's right sidebar. */
export function registerProvidenceSidebar(): void {
  const mount = (): void => {
    const sidebar = ui.sidebar.element;
    const nav = sidebar.querySelector<HTMLElement>('.tabs');
    const content = sidebar.querySelector<HTMLElement>('.sidebar-tabs') ?? sidebar;
    if (!nav || sidebar.querySelector(`[data-tab="${MODULE_ID}"]`)) return;

    const tab = document.createElement('a');
    tab.className = 'item'; tab.dataset.tab = MODULE_ID;
    tab.dataset.tooltip = game.i18n.localize(`${MODULE_ID}.sidebar.title`);
    tab.innerHTML = '<i class="fa-solid fa-dice-d20"></i>';

    const panel = document.createElement('section');
    panel.className = 'tab sidebar-tab'; panel.dataset.tab = MODULE_ID; panel.hidden = true;
    refreshSidebar(panel);
    tab.addEventListener('click', () => {
      for (const active of nav.querySelectorAll('.active')) active.classList.remove('active');
      for (const other of content.querySelectorAll<HTMLElement>('section[data-tab]')) other.hidden = true;
      tab.classList.add('active'); panel.hidden = false; refreshSidebar(panel);
    });
    for (const existing of nav.querySelectorAll<HTMLElement>('[data-tab]')) {
      existing.addEventListener('click', () => { panel.hidden = true; });
    }
    nav.append(tab); content.append(panel);
  };
  mount();
  Hooks.on('renderSidebar', mount);
}
