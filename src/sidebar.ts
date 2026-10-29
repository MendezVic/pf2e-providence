import { MODULE_ID } from './constants';
import { getSelectedActorIds } from './selected-actors';
import { getSavedRolls, rollProvidence } from './providence';
import { groupSavedRolls, type SavedProvidenceRoll } from './pool';

const { AbstractSidebarTab } = foundry.applications.sidebar;

function localize(key: string): string {
  return game.i18n.localize(`${MODULE_ID}.${key}`);
}

function actorTypeLabel(actor: Actor): string {
  const key = `TYPES.Actor.${actor.type}`;
  const label = game.i18n.localize(key);
  return label === key ? actor.type : label;
}

function createRollBadge(roll: SavedProvidenceRoll): HTMLSpanElement {
  const badge = document.createElement('span');
  badge.className = 'pf2e-providence-value';
  badge.textContent = String(roll.value);
  if (roll.used) badge.classList.add('is-used');
  badge.title = game.i18n.format(`${MODULE_ID}.panel.${roll.used ? 'used' : 'savedBy'}`, { actor: roll.actorName });
  return badge;
}

export class ProvidenceSidebarTab extends AbstractSidebarTab {
  static override tabName = MODULE_ID;

  static override DEFAULT_OPTIONS = {
    id: MODULE_ID,
    classes: ['app', 'tab', 'sidebar-tab', 'directory', 'flexcol', MODULE_ID],
    window: { title: `${MODULE_ID}.sidebar.title`, icon: 'fa-solid fa-dice-d20' },
  };

  protected override async _renderHTML(): Promise<HTMLElement> {
    const root = document.createElement('div');
    root.className = 'pf2e-providence-directory flexcol';

    const header = document.createElement('header');
    header.className = 'directory-header flexcol';
    const summary = document.createElement('p');
    summary.className = 'pf2e-providence-summary';
    summary.textContent = localize('sidebar.description');

    const search = document.createElement('div');
    search.className = 'header-search flexrow';
    const searchIcon = document.createElement('i');
    searchIcon.className = 'fa-solid fa-magnifying-glass';
    searchIcon.ariaHidden = 'true';
    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.autocomplete = 'off';
    searchInput.placeholder = localize('sidebar.search');
    searchInput.ariaLabel = localize('sidebar.search');
    const clearSearch = document.createElement('button');
    clearSearch.type = 'button';
    clearSearch.className = 'inline-control icon fa-solid fa-xmark';
    clearSearch.dataset.tooltip = localize('sidebar.clearSearch');
    clearSearch.ariaLabel = localize('sidebar.clearSearch');
    clearSearch.hidden = true;
    search.append(searchIcon, searchInput, clearSearch);
    header.append(summary, search);

    const list = document.createElement('ol');
    list.className = 'directory-list pf2e-providence-actor-list';
    const rollsByActor = groupSavedRolls(getSavedRolls());
    const selectedActorIds = new Set(getSelectedActorIds());
    const actors = game.actors
      .filter((actor) => selectedActorIds.has(actor.id))
      .sort((left, right) => left.name.localeCompare(right.name, game.i18n.lang));

    if (actors.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'pf2e-providence-empty';
      empty.textContent = localize('sidebar.noActors');
      list.append(empty);
    }

    for (const actor of actors) {
      const actorRolls = rollsByActor.get(actor.uuid) ?? [];
      const row = document.createElement('li');
      row.className = 'directory-item entry document flexrow pf2e-providence-actor';
      row.dataset.entryId = actor.id;
      row.dataset.actorName = actor.name.toLocaleLowerCase(game.i18n.lang);

      const image = document.createElement('img');
      image.className = 'thumbnail';
      image.src = actor.img;
      image.alt = actor.name;
      image.loading = 'lazy';

      const details = document.createElement('div');
      details.className = 'pf2e-providence-actor-details';
      const heading = document.createElement('div');
      heading.className = 'pf2e-providence-actor-heading flexrow';
      const name = document.createElement('a');
      name.className = 'entry-name ellipsis';
      name.textContent = actor.name;
      name.title = actor.name;
      name.addEventListener('click', () => void actor.sheet?.render(true));

      const rollButton = document.createElement('button');
      rollButton.type = 'button';
      rollButton.className = 'pf2e-providence-roll';
      rollButton.ariaLabel = game.i18n.format(`${MODULE_ID}.sidebar.rollFor`, { actor: actor.name });
      const rollIcon = document.createElement('i');
      rollIcon.className = 'fa-solid fa-dice';
      rollIcon.ariaHidden = 'true';
      rollButton.append(rollIcon);
      rollButton.addEventListener('click', () => void rollProvidence(actor).catch(notifyError));
      heading.append(name);

      const type = document.createElement('span');
      type.className = 'pf2e-providence-actor-type';
      type.textContent = actorTypeLabel(actor);

      const values = document.createElement('div');
      values.className = 'pf2e-providence-values';
      if (actorRolls.length > 0) {
        for (const roll of actorRolls) values.append(createRollBadge(roll));
      } else {
        const empty = document.createElement('span');
        empty.className = 'pf2e-providence-no-rolls';
        empty.textContent = localize('panel.noneForActor');
        values.append(empty);
      }

      details.append(heading, type, values);
      row.append(image, details, rollButton);
      list.append(row);
    }

    const filter = (): void => {
      const query = searchInput.value.trim().toLocaleLowerCase(game.i18n.lang);
      clearSearch.hidden = query.length === 0;
      for (const row of list.querySelectorAll<HTMLElement>('.pf2e-providence-actor')) {
        row.hidden = !row.dataset.actorName?.includes(query);
      }
    };
    searchInput.addEventListener('input', filter);
    clearSearch.addEventListener('click', () => {
      searchInput.value = '';
      filter();
      searchInput.focus();
    });

    root.append(header, list);
    return root;
  }

