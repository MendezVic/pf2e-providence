import { MODULE_ID } from './constants';
import { getSavedRolls, rollProvidence } from './providence';
import { groupSavedRolls } from './pool';

const { AbstractSidebarTab } = foundry.applications.sidebar;

function localize(key: string): string {
  return game.i18n.localize(`${MODULE_ID}.${key}`);
}

export class ProvidenceSidebarTab extends AbstractSidebarTab {
  static override tabName = MODULE_ID;

  static override DEFAULT_OPTIONS = {
    id: MODULE_ID,
    classes: [MODULE_ID],
    window: { title: `${MODULE_ID}.sidebar.title`, icon: 'fa-solid fa-dice-d20' },
  };

  protected override async _renderHTML(): Promise<HTMLElement> {
    const root = document.createElement('div');
    root.className = 'pf2e-providence-sidebar';

    const description = document.createElement('p');
    description.textContent = localize('sidebar.description');

    const label = document.createElement('label');
    label.textContent = localize('sidebar.actor');

    const select = document.createElement('select');
    select.ariaLabel = localize('sidebar.actor');
    const actors = game.actors.filter((actor) => game.user.isGM || actor.testUserPermission(game.user, 'OWNER'));
    for (const actor of actors) {
      const option = document.createElement('option');
      option.value = actor.id;
      option.textContent = actor.name;
      select.append(option);
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.innerHTML = `<i class="fa-solid fa-dice-d20" aria-hidden="true"></i> ${localize('sidebar.roll')}`;
    button.disabled = actors.length === 0;
    button.addEventListener('click', () => {
      const actor = game.actors.get(select.value);
      void rollProvidence(actor).catch(notifyError);
    });

    const heading = document.createElement('h3');
    heading.textContent = localize('sidebar.pool');
    const pool = document.createElement('div');
    pool.className = 'pf2e-providence-pool';
    const groups = groupSavedRolls(getSavedRolls());
    if (groups.size === 0) {
      const empty = document.createElement('p');
      empty.className = 'pf2e-providence-empty';
      empty.textContent = localize('panel.empty');
      pool.append(empty);
    } else {
      for (const rolls of groups.values()) {
        const section = document.createElement('section');
        section.className = 'pf2e-providence-actor';
        const name = document.createElement('h4');
        name.textContent = rolls[0].actorName;
        const values = document.createElement('div');
        values.className = 'pf2e-providence-values';
        for (const roll of rolls) {
          const value = document.createElement('span');
          value.className = 'pf2e-providence-value';
          value.textContent = String(roll.value);
          value.title = game.i18n.format(`${MODULE_ID}.panel.savedBy`, { actor: roll.actorName });
          values.append(value);
        }
        section.append(name, values);
        pool.append(section);
      }
    }

    const divider = document.createElement('hr');
    root.append(description, label, select, button, divider, heading, pool);
    return root;
  }

  protected override _replaceHTML(result: HTMLElement, content: HTMLElement): void {
    content.replaceChildren(result);
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
