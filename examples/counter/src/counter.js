import { defineComponent } from 'tonk-builder/runtime';

defineComponent('builder-counter', {
  props: { subject: 'entity', count: 'number' },
  key: 'subject',
  setup({ host, props, state, effect, on, command }) {
    const [helpOpen, setHelpOpen] = state(false);

    on('click', '[data-action="bump"]', () => {
      command('bump', { builderCounter: props.subject, amount: 1 });
    });
    on('click', '[data-action="help"]', () => setHelpOpen((open) => !open));

    effect(() => {
      host.querySelector('[data-help]').hidden = !helpOpen();
      host.querySelector('[data-action="help"]').setAttribute('aria-expanded', String(helpOpen()));
    }, () => [helpOpen()]);

    effect(() => {
      host.querySelector('[data-action="bump"]').disabled = props.count === undefined;
    }, () => [props.count]);
  },
});
