import { Mark } from '@tiptap/core';

export const DiffAddition = Mark.create({
  name: 'diffAddition',

  renderHTML() {
    // Classes are safelisted in tailwind.config.ts
    return ['span', { class: 'diff-addition bg-green-200 rounded px-0.5' }, 0];
  },

  parseHTML() {
    return [{ tag: 'span.diff-addition' }];
  },

  addAttributes() {
    return {
      diffIndex: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-diff-index'),
        renderHTML: (attributes) => {
          if (!attributes.diffIndex) return {};
          return { 'data-diff-index': attributes.diffIndex };
        },
      },
    };
  },
});

export const DiffDeletion = Mark.create({
  name: 'diffDeletion',

  renderHTML() {
    // Classes are safelisted in tailwind.config.ts
    return ['span', { class: 'diff-deletion bg-red-100 line-through rounded px-0.5' }, 0];
  },

  parseHTML() {
    return [{ tag: 'span.diff-deletion' }];
  },

  addAttributes() {
    return {
      diffIndex: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-diff-index'),
        renderHTML: (attributes) => {
          if (!attributes.diffIndex) return {};
          return { 'data-diff-index': attributes.diffIndex };
        },
      },
    };
  },
});

export const DiffUnchanged = Mark.create({
  name: 'diffUnchanged',

  renderHTML() {
    return ['span', { class: 'diff-unchanged' }, 0];
  },

  parseHTML() {
    return [{ tag: 'span.diff-unchanged' }];
  },

  addAttributes() {
    return {
      diffIndex: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-diff-index'),
        renderHTML: (attributes) => {
          if (!attributes.diffIndex) return {};
          return { 'data-diff-index': attributes.diffIndex };
        },
      },
    };
  },
});
