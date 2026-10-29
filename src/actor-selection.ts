import { MODULE_ID } from './constants';
import { getSelectedActorIds, SELECTED_ACTORS_SETTING } from './selected-actors';
import { refreshProvidenceSidebar } from './sidebar';

function localize(key: string): string {
  return game.i18n.localize(`${MODULE_ID}.${key}`);
}

const { ApplicationV2 } = foundry.applications.api;

export class ProvidenceActorSelection extends ApplicationV2 {
  static override DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-actor-selection`,
    classes: [MODULE_ID, 'pf2e-providence-actor-selection'],
    window: {
      title: `${MODULE_ID}.setting.actors.name`,
      icon: 'fa-solid fa-users',
      resizable: true,
    },
    position: { width: 520, height: 650 },
  };

  protected override async _renderHTML(): Promise<HTMLElement> {
    const root = document.createElement('form');
    root.className = 'pf2e-providence-selection-form flexcol';

    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = localize('setting.actors.hint');

    const search = document.createElement('input');
    search.type = 'search';
    search.autocomplete = 'off';
    search.placeholder = localize('setting.actors.search');
    search.ariaLabel = localize('setting.actors.search');

    const list = document.createElement('ol');
    list.className = 'pf2e-providence-selection-list';
    const selected = new Set(getSelectedActorIds());
    const actors = game.actors.contents
      .slice()
      .sort((left, right) => left.name.localeCompare(right.name, game.i18n.lang));

    if (actors.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'pf2e-providence-selection-empty';
      empty.textContent = localize('setting.actors.empty');
      list.append(empty);
    }

    for (const actor of actors) {
      const row = document.createElement('li');
      row.className = 'pf2e-providence-selection-actor';
      row.dataset.actorName = actor.name.toLocaleLowerCase(game.i18n.lang);

      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.name = 'actor-id';
      checkbox.value = actor.id;
      checkbox.checked = selected.has(actor.id);

      const image = document.createElement('img');
      image.src = actor.img;
      image.alt = '';
      image.loading = 'lazy';

      const name = document.createElement('span');
      name.textContent = actor.name;
      label.append(checkbox, image, name);
      row.append(label);
      list.append(row);
    }

    search.addEventListener('input', () => {
      const query = search.value.trim().toLocaleLowerCase(game.i18n.lang);
      for (const row of list.querySelectorAll<HTMLElement>('.pf2e-providence-selection-actor')) {
        row.hidden = !row.dataset.actorName?.includes(query);
      }
    });

    const footer = document.createElement('footer');
    footer.className = 'form-footer';
    const save = document.createElement('button');
    save.type = 'submit';
    save.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> ${localize('setting.actors.save')}`;
    footer.append(save);

    root.addEventListener('submit', (event) => {
      event.preventDefault();
      const ids = [...root.querySelectorAll<HTMLInputElement>('input[name="actor-id"]:checked')]
        .map((input) => input.value);
      void game.settings.set(MODULE_ID, SELECTED_ACTORS_SETTING, ids)
        .then(() => this.close())
        .catch((error: unknown) => ui.notifications.error(error instanceof Error ? error.message : String(error)));
    });

    root.append(hint, search, list, footer);
    return root;
  }

  protected override _replaceHTML(result: HTMLElement, content: HTMLElement): void {
    content.replaceChildren(result);
  }
}

export function registerActorSelectionSetting(): void {
  game.settings.register(MODULE_ID, SELECTED_ACTORS_SETTING, {
    name: `${MODULE_ID}.setting.actors.name`,
    hint: `${MODULE_ID}.setting.actors.hint`,
    scope: 'world',
    config: false,
    type: Array,
    default: [],
    onChange: refreshProvidenceSidebar,
  });
  game.settings.registerMenu(MODULE_ID, 'actor-selection', {
    name: `${MODULE_ID}.setting.actors.name`,
    label: `${MODULE_ID}.setting.actors.label`,
    hint: `${MODULE_ID}.setting.actors.hint`,
    icon: 'fa-solid fa-users',
    type: ProvidenceActorSelection,
    restricted: true,
  });
}