  protected override _replaceHTML(result: HTMLElement, content: HTMLElement): void {
    content.replaceChildren(result);
  }

  /** Keep the tab inside Foundry's sidebar even if another module changes the normal placeholder lifecycle. */
  protected override async _insertElement(element: HTMLElement): Promise<void> {
    if (this.isPopout) return super._insertElement(element);
    const content = ui.sidebar.element.querySelector<HTMLElement>('#sidebar-content');
    if (!content) return super._insertElement(element);
    const existing = content.querySelector<HTMLElement>(`[id="${MODULE_ID}"]`);
    if (existing) existing.replaceWith(element);
    else content.append(element);
    element.classList.toggle('active', ui.sidebar.tabGroups.primary === MODULE_ID);
  }
}

function notifyError(error: unknown): void {
  ui.notifications.error(error instanceof Error ? error.message : String(error));
}

export function registerProvidenceSidebar(): void {
  const configuredUi = CONFIG.ui as typeof CONFIG.ui & Record<string, typeof ProvidenceSidebarTab>;
  configuredUi[MODULE_ID] = ProvidenceSidebarTab;
  const Sidebar = CONFIG.ui.sidebar as unknown as {
    TABS: Record<string, { icon?: string; tooltip?: string; gmOnly?: boolean; documentName?: string }>;
  };
  Sidebar.TABS[MODULE_ID] = { icon: 'fa-solid fa-dice-d20', tooltip: `${MODULE_ID}.sidebar.title` };
}

export function refreshProvidenceSidebar(): void {
  const tab = (ui as typeof ui & Record<string, ProvidenceSidebarTab | undefined>)[MODULE_ID];
  if (tab?.rendered) void tab.render({ force: true });
}

export function registerProvidenceActorRefresh(): void {
  Hooks.on('createActor', refreshProvidenceSidebar);
  Hooks.on('updateActor', refreshProvidenceSidebar);
  Hooks.on('deleteActor', refreshProvidenceSidebar);
}
