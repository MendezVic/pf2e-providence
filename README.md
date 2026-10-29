# PF2e Providence

Campaign-wide saved d20 results for Foundry VTT PF2e v14.

Use **Configure Settings → Module Settings → PF2e Providence → Select Actors** to
choose which world actors appear in the dedicated **Providence** sidebar tab. Use
that tab to roll an actor's two Providence d20s and view the shared pool grouped by
actor. Right-click an eligible PF2e check card to spend any saved value as its
reroll. The pool belongs to the campaign rather than to one actor: any saved value
can replace any eligible check, including an enemy's check.

Pool changes and rerolls are handled by the active GM client. A value is reserved
while its reroll runs and is marked used only after PF2e completes that reroll, so
failed or competing requests do not lose saved results. Used values remain visible
in red with a strike-through until that actor rolls a fresh pair.

## Development

```sh
npm ci
npm run check
npm test
npm run build
```

Release tags use the form `v1.2.3`; the release workflow stamps `module.json` with
the tag version before building the installable archive.
